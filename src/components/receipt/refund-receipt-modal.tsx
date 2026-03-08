"use client";

import { useEffect, useRef, useState } from "react";
import { X, Printer } from "lucide-react";
import { Receipt } from "@/components/receipt/receipt";

interface RefundItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface RefundReceiptModalProps {
  open: boolean;
  onClose: () => void;
  saleId?: string;
  items: RefundItem[];
  refundTotal: number;
  reason?: string;
}

interface ReceiptSettings {
  name: string;
  logoUrl: string | null;
  currency: string;
  currencyDecimals: number;
  taxName: string;
  receiptFooter: string;
}

const FALLBACK_SETTINGS: ReceiptSettings = {
  name: "My Store",
  logoUrl: null,
  currency: "$",
  currencyDecimals: 2,
  taxName: "Tax",
  receiptFooter: "",
};

export function RefundReceiptModal({
  open,
  onClose,
  saleId,
  items,
  refundTotal,
  reason,
}: RefundReceiptModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ReceiptSettings>(FALLBACK_SETTINGS);

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings({ ...FALLBACK_SETTINGS, ...d }))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const receiptData = {
    saleId,
    items,
    subtotal: refundTotal,
    discountAmount: 0,
    taxAmount: 0,
    total: refundTotal,
    paymentMethod: "REFUND",
    customerName: reason ? `Reason: ${reason}` : undefined,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <style>{`
        @media print {
          body > *:not(#refund-receipt-overlay) { display: none !important; }
          #refund-receipt-overlay { position: fixed; inset: 0; background: white; }
          #refund-receipt-overlay .no-print { display: none !important; }
        }
      `}</style>

      <div id="refund-receipt-overlay" className="w-full max-w-sm rounded-xl bg-white border shadow-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between border-b px-4 py-3 bg-card">
          <h2 className="font-semibold text-sm text-destructive">Refund Receipt</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Receipt preview with REFUND stamp */}
        <div ref={printRef} className="relative overflow-y-auto max-h-[70vh] bg-white p-4">
          {/* REFUND diagonal stamp */}
          <div
            className="no-print pointer-events-none absolute inset-0 flex items-center justify-center z-10 opacity-20 select-none"
            aria-hidden
          >
            <span
              className="text-5xl font-black text-destructive tracking-widest rotate-[-35deg]"
            >
              REFUND
            </span>
          </div>
          <Receipt data={receiptData} settings={settings} />
        </div>
      </div>
    </div>
  );
}
