import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search")?.trim() || "";
  const type = searchParams.get("type");
  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") || "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(searchParams.get("limit") || "20", 10) || 20
    )
  );

  const skip = (page - 1) * limit;

  const where = {
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
    ...(type === "STUDENT" || type === "STAFF"
      ? { type }
      : {}),
  };

  try {
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
    console.error("Get customers error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch customers",
      },
      { status: 500 }
    );
  }
}

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

  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const name =
    typeof body.name === "string" ? body.name.trim() : "";

  const type =
    body.type === "STUDENT" || body.type === "STAFF"
      ? body.type
      : null;

  const schoolId =
    typeof body.schoolId === "string"
      ? body.schoolId.trim() || null
      : null;

  const staffId =
    typeof body.staffId === "string"
      ? body.staffId.trim() || null
      : null;

  if (name.length < 2) {
    return NextResponse.json(
      { error: "Name must be at least 2 characters" },
      { status: 400 }
    );
  }

  if (!type) {
    return NextResponse.json(
      { error: "Customer type must be STUDENT or STAFF" },
      { status: 400 }
    );
  }

  if (type === "STUDENT" && !schoolId) {
    return NextResponse.json(
      { error: "School ID is required for students" },
      { status: 400 }
    );
  }

  if (type === "STAFF" && !staffId) {
    return NextResponse.json(
      { error: "Staff ID is required for staff" },
      { status: 400 }
    );
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        name,
        type,
        schoolId: type === "STUDENT" ? schoolId : null,
        staffId: type === "STAFF" ? staffId : null,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        customer,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create customer error:", error);

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
