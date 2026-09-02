"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useCartStore, PaymentMethod } from "@/store/cart";
import { formatCurrency } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  PauseCircle,
  ClipboardList,
  Percent,
  RotateCcw,
  Star,
  Banknote,
  Smartphone,
  CheckCircle2,
} from "lucide-react";

interface PaymentPanelProps {
  taxRate: number;
  onClear: () => void;
  onSaleComplete?: (saleId: string) => void;
  onHoldOrders?: () => void;
  customerId?: string | null;
}

const TIP_PRESETS = [
  { label: "10%", value: 10 },
  { label: "15%", value: 15 },
  { label: "20%", value: 20 },
];

const PAYMENT_METHODS: PaymentMethod[] = [
  "CASH",
  "CARD",
  "OTHER",
];

export function PaymentPanel({
  taxRate,
  onClear,
  onSaleComplete,
  onHoldOrders,
  customerId,
}: PaymentPanelProps) {
  const t = useTranslations("pos");
  const router = useRouter();

  const {
    items,
    paymentMethod,
    setPaymentMethod,
    paymentLines,
    clearCart,
    tipAmount,
    setTipAmount,
    taxRate: taxRateOverride,
    setTaxRate,
    loyaltyPointsUsed,
    setLoyaltyPointsUsed,
    subtotal,
    discountValue,
    taxAmount,
    total,
  } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [showTaxEdit, setShowTaxEdit] = useState(false);

  const [checkoutLocked, setCheckoutLocked] =
    useState(false);

  const checkoutIdRef =
    useRef<string | null>(null);

  const [loyaltyInfo, setLoyaltyInfo] = useState<{
    points: number;
    enabled: boolean;
    earnRate: number;
    redeemValue: number;
    maxRedeemDiscount: number;
  } | null>(null);

  useEffect(() => {
    if (!customerId) {
      setLoyaltyInfo(null);
      setLoyaltyPointsUsed(0);
      return;
    }

    fetch(`/api/loyalty?customerId=${customerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled) {
          setLoyaltyInfo(d);
        } else {
          setLoyaltyInfo(null);
          setLoyaltyPointsUsed(0);
        }
      })
      .catch(() => {
        setLoyaltyInfo(null);
      });
  }, [customerId, setLoyaltyPointsUsed]);

  useEffect(() => {
    if (items.length === 0) {
      setCheckoutLocked(false);
      setLoading(false);
      setError(null);
      checkoutIdRef.current = null;
    }
  }, [items.length]);

  const tot = total(taxRate);
  const isEmpty = items.length === 0;

  const effectiveTaxRate =
    taxRateOverride !== null
      ? taxRateOverride
      : taxRate;

  const sub =
    subtotal() - discountValue();

  const loyaltyDiscount =
    loyaltyInfo && loyaltyPointsUsed > 0
      ? Math.min(
          loyaltyPointsUsed /
            loyaltyInfo.redeemValue,
          loyaltyInfo.maxRedeemDiscount
        )
      : 0;

  const activeTipPct =
    sub > 0
      ? Math.round(
          (tipAmount / sub) * 100
        )
      : 0;

  function handleTipPreset(pct: number) {
    if (activeTipPct === pct) {
      setTipAmount(0);
    } else {
      setTipAmount(
        (sub * pct) / 100
      );
    }

    setCustomTip("");
  }

  function handleCustomTip(val: string) {
    setCustomTip(val);

    const n = parseFloat(val);

    if (!isNaN(n) && n >= 0) {
      setTipAmount(n);
    } else if (val === "") {
      setTipAmount(0);
    }
  }

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

      note:
        note || undefined,

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
            typeof resp.error === "string"
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

  async function handleHoldOrder() {
    if (
      isEmpty ||
      holdLoading ||
      checkoutLocked
    ) {
      return;
    }

    setHoldLoading(true);

    try {
      const res = await fetch(
        "/api/held-orders",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            cartSnapshot: {
              items,
              paymentMethod,
              amountTendered: tot,
            },
            label: `Hold ${new Date().toLocaleTimeString()}`,
          }),
        }
      );

      if (res.ok) {
        clearCart();
      }
    } finally {
      setHoldLoading(false);
    }
  }

  return (
    <div className="border-t p-4 space-y-3">

      <div className="flex gap-2">
        <button
          onClick={handleHoldOrder}
          disabled={
            isEmpty ||
            holdLoading ||
            checkoutLocked
          }
          className="flex-1 flex items-center justify-center gap-1 rounded-md border py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          <PauseCircle className="h-3.5 w-3.5" />

          {holdLoading
            ? "..."
            : t("hold")}
        </button>

        <button
          onClick={onHoldOrders}
          disabled={checkoutLocked}
          className="flex-1 flex items-center justify-center gap-1 rounded-md border py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          <ClipboardList className="h-3.5 w-3.5" />

          Recall
        </button>
      </div>

      {!isEmpty && (
        <div
          className={`rounded-lg border px-3 py-2 ${
            customerId
              ? "border-green-500/30 bg-green-500/5"
              : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          {customerId ? (
            <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Student identified
            </div>
          ) : (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Identify the student before checkout.
            </p>
          )}
        </div>
      )}

      {!isEmpty && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tip
            </span>

            {tipAmount > 0 && (
              <button
                onClick={() => {
                  setTipAmount(0);
                  setCustomTip("");
                }}
                disabled={checkoutLocked}
                className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          <div className="flex gap-1.5">
            {TIP_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() =>
                  handleTipPreset(
                    p.value
                  )
                }
                disabled={checkoutLocked}
                className={
                  activeTipPct ===
                    p.value &&
                  customTip === ""
                    ? "flex-1 rounded-md border-2 border-primary bg-primary/10 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
                    : "flex-1 rounded-md border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                }
              >
                {p.label}
              </button>
            ))}

            <input
              type="number"
              min={0}
              step={0.01}
              value={customTip}
              onChange={(e) =>
                handleCustomTip(
                  e.target.value
                )
              }
              disabled={checkoutLocked}
              placeholder="Custom"
              className="w-20 rounded-md border px-2 py-1.5 text-xs text-center bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {!isEmpty && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tax
            </span>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    taxRateOverride ===
                    0
                  }
                  disabled={
                    checkoutLocked
                  }
                  onChange={(e) => {
                    if (
                      e.target.checked
                    ) {
                      setTaxRate(0);
                      setShowTaxEdit(
                        false
                      );
                    } else {
                      setTaxRate(null);
                    }
                  }}
                  className="h-3 w-3 accent-primary"
                />

                Tax Exempt
              </label>

              <button
                onClick={() =>
                  setShowTaxEdit(
                    (v) => !v
                  )
                }
                disabled={
                  checkoutLocked
                }
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                <Percent className="h-3 w-3" />

                {taxRateOverride !==
                null
                  ? `${(
                      taxRateOverride *
                      100
                    ).toFixed(
                      0
                    )}% (custom)`
                  : `${(
                      taxRate * 100
                    ).toFixed(
                      0
                    )}% (default)`}
              </button>

              {taxRateOverride !==
                null && (
                <button
                  onClick={() => {
                    setTaxRate(null);
                    setShowTaxEdit(
                      false
                    );
                  }}
                  disabled={
                    checkoutLocked
                  }
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title="Reset to default"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {showTaxEdit &&
            taxRateOverride !==
              0 && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={
                    taxRateOverride !==
                    null
                      ? taxRateOverride *
                        100
                      : taxRate *
                        100
                  }
                  disabled={
                    checkoutLocked
                  }
                  onChange={(e) => {
                    const val =
                      parseFloat(
                        e.target.value
                      );

                    if (
                      !isNaN(val) &&
                      val >= 0 &&
                      val <= 100
                    ) {
                      setTaxRate(
                        val / 100
                      );
                    }
                  }}
                  className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  placeholder="Rate %"
                />

                <span className="text-xs text-muted-foreground">
                  %
                </span>
              </div>
            )}
        </div>
      )}

      {!isEmpty &&
        loyaltyInfo?.enabled &&
        loyaltyInfo.points > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Star className="h-3 w-3 text-yellow-500" />

                Loyalty Points
              </span>

              <span className="text-xs font-semibold">
                {loyaltyInfo.points} pts available
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={
                  loyaltyInfo.points
                }
                step={
                  loyaltyInfo.redeemValue
                }
                value={
                  loyaltyPointsUsed ||
                  ""
                }
                disabled={
                  checkoutLocked
                }
                onChange={(e) =>
                  setLoyaltyPointsUsed(
                    parseInt(
                      e.target.value
                    ) || 0
                  )
                }
                placeholder="Points to redeem"
                className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />

              {loyaltyPointsUsed >
                0 && (
                <span className="text-xs text-green-600 font-medium">
                  -
                  {formatCurrency(
                    loyaltyDiscount
                  )}
                </span>
              )}
            </div>
          </div>
        )}

      {!isEmpty && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">
            PAYMENT
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                setPaymentMethod(
                  "CASH"
                )
              }
              disabled={
                checkoutLocked
              }
              className={
                paymentMethod ===
                "CASH"
                  ? "rounded-lg border-2 border-primary bg-primary/10 p-3 text-primary disabled:opacity-50"
                  : "rounded-lg border p-3 text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
              }
            >
              <Banknote className="mx-auto mb-1 h-5 w-5" />

              <div className="text-sm font-semibold">
                Cash
              </div>

              <div className="text-[10px] mt-0.5">
                Honesty payment
              </div>
            </button>

            <button
              onClick={() =>
                setPaymentMethod(
                  "CARD"
                )
              }
              disabled={
                checkoutLocked
              }
              className={
                paymentMethod ===
                "CARD"
                  ? "rounded-lg border-2 border-primary bg-primary/10 p-3 text-primary disabled:opacity-50"
                  : "rounded-lg border p-3 text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
              }
            >
              <Smartphone className="mx-auto mb-1 h-5 w-5" />

              <div className="text-sm font-semibold">
                Cashless
              </div>

              <div className="text-[10px] mt-0.5">
                Provider confirmation required
              </div>
            </button>
          </div>

          {paymentMethod ===
          "CASH" ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Amount to deposit
                </p>

                <p className="text-2xl font-bold tracking-tight">
                  {formatCurrency(
                    tot
                  )}
                </p>
              </div>

              <button
                data-charge-btn
                onClick={
                  handleHonestyCashPayment
                }
                disabled={
                  isEmpty ||
                  loading ||
                  checkoutLocked ||
                  !customerId
                }
                className="w-full rounded-lg bg-primary py-4 text-base font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                {loading ||
                checkoutLocked
                  ? "Recording..."
                  : "I HAVE PAID"}
              </button>

              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                By tapping this button, the student confirms
                that they have deposited the displayed amount.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <Smartphone className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />

              <p className="text-sm font-semibold">
                Cashless payment
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                A payment provider must confirm the transaction
                before the sale can be completed.
              </p>

              <p className="mt-2 text-[10px] text-muted-foreground">
                Cashless provider integration is not enabled yet.
              </p>
            </div>
          )}
        </div>
      )}

      {!isEmpty && (
        <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>

            <span>
              {formatCurrency(
                subtotal()
              )}
            </span>
          </div>

          {discountValue() >
            0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>

              <span>
                −
                {formatCurrency(
                  discountValue()
                )}
              </span>
            </div>
          )}

          {taxAmount(taxRate) >
            0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>

              <span>
                {formatCurrency(
                  taxAmount(taxRate)
                )}
              </span>
            </div>
          )}

          {tipAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Tip</span>

              <span>
                {formatCurrency(
                  tipAmount
                )}
              </span>
            </div>
          )}

          <div className="flex justify-between font-semibold text-foreground border-t pt-1 mt-1">
            <span>Total</span>

            <span>
              {formatCurrency(tot)}
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}

      {!isEmpty && (
        <button
          onClick={onClear}
          disabled={checkoutLocked}
          className="w-full rounded-md border py-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {t("void")}
        </button>
      )}
    </div>
  );
}
