"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  X,
  CheckCircle2,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string | null;
  imageUrl: string | null;
  sku: string | null;
};

type CartItem = Product & {
  quantity: number;
};

type SuccessData = {
  saleId: string;
  total: number;
  customerName: string;
};

export default function StorePage() {
  const [products, setProducts] =
    useState<Product[]>([]);

  const [categories, setCategories] =
    useState<string[]>([]);

  const [search, setSearch] =
    useState("");

  const [category, setCategory] =
    useState("");

  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [studentName, setStudentName] =
    useState("");

  const [schoolId, setSchoolId] =
    useState("");

  const [paymentMethod, setPaymentMethod] =
    useState<"CASH" | "CARD">("CASH");

  const [cashDeclared, setCashDeclared] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [checkoutLoading, setCheckoutLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<SuccessData | null>(null);

  async function loadProducts() {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("q", search.trim());
      }

      if (category) {
        params.set("category", category);
      }

      const queryString =
        params.toString();

      const response = await fetch(
        queryString
          ? `/api/store/products?${queryString}`
          : "/api/store/products",
        {
          cache: "no-store",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Unable to load products."
        );
      }

      setProducts(
        Array.isArray(data.products)
          ? data.products
          : []
      );

      setCategories(
        Array.isArray(data.categories)
          ? data.categories
          : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load products."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, [search, category]);

  function addToCart(product: Product) {
    setError(null);

    setCart((current) => {
      const existing =
        current.find(
          (item) =>
            item.id === product.id
        );

      if (existing) {
        if (
          existing.quantity >=
          product.stock
        ) {
          return current;
        }

        return current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity:
                  item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  }

  function changeQuantity(
    productId: string,
    delta: number
  ) {
    setCart((current) =>
      current
        .map((item) => {
          if (
            item.id !== productId
          ) {
            return item;
          }

          const quantity =
            item.quantity + delta;

          if (quantity <= 0) {
            return null;
          }

          if (
            quantity > item.stock
          ) {
            return item;
          }

          return {
            ...item,
            quantity,
          };
        })
        .filter(
          (
            item
          ): item is CartItem =>
            item !== null
        )
    );
  }

  function removeFromCart(
    productId: string
  ) {
    setCart((current) =>
      current.filter(
        (item) =>
          item.id !== productId
      )
    );
  }

  const cartQuantity = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + item.quantity,
        0
      ),
    [cart]
  );

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          item.price *
            item.quantity,
        0
      ),
    [cart]
  );

  async function checkout() {
    if (checkoutLoading) {
      return;
    }

    setError(null);

    if (!studentName.trim()) {
      setError(
        "Please enter the student's name."
      );
      return;
    }

    if (!schoolId.trim()) {
      setError(
        "Please enter the student's school ID."
      );
      return;
    }

    if (cart.length === 0) {
      setError(
        "Your cart is empty."
      );
      return;
    }

    if (
      paymentMethod === "CASH" &&
      !cashDeclared
    ) {
      setError(
        "Please confirm that you have paid the cash."
      );
      return;
    }

    if (paymentMethod === "CARD") {
      setError(
        "Cashless payment will be available after a payment provider is connected."
      );
      return;
    }

    setCheckoutLoading(true);

    const idempotencyKey =
      crypto.randomUUID();

    try {
      const response = await fetch(
        "/api/store/checkout",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "Idempotency-Key":
              idempotencyKey,
          },
          body: JSON.stringify({
            studentName:
              studentName.trim(),

            schoolId:
              schoolId.trim(),

            paymentMethod,

            cashDeclared,

            items: cart.map(
              (item) => ({
                productId:
                  item.id,
                quantity:
                  item.quantity,
              })
            ),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Checkout failed."
        );
      }

      setSuccess({
        saleId: data.sale.id,
        total: Number(
          data.sale.total
        ),
        customerName:
          data.sale.customerName ??
          studentName.trim(),
      });

      setCart([]);
      setStudentName("");
      setSchoolId("");
      setCashDeclared(false);
      setPaymentMethod("CASH");

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Checkout failed."
      );
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">
              School Canteen
            </h1>

            <p className="text-xs text-muted-foreground">
              Honesty Store
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium">
            <ShoppingCart className="h-4 w-4" />

            {cartQuantity}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <section className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search products..."
              className="w-full rounded-lg border bg-background py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() =>
                setCategory("")
              }
              className={`rounded-full px-4 py-2 text-sm ${
                !category
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary"
              }`}
            >
              All
            </button>

            {categories.map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    setCategory(item)
                  }
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${
                    category === item
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary"
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            {error}
          </div>
        )}

        {success && (
          <section className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6" />

              <div>
                <h2 className="font-semibold">
                  Payment recorded
                </h2>

                <p className="mt-1 text-sm">
                  Thank you,{" "}
                  {success.customerName}.
                  Your purchase has been
                  automatically completed.
                </p>

                <p className="mt-3 text-sm font-medium">
                  Sale:{" "}
                  {success.saleId}
                </p>

                <p className="text-lg font-bold">
                  ₱
                  {success.total.toFixed(
                    2
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setSuccess(null)
              }
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Continue Shopping
            </button>
          </section>
        )}

        {loading ? (
          <div className="py-20 text-center text-muted-foreground">
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            No products available.
          </div>
        ) : (
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map(
              (product) => (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-xl border bg-card"
                >
                  <div className="aspect-square bg-muted">
                    {product.imageUrl ? (
                      <img
                        src={
                          product.imageUrl
                        }
                        alt={
                          product.name
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                        {product.name}
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <h2 className="font-medium">
                      {product.name}
                    </h2>

                    {product.category && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.category}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="font-bold">
                        ₱
                        {product.price.toFixed(
                          2
                        )}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          addToCart(
                            product
                          )
                        }
                        disabled={
                          product.stock <=
                          0
                        }
                        className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-50"
                        aria-label={`Add ${product.name} to cart`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {product.stock}{" "}
                      available
                    </p>
                  </div>
                </article>
              )
            )}
          </section>
        )}

        {cart.length > 0 && (
          <section className="mt-8 rounded-xl border bg-card p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Your Cart
              </h2>

              <button
                type="button"
                onClick={() =>
                  setCart([])
                }
                className="text-sm text-muted-foreground"
              >
                Clear
              </button>
            </div>

            <div className="space-y-3">
              {cart.map(
                (item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b pb-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {item.name}
                      </p>

                      <p className="text-sm text-muted-foreground">
                        ₱
                        {item.price.toFixed(
                          2
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(
                            item.id,
                            -1
                          )
                        }
                        className="rounded-md border p-1"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>

                      <span className="w-6 text-center">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(
                            item.id,
                            1
                          )
                        }
                        className="rounded-md border p-1"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(
                            item.id
                          )
                        }
                        className="ml-2 text-muted-foreground"
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="mt-5 border-t pt-5">
              <div className="mb-5 flex items-center justify-between text-lg font-bold">
                <span>Total</span>

                <span>
                  ₱{total.toFixed(2)}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={studentName}
                  onChange={(event) =>
                    setStudentName(
                      event.target.value
                    )
                  }
                  placeholder="Student name"
                  className="rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                />

                <input
                  value={schoolId}
                  onChange={(event) =>
                    setSchoolId(
                      event.target.value
                    )
                  }
                  placeholder="Student ID"
                  className="rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod(
                      "CASH"
                    );
                    setError(null);
                  }}
                  className={`rounded-lg border px-4 py-3 font-medium ${
                    paymentMethod ===
                    "CASH"
                      ? "border-primary bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  Cash
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod(
                      "CARD"
                    );
                    setCashDeclared(false);
                    setError(null);
                  }}
                  className={`rounded-lg border px-4 py-3 font-medium ${
                    paymentMethod ===
                    "CARD"
                      ? "border-primary bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  Cashless
                </button>
              </div>

              {paymentMethod ===
                "CASH" && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      cashDeclared
                    }
                    onChange={(event) =>
                      setCashDeclared(
                        event.target
                          .checked
                      )
                    }
                    className="mt-0.5 h-4 w-4"
                  />

                  <span>
                    I have paid the cash
                    for this purchase.
                  </span>
                </label>
              )}

              {paymentMethod ===
                "CARD" && (
                <div className="mt-4 rounded-lg bg-secondary p-4 text-sm text-muted-foreground">
                  Cashless payment will
                  be enabled after a
                  payment provider is
                  connected.
                </div>
              )}

              <button
                type="button"
                disabled={
                  checkoutLoading ||
                  cart.length === 0
                }
                onClick={checkout}
                className="mt-5 w-full rounded-lg bg-primary px-5 py-4 font-bold text-primary-foreground disabled:opacity-50"
              >
                {checkoutLoading
                  ? "Completing..."
                  : `Complete Purchase • ₱${total.toFixed(
                      2
                    )}`}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
