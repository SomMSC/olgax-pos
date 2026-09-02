"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  X,
  CheckCircle2,
  Store,
  CreditCard,
  Banknote,
  RefreshCw,
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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [studentName, setStudentName] = useState("");
  const [schoolId, setSchoolId] = useState("");

  const [paymentMethod, setPaymentMethod] =
    useState<"CASH" | "CARD">("CASH");

  const [cashDeclared, setCashDeclared] = useState(false);

  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  async function loadProducts() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("q", search.trim());
      }

      if (category) {
        params.set("category", category);
      }

      const queryString = params.toString();

      const response = await fetch(
        queryString
          ? `/api/store/products?${queryString}`
          : "/api/store/products",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to load products."
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
    setSuccess(null);

    setCart((current) => {
      const existing = current.find(
        (item) => item.id === product.id
      );

      if (existing) {
        if (existing.quantity >= product.stock) {
          return current;
        }

        return current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
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
          if (item.id !== productId) {
            return item;
          }

          const quantity = item.quantity + delta;

          if (quantity <= 0) {
            return null;
          }

          if (quantity > item.stock) {
            return item;
          }

          return {
            ...item,
            quantity,
          };
        })
        .filter(
          (item): item is CartItem => item !== null
        )
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) =>
      current.filter(
        (item) => item.id !== productId
      )
    );
  }

  const cartQuantity = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + item.quantity,
        0
      ),
    [cart]
  );

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + item.price * item.quantity,
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
      setError("Please enter the student's name.");
      return;
    }

    if (!schoolId.trim()) {
      setError("Please enter the student's school ID.");
      return;
    }

    if (cart.length === 0) {
      setError("Your cart is empty.");
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

    const idempotencyKey = crypto.randomUUID();

    try {
      const response = await fetch(
        "/api/store/checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            studentName: studentName.trim(),
            schoolId: schoolId.trim(),
            paymentMethod,
            cashDeclared,
            items: cart.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
            })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Checkout failed."
        );
      }

      setSuccess({
        saleId: data.sale.id,
        total: Number(data.sale.total),
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

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
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
    <main className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-40 border-b bg-background/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Store className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-lg font-bold sm:text-xl">
                School Canteen
              </h1>

              <p className="text-xs text-muted-foreground">
                Honesty Store
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4" />
            <span>{cartQuantity}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <section className="mb-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-2xl font-bold">
              Choose your food
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Select your products, then complete your
              purchase using the honesty system.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search food, drinks, snacks..."
              className="w-full rounded-xl border bg-background py-4 pl-12 pr-4 text-base outline-none transition focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategory("")}
              className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition ${
                !category
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              }`}
            >
              All Products
            </button>

            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition ${
                  category === item
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium">
            {error}
          </div>
        )}

        {success && (
          <section className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                <CheckCircle2 className="h-7 w-7" />
              </div>

              <div className="min-w-0">
                <h2 className="text-xl font-bold">
                  Purchase completed!
                </h2>

                <p className="mt-1 text-sm">
                  Thank you, {success.customerName}.
                </p>

                <div className="mt-4 rounded-xl border bg-background/60 p-4">
                  <p className="text-xs text-muted-foreground">
                    Order number
                  </p>

                  <p className="mt-1 break-all font-mono text-sm font-semibold">
                    {success.saleId}
                  </p>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Total paid
                  </p>

                  <p className="text-2xl font-bold">
                    ₱{success.total.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground sm:w-auto"
            >
              Continue Shopping
            </button>
          </section>
        )}

        {loading ? (
          <div className="rounded-2xl border bg-card py-20 text-center text-muted-foreground">
            <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" />
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border bg-card py-20 text-center text-muted-foreground">
            No products available right now.
          </div>
        ) : (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="aspect-square bg-muted">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-5 text-center text-sm text-muted-foreground">
                      {product.name}
                    </div>
                  )}
                </div>

                <div className="p-3 sm:p-4">
                  <h2 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold sm:text-base">
                    {product.name}
                  </h2>

                  {product.category && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {product.category}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-base font-bold sm:text-lg">
                      ₱{product.price.toFixed(2)}
                    </span>

                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={product.stock <= 0}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                      aria-label={`Add ${product.name} to cart`}
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {product.stock} available
                  </p>
                </div>
              </article>
            ))}
          </section>
        )}

        {cart.length > 0 && (
          <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Your Cart
                </h2>

                <p className="text-sm text-muted-foreground">
                  {cartQuantity} item
                  {cartQuantity === 1 ? "" : "s"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCart([])}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
              >
                Clear
              </button>
            </div>

            <div className="space-y-3">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border p-3"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Food
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {item.name}
                    </p>

                    <p className="text-sm text-muted-foreground">
                      ₱{item.price.toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        changeQuantity(item.id, -1)
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-secondary"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>

                    <span className="w-7 text-center font-semibold">
                      {item.quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        changeQuantity(item.id, 1)
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-secondary"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        removeFromCart(item.id)
                      }
                      className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${item.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t pt-6">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-lg font-semibold">
                  Total
                </span>

                <span className="text-2xl font-bold">
                  ₱{total.toFixed(2)}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Student name
                  </label>

                  <input
                    value={studentName}
                    onChange={(event) =>
                      setStudentName(event.target.value)
                    }
                    placeholder="Enter your name"
                    className="w-full rounded-xl border bg-background px-4 py-3.5 outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Student ID
                  </label>

                  <input
                    value={schoolId}
                    onChange={(event) =>
                      setSchoolId(event.target.value)
                    }
                    placeholder="Enter your school ID"
                    className="w-full rounded-xl border bg-background px-4 py-3.5 outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">
                  Payment method
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("CASH");
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-4 font-semibold transition ${
                      paymentMethod === "CASH"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <Banknote className="h-5 w-5" />
                    Cash
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("CARD");
                      setCashDeclared(false);
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-4 font-semibold transition ${
                      paymentMethod === "CARD"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <CreditCard className="h-5 w-5" />
                    Cashless
                  </button>
                </div>
              </div>

              {paymentMethod === "CASH" && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-4">
                  <input
                    type="checkbox"
                    checked={cashDeclared}
                    onChange={(event) =>
                      setCashDeclared(
                        event.target.checked
                      )
                    }
                    className="mt-1 h-5 w-5"
                  />

                  <span className="text-sm">
                    <span className="block font-semibold">
                      I have paid the cash
                    </span>

                    <span className="mt-1 block text-muted-foreground">
                      I confirm that I deposited the
                      cash for this purchase.
                    </span>
                  </span>
                </label>
              )}

              {paymentMethod === "CARD" && (
                <div className="mt-4 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
                  Cashless payment is coming soon.
                  A real payment provider must confirm
                  the payment before the order can be
                  completed.
                </div>
              )}

              <button
                type="button"
                disabled={
                  checkoutLoading ||
                  cart.length === 0
                }
                onClick={checkout}
                className="mt-5 w-full rounded-xl bg-primary px-5 py-4 text-base font-bold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checkoutLoading
                  ? "Completing purchase..."
                  : `Complete Purchase • ₱${total.toFixed(2)}`}
              </button>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                Your purchase is automatically recorded
                in the school canteen system.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
