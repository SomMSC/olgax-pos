import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  stock: true,
  category: true,
  imageUrl: true,
  sku: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const q =
      request.nextUrl.searchParams.get("q")?.trim() ?? "";

    const category =
      request.nextUrl.searchParams.get("category")?.trim() ?? "";

    const products = await prisma.product.findMany({
      where: {
        active: true,
        stock: {
          gt: 0,
        },

        ...(category
          ? {
              category: {
                equals: category,
                mode: "insensitive",
              },
            }
          : {}),

        ...(q
          ? {
              OR: [
                {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  sku: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      },

      select: PRODUCT_SELECT,

      orderBy: {
        name: "asc",
      },

      take: 200,
    });

    const categories = await prisma.product.findMany({
      where: {
        active: true,
        stock: {
          gt: 0,
        },
        category: {
          not: null,
        },
      },

      select: {
        category: true,
      },

      distinct: ["category"],

      orderBy: {
        category: "asc",
      },
    });

    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        price: Number(product.price),
      })),

      categories: categories
        .map((item) => item.category)
        .filter(
          (value): value is string =>
            Boolean(value)
        ),
    });
  } catch (error) {
    console.error(
      "Store products error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load products.",
      },
      {
        status: 500,
      }
    );
  }
}
