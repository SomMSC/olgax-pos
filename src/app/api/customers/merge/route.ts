import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const keepId =
    typeof body.keepId === "string" ? body.keepId : null;

  const mergeId =
    typeof body.mergeId === "string" ? body.mergeId : null;

  if (!keepId || !mergeId) {
    return NextResponse.json(
      { error: "keepId and mergeId are required" },
      { status: 400 }
    );
  }

  if (keepId === mergeId) {
    return NextResponse.json(
      { error: "Cannot merge a customer into itself" },
      { status: 400 }
    );
  }

  try {
    const [keepCustomer, mergeCustomer] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: keepId },
      }),
      prisma.customer.findUnique({
        where: { id: mergeId },
      }),
    ]);

    if (!keepCustomer) {
      return NextResponse.json(
        { error: "Customer to keep was not found" },
        { status: 404 }
      );
    }

    if (!mergeCustomer) {
      return NextResponse.json(
        { error: "Customer to merge was not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Reassign all historical sales from the duplicate
      // customer to the customer being kept.
      await tx.sale.updateMany({
        where: {
          customerId: mergeId,
        },
        data: {
          customerId: keepId,
        },
      });

      // Delete the duplicate customer.
      await tx.customer.delete({
        where: {
          id: mergeId,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      message: "Customers merged successfully",
      customerId: keepId,
    });
  } catch (error) {
    console.error("Merge customers error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to merge customers",
      },
      { status: 500 }
    );
  }
}
