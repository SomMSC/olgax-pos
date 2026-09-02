import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function isCustomerType(value: unknown): value is "STUDENT" | "STAFF" {
  return value === "STUDENT" || value === "STAFF";
}

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

    const search =
      searchParams.get("q")?.trim() ||
      searchParams.get("search")?.trim() ||
      "";

    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);

    const page = Number.isFinite(pageParam)
      ? Math.max(1, pageParam)
      : 1;

    const limit = Number.isFinite(limitParam)
      ? Math.min(100, Math.max(1, limitParam))
      : 10;

    const skip = (page - 1) * limit;

    const where =
      search.length > 0
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                schoolId: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                staffId: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: {
          name: "asc",
        },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          type: true,
          schoolId: true,
          staffId: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              sales: true,
            },
          },
        },
      }),

      prisma.customer.count({
        where,
      }),
    ]);

    const formattedCustomers = customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      type: customer.type,
      schoolId: customer.schoolId,
      staffId: customer.staffId,
      active: customer.active,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,

      // Compatibility fields for the customers page.
      phone: undefined,
      email: undefined,
      notes: undefined,
      loyaltyPoints: 0,
      totalSpend: 0,
      lastVisit: null,
      visitCount: customer._count.sales,
    }));

    return NextResponse.json({
      customers: formattedCustomers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Customers GET error:", error);

    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const type = body.type;

    const schoolId =
      typeof body.schoolId === "string" && body.schoolId.trim()
        ? body.schoolId.trim()
        : null;

    const staffId =
      typeof body.staffId === "string" && body.staffId.trim()
        ? body.staffId.trim()
        : null;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!isCustomerType(type)) {
      return NextResponse.json(
        {
          error: "Customer type must be STUDENT or STAFF",
        },
        { status: 400 }
      );
    }

    // Do not accept or store phone/email.
    const customer = await prisma.customer.create({
      data: {
        name,
        type,
        schoolId,
        staffId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        schoolId: true,
        staffId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(customer, {
      status: 201,
    });
  } catch (error) {
    console.error("Customers POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create customer",
      },
      { status: 500 }
    );
  }
}
