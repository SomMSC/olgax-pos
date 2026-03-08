import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { pluginRegistry } from "@/lib/plugins";

const saleSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      price: z.number(),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    })
  ).min(1),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
  amountTendered: z.number().optional(),
  paymentLines: z.array(z.object({
    method: z.enum(["CASH", "CARD", "OTHER"]),
    amount: z.number().min(0),
  })).optional(),
  tipAmount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(1).default(0),
  discountAmount: z.number().min(0).default(0),
  discountType: z.enum(["fixed", "percent"]).default("fixed"),
  note: z.string().optional(),
  customerId: z.string().optional(),
  /** Loyalty points to redeem as discount (0 = no redemption) */
  loyaltyPointsUsed: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { items, paymentMethod, amountTendered, paymentLines, tipAmount, taxRate, discountAmount, discountType, note, customerId, loyaltyPointsUsed } =
    parsed.data;

  // Derive primary paymentMethod from largest split-tender line (if split mode)
  const effectiveMethod: "CASH" | "CARD" | "OTHER" =
    paymentLines && paymentLines.length > 0
      ? (paymentLines.reduce((a, b) => (a.amount >= b.amount ? a : b)).method as "CASH" | "CARD" | "OTHER")
      : paymentMethod;

  // Load loyalty settings if customer is attached
  let loyaltySettings: { enabled: boolean; earnRate: number; redeemValue: number } | null = null;
  if (customerId) {
    const settings = await prisma.businessSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.loyaltyEnabled) {
      loyaltySettings = {
        enabled: true,
        earnRate: parseFloat(settings.loyaltyEarnRate.toString()),
        redeemValue: parseFloat(settings.loyaltyRedeemValue.toString()),
      };
    }
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountValue =
    discountType === "percent" ? (subtotal * discountAmount) / 100 : Math.min(discountAmount, subtotal);
  // Loyalty redemption discount (points / redeemValue = $ discount)
  const loyaltyDiscount = loyaltySettings && loyaltyPointsUsed > 0
    ? loyaltyPointsUsed / loyaltySettings.redeemValue
    : 0;
  const totalDiscount = discountValue + loyaltyDiscount;
  const taxAmt = (subtotal - totalDiscount) * taxRate;
  const total = subtotal - totalDiscount + taxAmt + (tipAmount ?? 0);

  // Change due: cash single-method or from split lines total
  const paidTotal = paymentLines && paymentLines.length > 0
    ? paymentLines.reduce((s, p) => s + p.amount, 0)
    : (amountTendered ?? 0);
  const changeDue =
    (effectiveMethod === "CASH" || (paymentLines?.some((p) => p.method === "CASH")))
      ? Math.max(0, paidTotal - total)
      : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sale = await prisma.$transaction(async (tx: any) => {
    const created = await tx.sale.create({
      data: {
        userId: session.user.id,
        customerId: customerId || undefined,
        subtotal,
        taxRate,
        taxAmount: taxAmt,
        discountAmount: totalDiscount,
        tipAmount: tipAmount ?? 0,
        total,
        paymentMethod: effectiveMethod,
        paymentLines: paymentLines && paymentLines.length > 0 ? paymentLines : undefined,
        amountTendered: amountTendered ?? (paidTotal > 0 ? paidTotal : undefined),
        changeDue,
        notes: note,
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            total: i.price * i.quantity,
            notes: i.notes ?? undefined,
          })),
        },
      },
      include: { items: true },
    });

    // Decrement stock
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    // Loyalty points: deduct redeemed, award earned
    if (customerId && loyaltySettings?.enabled) {
      const earnedPoints = Math.floor(total * loyaltySettings.earnRate);
      type LogEntry = { customerId: string; saleId: string; delta: number; type: "EARN" | "REDEEM" | "ADJUST"; note: string };
      const logs: LogEntry[] = [];

      if (loyaltyPointsUsed > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { decrement: loyaltyPointsUsed } },
        });
        logs.push({ customerId, saleId: created.id, delta: -loyaltyPointsUsed, type: "REDEEM" as const, note: `Redeemed ${loyaltyPointsUsed} pts` });
      }
      if (earnedPoints > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: earnedPoints } },
        });
        logs.push({ customerId, saleId: created.id, delta: earnedPoints, type: "EARN" as const, note: `Earned on sale` });
      }
      for (const log of logs) {
        await tx.loyaltyLog.create({ data: log });
      }
    }

    return created;
  });

  // Fire plugin hook (non-blocking — errors are caught inside fire())
  pluginRegistry.fire("onSaleComplete", {
    saleId: sale.id,
    total: parseFloat(sale.total.toString()),
    taxAmount: parseFloat(sale.taxAmount?.toString() ?? "0"),
    tipAmount: parseFloat(sale.tipAmount?.toString() ?? "0"),
    items: sale.items.map((i: { productId: string | null; name: string; quantity: number; price: { toString(): string } }) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      price: parseFloat(i.price.toString()),
    })),
    customerId: sale.customerId ?? null,
    paymentMethod: sale.paymentMethod,
    loyaltyPointsUsed: loyaltyPointsUsed || 0,
  }).catch(() => {/* handled inside fire() */});

  return NextResponse.json({ sale }, { status: 201 });
}
