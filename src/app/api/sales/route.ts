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

  // HONESTY CHECKOUT
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
     *
     * The POS sends a unique Idempotency-Key for each checkout.
     *
     * PostgreSQL advisory locking ensures that if the exact same
     * checkout request arrives twice at nearly the same time,
     * only one request can create the sale.
     *
     * The key is also stored in the sale notes using a private
     * marker so no database schema change is required.
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
     * Create sale and update inventory atomically
     * ----------------------------------------------------------
     */

    const sale =
      await prisma.$transaction(
        async (tx) => {
          /*
           * PostgreSQL transaction-level advisory lock.
           *
           * hashtext() converts the checkout key into a PostgreSQL
           * advisory-lock identifier.
           *
           * This means two requests with the same Idempotency-Key
           * cannot execute this protected section simultaneously.
           */
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${idempotencyKey})
            )
          `;

          /*
           * Look for a previously completed request using this
           * exact idempotency key.
           *
           * The private marker prevents the key from being confused
           * with an ordinary customer note.
           */
          const idempotencyMarker =
            `[IDEMPOTENCY_KEY:${idempotencyKey}]`;

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
            return existing;
          }

          /*
           * Preserve the user's note while adding the internal
           * idempotency marker.
           */
          const saleNotes =
            note
              ? `${note}\n${idempotencyMarker}`
              : idempotencyMarker;

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

                notes: saleNotes,

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
           * Decrement stock
           * ----------------------------------------------------
           */

          for (const item of items) {
            await tx.product.update({
              where: {
                id: item.productId,
              },
              data: {
                stock: {
                  decrement:
                    item.quantity,
                },
              },
            });
          }

          return created;
        }
      );

    /*
     * ----------------------------------------------------------
     * Fire plugin hook
     *
     * Do NOT fire the hook again when this was a duplicate
     * request that returned an existing sale.
     * ----------------------------------------------------------
     */

    const idempotencyMarker =
      `[IDEMPOTENCY_KEY:${idempotencyKey}]`;

    const wasAlreadyCreated =
      sale.notes?.includes(
        idempotencyMarker
      ) &&
      sale.createdAt <
        new Date(
          Date.now() - 1000
        );

    /*
     * The marker is present on every sale, so the safest way to
     * identify a duplicate response is to check whether this
     * request's sale was created before this request reached the
     * response stage.
     *
     * We additionally keep plugin execution best-effort.
     */
    if (!wasAlreadyCreated) {
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
    }

    return NextResponse.json(
      { sale },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Sales POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to create sale",
      },
      { status: 500 }
    );
  }
}
