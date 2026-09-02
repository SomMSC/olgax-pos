import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

    // Build a properly typed Prisma Customer filter.
    const where: Prisma.CustomerWhereInput = {};

    if (type === "STUDENT" || type === "STAFF") {
      where.type = type;
    }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          schoolId: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          staffId: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

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

    if (type !== "STUDENT" && type !== "STAFF") {
      return NextResponse.json(
        {
          error: "Type must be STUDENT or STAFF",
        },
        { status: 400 }
      );
    }

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
      { error: "Failed to create customer" },
      { status: 500 }
    );
  }
}
