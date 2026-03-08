import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PaymentMethod = "CASH" | "CARD" | "OTHER";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  /** Per-item notes / modifiers */
  notes: string;
  /** Snapshot of stock at time of add (for offline validation) */
  stock: number;
}

/** One line in a split-tender payment */
export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

export interface CartState {
  items: CartItem[];
  discountAmount: number;
  discountType: "fixed" | "percent";
  /** Primary payment method (used when no paymentLines set) */
  paymentMethod: PaymentMethod;
  amountTendered: number;
  /** Split-tender lines — empty = single method mode */
  paymentLines: PaymentLine[];
  /** Tip amount in currency units */
  tipAmount: number;
  /** Custom tax rate override (null means use default) */
  taxRate: number | null;
  /** Loyalty points to redeem on this sale */
  loyaltyPointsUsed: number;
  note: string;

  // Actions
  addItem: (item: Omit<CartItem, "quantity" | "notes">) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateItemNotes: (productId: string, notes: string) => void;
  setDiscount: (amount: number, type: "fixed" | "percent") => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setAmountTendered: (amount: number) => void;
  setTipAmount: (amount: number) => void;
  setTaxRate: (rate: number | null) => void;
  setLoyaltyPointsUsed: (points: number) => void;
  /** Add / replace a payment line for the given method */
  setPaymentLine: (line: PaymentLine) => void;
  removePaymentLine: (method: PaymentMethod) => void;
  clearPaymentLines: () => void;
  setNote: (note: string) => void;
  clearCart: () => void;

  // Derived
  subtotal: () => number;
  discountValue: () => number;
  taxAmount: (taxRate: number) => number;
  total: (taxRate: number) => number;
  paymentLinesTotal: () => number;
  changeDue: (taxRate: number) => number;
  isSplitMode: () => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discountAmount: 0,
      discountType: "fixed",
      paymentMethod: "CASH",
      amountTendered: 0,
      paymentLines: [],
      tipAmount: 0,
      taxRate: null,
      loyaltyPointsUsed: 0,
      note: "",

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1, notes: "" }] };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),

      updateQuantity: (productId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((i) => i.productId !== productId) };
          }
          return {
            items: state.items.map((i) =>
              i.productId === productId ? { ...i, quantity } : i
            ),
          };
        }),

      updateItemNotes: (productId, notes) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, notes } : i
          ),
        })),

      setDiscount: (amount, type) =>
        set({ discountAmount: amount, discountType: type }),

      setPaymentMethod: (method) => set({ paymentMethod: method }),
      setAmountTendered: (amount) => set({ amountTendered: amount }),
      setTipAmount: (amount) => set({ tipAmount: Math.max(0, amount) }),
      setTaxRate: (rate) => set({ taxRate: rate }),
      setLoyaltyPointsUsed: (points) => set({ loyaltyPointsUsed: Math.max(0, points) }),

      setPaymentLine: (line) =>
        set((state) => {
          const filtered = state.paymentLines.filter((p) => p.method !== line.method);
          return { paymentLines: [...filtered, line] };
        }),

      removePaymentLine: (method) =>
        set((state) => ({
          paymentLines: state.paymentLines.filter((p) => p.method !== method),
        })),

      clearPaymentLines: () => set({ paymentLines: [] }),

      setNote: (note) => set({ note }),

      clearCart: () =>
        set({
          items: [],
          discountAmount: 0,
          discountType: "fixed",
          amountTendered: 0,
          paymentLines: [],
          tipAmount: 0,
          taxRate: null,
          loyaltyPointsUsed: 0,
          note: "",
        }),

      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

      discountValue: () => {
        const { discountAmount, discountType } = get();
        const sub = get().subtotal();
        if (discountType === "percent") return (sub * discountAmount) / 100;
        return Math.min(discountAmount, sub);
      },

      taxAmount: (defaultTaxRate) => {
        const { taxRate: overrideRate, subtotal, discountValue } = get();
        const base = subtotal() - discountValue();
        const rate = overrideRate === null ? defaultTaxRate : overrideRate;
        // taxRate is usually stored as decimal (0.1) in props, ensure we check the input format
        // assuming props/override are both multipliers (e.g. 0.1 for 10%)
        return base * rate;
      },

      total: (defaultTaxRate) => {
        const { taxRate: overrideRate, subtotal, discountValue, tipAmount } = get();
        const base = subtotal() - discountValue();
        const rate = overrideRate === null ? defaultTaxRate : overrideRate;
        const tax = base * rate;
        return base + tax + tipAmount;
      },

      paymentLinesTotal: () =>
        get().paymentLines.reduce((sum, p) => sum + p.amount, 0),

      isSplitMode: () => get().paymentLines.length > 0,

      changeDue: (defaultTaxRate) => {
        const { amountTendered, paymentMethod, paymentLines } = get();
        const tot = get().total(defaultTaxRate);
        if (paymentLines.length > 0) {
          const paid = paymentLines.reduce((s, p) => s + p.amount, 0);
          return Math.max(0, paid - tot);
        }
        if (paymentMethod !== "CASH") return 0;
        return Math.max(0, amountTendered - tot);
      },
    }),
    {
      name: "olgax-pos-cart",
    }
  )
);
