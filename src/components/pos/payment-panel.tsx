"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/store/cart-store";

interface PaymentPanelProps {
  onClear: () => void;
  onSaleComplete?: (saleId: string) => void;
}

export function PaymentPanel({
  onClear,
  onSaleComplete,
}: PaymentPanelProps) {
  const router = useRouter();

  const {
    items,
    discountAmount,
    discountType,
    note,
    customerId,
    loyaltyPointsUsed,
    clearCart,
  } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLocked, setCheckoutLocked] =
    useState(false);

  const checkoutIdRef =
    useRef<string | null>(null);

  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.price) *
        Number(item.quantity),
    0
  );

  const effectiveTaxRate = 0;

  const taxAmount =
    subtotal *
    (effectiveTaxRate / 100);

  const tipAmount = 0;

  const discount =
    Number(discountAmount || 0);

  const total = Math.max(
    0,
    subtotal +
      taxAmount +
      tipAmount -
      discount
  );

  const tot = total;

  const isEmpty = items.length === 0;

  useEffect(() => {
    if (items.length === 0) {
      setCheckoutLocked(false);
      setLoading(false);
      setError(null);
      checkoutIdRef.current = null;
    }
  }, [items.length]);

  async function handleHonestyCashPayment() {
    if (
      isEmpty ||
      loading ||
      checkoutLocked
    ) {
      return;
    }

    if (!customerId) {
      setError(
        "Please identify the student before paying."
      );
      return;
    }

    setCheckoutLocked(true);
    setError(null);
    setLoading(true);

    if (!checkoutIdRef.current) {
      checkoutIdRef.current =
        crypto.randomUUID();
    }

    const {
      items: cartItems,
      discountAmount,
      discountType,
      note,
    } = useCartStore.getState();

    const body = {
      items: cartItems.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        notes:
          i.notes || undefined,
      })),
      paymentMethod: "CASH",
      amountTendered: tot,
      taxRate: effectiveTaxRate,
      discountAmount,
      discountType,
      tipAmount,
      note: note || undefined,
      customerId,
      loyaltyPointsUsed:
        loyaltyPointsUsed || 0,
      honestyPayment: true,
      cashDeclared: true,
    };

    const MAX_ATTEMPTS = 3;

    let lastError: Error | null =
      null;

    for (
      let attempt = 1;
      attempt <= MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        const res = await fetch(
          "/api/sales",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "Idempotency-Key":
                checkoutIdRef.current,
            },
            body: JSON.stringify(body),
          }
        );

        const resp = await res.json();

        if (!res.ok) {
          throw new Error(
            typeof resp.error ===
              "string"
              ? resp.error
              : "Failed to record payment."
          );
        }

        const saleId: string =
          resp.sale?.id ?? "";

        if (!saleId) {
          throw new Error(
            "Sale was created but no sale ID was returned."
          );
        }

        if (onSaleComplete) {
          onSaleComplete(saleId);
        } else {
          clearCart();
          onClear();
        }

        router.refresh();

        return;
      } catch (err) {
        lastError =
          err instanceof Error
            ? err
            : new Error(
                "Failed to record payment."
              );

        const message =
          lastError.message;

        const permanentError =
          message.includes(
            "Customer not found"
          ) ||
          message.includes(
            "Customer is inactive"
          ) ||
          message.includes(
            "Insufficient stock"
          ) ||
          message.includes(
            "student/customer must be identified"
          ) ||
          message.includes(
            "Cash payment declaration is required"
          ) ||
          message.includes(
            "Honesty cash checkout must use CASH"
          ) ||
          message.includes(
            "Split payments are not allowed"
          );

        if (permanentError) {
          break;
        }

        if (
          attempt < MAX_ATTEMPTS
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                800 * attempt
              )
          );
        }
      }
    }

    setCheckoutLocked(false);

    setError(
      lastError?.message ??
        "Payment could not be confirmed. Please try again. Your payment has not been assumed to be duplicated."
    );

    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>

            <span>
              ₱{subtotal.toFixed(2)}
            </span>
          </div>

          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span>Discount</span>

              <span>
                -₱{discount.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span>Tax</span>

            <span>
              ₱{taxAmount.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between border-t pt-3 text-lg font-bold">
            <span>Total</span>

            <span>
              ₱{tot.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={
          handleHonestyCashPayment
        }
        disabled={
          isEmpty ||
          loading ||
          checkoutLocked ||
          !customerId
        }
        className="w-full rounded-lg bg-green-600 px-4 py-4 text-lg font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? "Recording Payment..."
          : checkoutLocked
          ? "Processing..."
          : "I HAVE PAID"}
      </button>

      <button
        type="button"
        onClick={() => {
          if (loading) {
            return;
          }

          clearCart();
          onClear();
        }}
        disabled={loading}
        className="w-full rounded-lg border px-4 py-3 font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
