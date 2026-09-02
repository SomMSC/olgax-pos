import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/loyalty?customerId=...
 *
 * Loyalty is currently disabled because the current Prisma schema
 * does not store loyalty points.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const customerId = req.nextUrl.searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId required" },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.findUnique({
    where: {
      id: customerId,
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });

  if (!customer) {
    return NextResponse.json(
      { error: "Customer not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    points: 0,
    enabled: false,
    earnRate: 0,
    redeemValue: 0,
    maxRedeemDiscount: 0,
  });
}
