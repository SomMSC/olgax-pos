import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const checkoutSchema = z.object({
  studentName: z.string().trim().min(1).max(150),
  schoolId: z.string().trim().min(1).max(100),

  paymentMethod: z.enum(["CASH", "CARD"]),

  cashDeclared: z.boolean().default(false),

  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      })
    )
    .min(1)
    .max(50),
});

export async function POST(request: NextRequest) {
  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim();

  if (!idempotencyKey) {
    return NextResponse.json(
      {
        error: "Missing checkout key. Please try again.",
      },
      { status: 400 }
    );
  }

  if (idempotencyKey.length > 200) {
    return NextResponse.json(
      {
        error: "Invalid checkout key.",
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid checkout information.",
        },
        { status: 400 }
      );
    }

    const {
      studentName,
      schoolId,
      paymentMethod,
      cashDeclared,
      items,
    } = parsed.data;

    /*
     * Honesty-canteen rule:
     * Cash is automatically accepted when the
     * student declares that the cash was paid.
     */
    if (
      paymentMethod === "CASH" &&
      !cashDeclared
    ) {
      return NextResponse.json(
        {
          error:
            "Please confirm that you have paid the cash.",
        },
        { status: 400 }
      );
    }

    /*
     * Cashless will be connected to a real payment
     * provider later. Do not create a completed sale
     * until the provider confirms payment.
     */
    if (paymentMethod === "CARD") {
      return NextResponse.json(
        {
          error:
            "Cashless payment is not yet connected to a payment provider.",
        },
        { status: 400 }
      );
    }

    const sale = await prisma.$transaction(
      async (tx) => {
        /*
         * Prevent two simultaneous requests with the
         * same checkout key from creating two sales.
         */
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${idempotencyKey})
          )
        `;

        const marker =
          `[ONLINE_STORE_IDEMPOTENCY:${idempotencyKey}]`;

        const existing =
          await tx.sale.findFirst({
            where: {
              notes: {
                contains: marker,
              },
            },
            include: {
              items: true,
              customer: true,
            },
          });

        if (existing) {
          return existing;
        }

        /*
         * Sales require a userId in the current schema.
         * Since the storefront has no employee account,
         * use the existing ADMIN account as the system
         * owner of the online sale.
         */
        const admin =
          await tx.user.findFirst({
            where: {
              role: "ADMIN",
            },
            select: {
              id: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          });

        if (!admin) {
          throw new Error("NO_ADMIN_USER");
        }

        /*
         * Find the student by school ID.
         * If the student does not exist yet, create them.
         */
        let customer =
          await tx.customer.findFirst({
            where: {
              type: "STUDENT",
              schoolId,
              active: true,
            },
          });

        if (!customer) {
          customer =
            await tx.customer.create({
              data: {
                name: studentName,
                type: "STUDENT",
                schoolId,
                active: true,
              },
            });
        } else if (
          customer.name !== studentName
        ) {
          customer =
            await tx.customer.update({
              where: {
                id: customer.id,
              },
              data: {
                name: studentName,
              },
            });
        }

        const productIds = [
          ...new Set(
            items.map(
              (item) => item.productId
            )
          ),
        ];

        const products =
          await tx.product.findMany({
            where: {
              id: {
                in: productIds,
              },
              active: true,
            },
            select: {
              id: true,
              name: true,
              price: true,
              stock: true,
            },
          });

        const productMap = new Map(
          products.map((product) => [
            product.id,
            product,
          ])
        );

        let subtotal = 0;

        const saleItems = items.map(
          (item) => {
            const product =
              productMap.get(
                item.productId
              );

            if (!product) {
              throw new Error(
                `PRODUCT_NOT_FOUND:${item.productId}`
              );
            }

            if (
              product.stock <
              item.quantity
            ) {
              throw new Error(
                `INSUFFICIENT_STOCK:${product.name}`
              );
            }

            const price =
              Number(product.price);

            const lineTotal =
              price * item.quantity;

            subtotal += lineTotal;

            return {
              productId: product.id,
              name: product.name,
              price,
              quantity: item.quantity,
              total: lineTotal,
            };
          }
        );

        /*
         * Current storefront starts with zero tax.
         * We can connect this to the existing settings
         * later if needed.
         */
        const taxRate = 0;
        const taxAmount = 0;

        const total =
          subtotal + taxAmount;

        const notes =
          `${marker}\n[ONLINE_STORE]\nCash declared: ${
            paymentMethod === "CASH"
          }`;

        const created =
          await tx.sale.create({
            data: {
              userId: admin.id,
              customerId: customer.id,

              subtotal,
              taxRate,
              taxAmount,

              discountAmount: 0,
              tipAmount: 0,

              total,

              paymentMethod: "CASH",

              amountTendered: total,
              changeDue: 0,

              status: "COMPLETED",

              notes,

              items: {
                create: saleItems,
              },
            },

            include: {
              items: true,
              customer: true,
            },
          });

        /*
         * Atomic inventory protection.
         *
         * The stock can only decrease if enough stock
         * still exists at the exact moment of checkout.
         */
        for (const item of items) {
          const stockUpdate =
            await tx.product.updateMany({
              where: {
                id: item.productId,
                active: true,
                stock: {
                  gte: item.quantity,
                },
              },
              data: {
                stock: {
                  decrement:
                    item.quantity,
                },
              },
            });

          if (
            stockUpdate.count !== 1
          ) {
            throw new Error(
              `INSUFFICIENT_STOCK:${
                productMap.get(
                  item.productId
                )?.name ?? "Product"
              }`
            );
          }
        }

        return created;
      }
    );

    return NextResponse.json(
      {
        success: true,

        sale: {
          id: sale.id,
          total: Number(sale.total),
          customerName:
            sale.customer?.name ??
            studentName,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Store checkout error:",
      error
    );

    if (
      error instanceof Error &&
      error.message === "NO_ADMIN_USER"
    ) {
      return NextResponse.json(
        {
          error:
            "The store is not configured yet. Please contact the administrator.",
        },
        { status: 503 }
      );
    }

    if (
      error instanceof Error &&
      error.message.startsWith(
        "INSUFFICIENT_STOCK:"
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Insufficient stock for ${
              error.message.replace(
                "INSUFFICIENT_STOCK:",
                ""
              )
            }.`,
        },
        { status: 409 }
      );
    }

    if (
      error instanceof Error &&
      error.message.startsWith(
        "PRODUCT_NOT_FOUND:"
      )
    ) {
      return NextResponse.json(
        {
          error:
            "One of the selected products is no longer available.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Checkout could not be completed. Please try again.",
      },
      { status: 500 }
    );
  }
}
