import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CustomerType } from "@/generated/prisma";

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

    const search = searchParams.get("search")?.trim() || "";
    const type = searchParams.get("type")?.trim() || "";

    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || "1", 10)
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(searchParams.get("limit") || "25", 10)
      )
    );

    const skip = (page - 1) * limit;

    let customerType: CustomerType | undefined;

    if (type === "STUDENT") {
      customerType = CustomerType.STUDENT;
    } else if (type === "STAFF") {
      customerType = CustomerType.STAFF;
    }

    const where = {
      ...(customerType
        ? {
            type: customerType,
          }
        : {}),

      ...(search
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
        : {}),
    };

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
        },
      }),

      prisma.customer.count({
        where,
      }),
    ]);

    return NextResponse.json({
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Customers GET error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch customers",
      },
      {
        status: 500,
      }
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

    const name = String(body.name || "").trim();
    const type = String(body.type || "").trim();

    const schoolId = body.schoolId
      ? String(body.schoolId).trim()
      : null;

    const staffId = body.staffId
      ? String(body.staffId).trim()
      : null;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    let customerType: CustomerType;

    if (type === "STUDENT") {
      customerType = CustomerType.STUDENT;
    } else if (type === "STAFF") {
      customerType = CustomerType.STAFF;
    } else {
      return NextResponse.json(
        {
          error: "Type must be STUDENT or STAFF",
        },
        {
          status: 400,
        }
      );
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        type: customerType,
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
        error: "Failed to create customer",
      },
      {
        status: 500,
      }
    );
  }
}
