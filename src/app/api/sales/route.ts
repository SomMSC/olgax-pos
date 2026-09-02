import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { pluginRegistry } from "@/lib/plugins";

const saleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        name: z.string(),
        price: z.number(),
        quantity: z.number().int().min(1),
        notes: z.string().optional(),
      })
    )
    .min(1),

  paymentMethod: z
    .enum(["CASH", "CARD", "OTHER"])
    .default("CASH"),

  amountTendered: z.number().optional(),

  paymentLines: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "OTHER"]),
        amount: z.number().min(0),
      })
    )
    .optional(),

  tipAmount: z.number().min(0).default(0),

  taxRate: z.number().min(0).max(1).default(0),

  discountAmount: z.number().min(0).default(0),

  discountType: z
    .enum(["fixed", "percent"])
    .default("fixed"),

  note: z.string().optional(),

  customerId: z.string().optional(),

  honestyPayment: z.boolean().default(false),

  cashDeclared: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    /*
     * ----------------------------------------------------------
     * SERVER-SIDE IDEMPOTENCY PROTECTION
     * ----------------------------------------------------------
     */

    const idempotencyKey =
      req.headers.get("Idempotency-Key")?.trim();

    if (!idempotencyKey) {
      return NextResponse.json(
        {
          error:
            "Missing Idempotency-Key. Please retry the checkout.",
        },
        { status: 400 }
      );
    }

    if (idempotencyKey.length > 200) {
      return NextResponse.json(
        {
          error: "Invalid Idempotency-Key.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();

    const parsed = saleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const {
      items,
      paymentMethod,
      amountTendered,
      paymentLines,
      tipAmount,
      taxRate,
      discountAmount,
      discountType,
      note,
      customerId,
      honestyPayment,
      cashDeclared,
    } = parsed.data;

    /*
     * ----------------------------------------------------------
     * HONESTY PAYMENT VALIDATION
     * ----------------------------------------------------------
     */

    if (honestyPayment) {
      if (!customerId) {
        return NextResponse.json(
          {
            error:
              "A student/customer must be identified before honesty checkout.",
          },
          { status: 400 }
        );
      }

      if (!cashDeclared) {
        return NextResponse.json(
          {
            error:
              "Cash payment declaration is required.",
          },
          { status: 400 }
        );
      }

      if (paymentMethod !== "CASH") {
        return NextResponse.json(
          {
            error:
              "Honesty cash checkout must use CASH payment.",
          },
          { status: 400 }
        );
      }

      if (
        paymentLines &&
        paymentLines.length > 0
      ) {
        return NextResponse.json(
          {
            error:
              "Split payments are not allowed for honesty checkout.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * Direct CARD / OTHER sales are not allowed unless a real
     * payment provider has confirmed the transaction.
     */
    if (
      !honestyPayment &&
      (paymentMethod === "CARD" ||
        paymentMethod === "OTHER")
    ) {
      return NextResponse.json(
        {
          error:
            "Cashless payment requires payment provider confirmation.",
        },
        { status: 400 }
      );
    }

    /*
     * ----------------------------------------------------------
     * Validate customer
     * ----------------------------------------------------------
     */

    if (customerId) {
      const customer =
        await prisma.customer.findUnique({
          where: {
            id: customerId,
          },
          select: {
            id: true,
            active: true,
          },
        });

      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }

      if (!customer.active) {
        return NextResponse.json(
          { error: "Customer is inactive" },
          { status: 400 }
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * Determine primary payment method
     * ----------------------------------------------------------
     */

    const effectiveMethod:
      | "CASH"
      | "CARD"
      | "OTHER" =
      paymentLines &&
      paymentLines.length > 0
        ? paymentLines.reduce((a, b) =>
            a.amount >= b.amount ? a : b
          ).method
        : paymentMethod;

    /*
     * ----------------------------------------------------------
     * Calculate totals
     * ----------------------------------------------------------
     */

    const subtotal = items.reduce(
      (sum, item) =>
        sum + item.price * item.quantity,
      0
    );

    const discountValue =
      discountType === "percent"
        ? (subtotal * discountAmount) / 100
        : Math.min(
            discountAmount,
            subtotal
          );

    const taxableSubtotal = Math.max(
      0,
      subtotal - discountValue
    );

    const taxAmt =
      taxableSubtotal * taxRate;

    const total =
      taxableSubtotal +
      taxAmt +
      (tipAmount ?? 0);

    /*
     * ----------------------------------------------------------
     * Calculate payment and change
     * ----------------------------------------------------------
     */

    const paidTotal =
      paymentLines &&
      paymentLines.length > 0
        ? paymentLines.reduce(
            (sum, payment) =>
              sum + payment.amount,
            0
          )
        : honestyPayment
        ? total
        : (amountTendered ?? 0);

    const hasCashPayment =
      effectiveMethod === "CASH" ||
      Boolean(
        paymentLines?.some(
          (payment) =>
            payment.method === "CASH"
        )
      );

    const changeDue = hasCashPayment
      ? Math.max(
          0,
          paidTotal - total
        )
      : undefined;

    /*
     * ----------------------------------------------------------
     * Create sale + update inventory atomically
     * ----------------------------------------------------------
     */

    let wasDuplicate = false;

    const sale =
      await prisma.$transaction(
        async (tx) => {
          /*
           * Only one transaction with this exact checkout key
           * can enter this protected section at a time.
           */
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${idempotencyKey})
            )
          `;

          const idempotencyMarker =
            `[IDEMPOTENCY_KEY:${idempotencyKey}]`;

          /*
           * If this exact checkout was already completed,
           * return the existing sale instead of creating another.
           */
          const existing =
            await tx.sale.findFirst({
              where: {
                notes: {
                  contains:
                    idempotencyMarker,
                },
              },
              include: {
                items: true,
              },
              orderBy: {
                createdAt: "desc",
              },
            });

          if (existing) {
            wasDuplicate = true;
            return existing;
          }

          const saleNotes =
            note
              ? `${note}\n${idempotencyMarker}`
              : idempotencyMarker;

          /*
           * ----------------------------------------------------
           * Create sale
           * ----------------------------------------------------
           */

          const created =
            await tx.sale.create({
              data: {
                userId:
                  session.user.id,

                customerId:
                  customerId || undefined,

                subtotal,

                taxRate,

                taxAmount:
                  taxAmt,

                discountAmount:
                  discountValue,

                tipAmount:
                  tipAmount ?? 0,

                total,

                paymentMethod:
                  effectiveMethod,

                paymentLines:
                  paymentLines &&
                  paymentLines.length > 0
                    ? paymentLines
                    : undefined,

                amountTendered:
                  amountTendered ??
                  (paidTotal > 0
                    ? paidTotal
                    : undefined),

                changeDue,

                notes:
                  saleNotes,

                items: {
                  create:
                    items.map(
                      (item) => ({
                        productId:
                          item.productId,

                        name:
                          item.name,

                        price:
                          item.price,

                        quantity:
                          item.quantity,

                        total:
                          item.price *
                          item.quantity,

                        notes:
                          item.notes ??
                          undefined,
                      })
                    ),
                },
              },

              include: {
                items: true,
              },
            });

          /*
           * ----------------------------------------------------
           * SAFE INVENTORY DEDUCTION
           * ----------------------------------------------------
           *
           * The WHERE condition requires enough stock.
           *
           * Example:
           * stock = 1
           * requested = 2
           *
           * updateMany affects 0 rows.
           * We throw an error.
           * The entire Prisma transaction rolls back.
           *
           * Therefore:
           * - no sale remains
           * - no SaleItems remain
           * - inventory is unchanged
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

            if (stockUpdate.count !== 1) {
              throw new Error(
                `INSUFFICIENT_STOCK:${item.name}`
              );
            }
          }

          return created;
        }
      );

    /*
     * ----------------------------------------------------------
     * Duplicate request
     * ----------------------------------------------------------
     *
     * Return the original sale.
     * Do NOT fire the sale-complete plugin again.
     */

    if (wasDuplicate) {
      return NextResponse.json(
        {
          sale,
          duplicate: true,
        },
        { status: 200 }
      );
    }

    /*
     * ----------------------------------------------------------
     * Fire plugin hook
     * ----------------------------------------------------------
     */

    pluginRegistry
      .fire("onSaleComplete", {
        saleId: sale.id,

        total: parseFloat(
          sale.total.toString()
        ),

        taxAmount: parseFloat(
          sale.taxAmount?.toString() ??
            "0"
        ),

        tipAmount: parseFloat(
          sale.tipAmount?.toString() ??
            "0"
        ),

        items: sale.items.map(
          (item: {
            productId:
              | string
              | null;
            name: string;
            quantity: number;
            price: {
              toString(): string;
            };
          }) => ({
            productId:
              item.productId,

            name:
              item.name,

            quantity:
              item.quantity,

            price: parseFloat(
              item.price.toString()
            ),
          })
        ),

        customerId:
          sale.customerId ?? null,

        paymentMethod:
          sale.paymentMethod,

        loyaltyPointsUsed: 0,
      })
      .catch(() => {
        // Plugin errors are handled internally.
      });

    return NextResponse.json(
      { sale },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Sales POST error:",
      error
    );

    /*
     * Inventory protection returns HTTP 409 instead of
     * a generic 500 error.
     */
    if (
      error instanceof Error &&
      error.message.startsWith(
        "INSUFFICIENT_STOCK:"
      )
    ) {
      const productName =
        error.message.replace(
          "INSUFFICIENT_STOCK:",
          ""
        );

      return NextResponse.json(
        {
          error: `Insufficient stock for ${productName}. The sale was not completed.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Failed to create sale",
      },
      { status: 500 }
    );
  }
}
