import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const settings = await prisma.businessSettings.findUnique({
    where: { id: "singleton" },
  });

  if (!settings) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Business settings have not been configured yet.
        </p>
      </div>
    );
  }

  const data = serialize(settings);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your store settings.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">
          Business Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Business Name</p>
            <p className="font-medium">{data.name}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Currency</p>
            <p className="font-medium">{data.currency}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Language</p>
            <p className="font-medium">{data.language}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Tax Name</p>
            <p className="font-medium">{data.taxName}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Tax Rate</p>
            <p className="font-medium">
              {(Number(data.taxRate) * 100).toFixed(2)}%
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Low Stock Threshold
            </p>
            <p className="font-medium">{data.lowStockThreshold}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">
          Receipt
        </h2>

        <div>
          <p className="text-xs text-muted-foreground">Receipt Footer</p>
          <p className="font-medium">{data.receiptFooter}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">
          Appearance
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Primary Color</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="h-6 w-6 rounded border"
                style={{ backgroundColor: data.primaryColor }}
              />
              <span className="font-medium">{data.primaryColor}</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Accent Color</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="h-6 w-6 rounded border"
                style={{ backgroundColor: data.accentColor }}
              />
              <span className="font-medium">{data.accentColor}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">
          Storage
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              Storage Provider
            </p>
            <p className="font-medium">{data.storageProvider}</p>
          </div>

          {data.storageRegion && (
            <div>
              <p className="text-xs text-muted-foreground">
                Storage Region
              </p>
              <p className="font-medium">{data.storageRegion}</p>
            </div>
          )}

          {data.storageBucket && (
            <div>
              <p className="text-xs text-muted-foreground">
                Storage Bucket
              </p>
              <p className="font-medium">{data.storageBucket}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
