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
    } = parsed.data;

    // ----------------------------------------------------------
    // Validate customer
    // ----------------------------------------------------------

    if (customerId) {
      const customer = await prisma.customer.findUnique({
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

    // ----------------------------------------------------------
    // Determine primary payment method
    // ----------------------------------------------------------

    const effectiveMethod: "CASH" | "CARD" | "OTHER" =
      paymentLines && paymentLines.length > 0
        ? paymentLines.reduce((a, b) =>
            a.amount >= b.amount ? a : b
          ).method
        : paymentMethod;

    // ----------------------------------------------------------
    // Calculate totals
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // Calculate payment and change
    // ----------------------------------------------------------

    const paidTotal =
      paymentLines &&
      paymentLines.length > 0
        ? paymentLines.reduce(
            (sum, payment) =>
              sum + payment.amount,
            0
          )
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

    // ----------------------------------------------------------
    // Create sale and update inventory atomically
    // ----------------------------------------------------------

    const sale =
      await prisma.$transaction(
        async (tx) => {
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

                notes: note,

                items: {
                  create:
                    items.map(
                      (item) => ({
                        productId:
                          item.productId,
                        name: item.name,
                        price: item.price,
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

          // ----------------------------------------------------
          // Decrement stock
          // ----------------------------------------------------

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

    // ----------------------------------------------------------
    // Fire plugin hook
    //
    // loyaltyPointsUsed is retained only because the existing
    // plugin payload type requires it. Loyalty is not stored or
    // processed by this route.
    // ----------------------------------------------------------

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
            name: item.name,
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

    return NextResponse.json(
      {
        error:
          "Failed to create sale",
      },
      { status: 500 }
    );
  }
}
