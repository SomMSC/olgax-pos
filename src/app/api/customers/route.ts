import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
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

    // Loyalty points are no longer stored on Customer.
    // Return zero until a dedicated loyalty model is added.
    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        type: customer.type,
      },
      loyalty: {
        enabled: false,
        points: 0,
        earnRate: 0,
        redeemValue: 0,
      },
    });
  } catch (error) {
    console.error("Loyalty GET error:", error);

    return NextResponse.json(
      { error: "Failed to fetch loyalty information" },
      { status: 500 }
    );
  }
}
