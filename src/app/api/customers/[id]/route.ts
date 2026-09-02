import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  if (session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

// GET /api/customers/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            items: {
              select: {
                id: true,
                name: true,
                quantity: true,
                price: true,
                total: true,
                notes: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Get customer error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch customer",
      },
      { status: 500 }
    );
  }
}

// PUT /api/customers/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized or forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;

  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const name =
    typeof body.name === "string" ? body.name.trim() : undefined;

  const type =
    body.type === "STUDENT" || body.type === "STAFF"
      ? body.type
      : undefined;

  const schoolId =
    typeof body.schoolId === "string"
      ? body.schoolId.trim() || null
      : body.schoolId === null
        ? null
        : undefined;

  const staffId =
    typeof body.staffId === "string"
      ? body.staffId.trim() || null
      : body.staffId === null
        ? null
        : undefined;

  const active =
    typeof body.active === "boolean" ? body.active : undefined;

  if (name !== undefined && name.length < 2) {
    return NextResponse.json(
      { error: "Name must be at least 2 characters" },
      { status: 400 }
    );
  }

  if (type === "STUDENT" && staffId) {
    return NextResponse.json(
      { error: "A student cannot have a Staff ID" },
      { status: 400 }
    );
  }

  if (type === "STAFF" && schoolId) {
    return NextResponse.json(
      { error: "A staff member cannot have a School ID" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.customer.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(schoolId !== undefined ? { schoolId } : {}),
        ...(staffId !== undefined ? { staffId } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      customer,
    });
  } catch (error) {
    console.error("Update customer error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update customer",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/customers/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized or forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Keep historical sales/audit records safe.
    if (customer.sales.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete this customer because they have historical sales. Deactivate the customer instead.",
        },
        { status: 409 }
      );
    }

    await prisma.customer.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete customer error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete customer",
      },
      { status: 500 }
    );
  }
}
