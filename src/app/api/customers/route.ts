import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireSession(request: NextRequest) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

// ============================================================
// GET /api/customers
// List customers with search + pagination
// ============================================================

export async function GET(request: NextRequest) {
  const session = await requireSession(request);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);

    const query = searchParams.get("q")?.trim() || "";
    const pageParam = Number(searchParams.get("page") || "1");
    const limitParam = Number(searchParams.get("limit") || "10");

    const page = Number.isFinite(pageParam)
      ? Math.max(1, pageParam)
      : 1;

    const limit = Number.isFinite(limitParam)
      ? Math.min(100, Math.max(1, limitParam))
      : 10;

    const skip = (page - 1) * limit;

    const where = query
      ? {
          active: true,
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              schoolId: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              staffId: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {
          active: true,
        };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        include: {
          sales: {
            where: {
              status: "COMPLETED",
            },
            select: {
              total: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      }),

      prisma.customer.count({
        where,
      }),
    ]);

    const formattedCustomers = customers.map((customer) => {
      const totalSpend = customer.sales.reduce(
        (sum, sale) => sum + Number(sale.total),
        0
      );

      const lastVisit =
        customer.sales.length > 0
          ? customer.sales[0].createdAt
          : null;

      return {
        id: customer.id,
        name: customer.name,
        type: customer.type,
        schoolId: customer.schoolId,
        staffId: customer.staffId,
        loyaltyPoints: 0,
        totalSpend,
        lastVisit,
        visitCount: customer.sales.length,
        createdAt: customer.createdAt,
      };
    });

    return NextResponse.json({
      customers: formattedCustomers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(
          1,
          Math.ceil(total / limit)
        ),
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

// ============================================================
// POST /api/customers
// Create a new customer
// ============================================================

export async function POST(request: NextRequest) {
  const session = await requireSession(request);

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
      typeof body.schoolId === "string" &&
      body.schoolId.trim()
        ? body.schoolId.trim()
        : null;

    const staffId =
      typeof body.staffId === "string" &&
      body.staffId.trim()
        ? body.staffId.trim()
        : null;

    // --------------------------------------------------------
    // Validation
    // --------------------------------------------------------

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (type !== "STUDENT" && type !== "STAFF") {
      return NextResponse.json(
        {
          error:
            "Customer type must be STUDENT or STAFF",
        },
        { status: 400 }
      );
    }

    // Student should use schoolId.
    // Staff should use staffId.
    const finalSchoolId =
      type === "STUDENT" ? schoolId : null;

    const finalStaffId =
      type === "STAFF" ? staffId : null;

    // --------------------------------------------------------
    // Create customer
    // --------------------------------------------------------

    const customer = await prisma.customer.create({
      data: {
        name,
        type,
        schoolId: finalSchoolId,
        staffId: finalStaffId,
        active: true,
      },
    });

    return NextResponse.json(
      {
        customer: {
          id: customer.id,
          name: customer.name,
          type: customer.type,
          schoolId: customer.schoolId,
          staffId: customer.staffId,
          loyaltyPoints: 0,
          totalSpend: 0,
          lastVisit: null,
          visitCount: 0,
          createdAt: customer.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Customers POST error:", error);

    return NextResponse.json(
      { error: "Failed to create customer" },
      { status: 500 }
    );
  }
}
