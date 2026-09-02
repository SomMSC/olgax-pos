"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import {
  Search,
  Plus,
  Loader2,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  GitMerge,
  Phone,
  AlertTriangle,
  Check,
} from "lucide-react";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  loyaltyPoints: number;
  totalSpend: number;
  lastVisit: string | null;
  visitCount: number;
  createdAt: string;
};

type DuplicateGroup = {
  phone: string;
  customers: (Customer & { salesCount: number })[];
};

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

export default function CustomersPage() {
  const t = useTranslations("customers");
  const tc = useTranslations("common");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Merge duplicates
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeGroups, setMergeGroups] = useState<DuplicateGroup[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [keepSelections, setKeepSelections] = useState<
    Record<string, string>
  >({});
  const [mergingPhone, setMergingPhone] = useState<string | null>(null);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(
    null
  );
  const [formData, setFormData] = useState<CustomerForm>({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  /*
   * Safely read JSON.
   *
   * This prevents:
   * "Unexpected end of JSON input"
   *
   * from happening when an API returns an empty response or a
   * non-JSON response.
   */
  async function readJson(res: Response): Promise<any> {
    const text = await res.text();

    if (!text.trim()) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        error: text || `Request failed with status ${res.status}`,
      };
    }
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  // Fetch customers
  async function fetchCustomers() {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/customers?q=${encodeURIComponent(
          debouncedQuery
        )}&page=${page}&limit=10`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );

      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to fetch customers"
        );
      }

      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setTotalPages(
        Math.max(1, Number(data.pagination?.totalPages ?? 1))
      );
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      setCustomers([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, [debouncedQuery, page]);

  // Find duplicate customers
  async function loadDuplicates() {
    setMergeLoading(true);

    try {
      const res = await fetch("/api/customers/duplicates", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to find duplicates"
        );
      }

      const groups: DuplicateGroup[] = Array.isArray(data.groups)
        ? data.groups
        : [];

      setMergeGroups(groups);

      const defaults: Record<string, string> = {};

      for (const group of groups) {
        if (group.customers?.length > 0) {
          defaults[group.phone] = group.customers[0].id;
        }
      }

      setKeepSelections(defaults);
      setMergeOpen(true);
    } catch (error) {
      console.error("Failed to load duplicates:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to find duplicate customers"
      );
    } finally {
      setMergeLoading(false);
    }
  }

  // Merge duplicate customers
  async function executeMerge(phone: string) {
    const group = mergeGroups.find((g) => g.phone === phone);

    if (!group) return;

    const keepId = keepSelections[phone];

    if (!keepId) {
      alert("Please choose which customer to keep.");
      return;
    }

    const mergeCustomer = group.customers.find(
      (customer) => customer.id !== keepId
    );

    if (!mergeCustomer) {
      alert("There is no duplicate customer to merge.");
      return;
    }

    const mergeId = mergeCustomer.id;

    setMergingPhone(phone);

    try {
      const res = await fetch("/api/customers/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          keepId,
          mergeId,
        }),
      });

      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Merge failed"
        );
      }

      setMergeGroups((prev) =>
        prev.filter((group) => group.phone !== phone)
      );

      await fetchCustomers();
    } catch (error) {
      console.error("Merge failed:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to merge customers"
      );
    } finally {
      setMergingPhone(null);
    }
  }

  // Create/Edit customer
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const name = formData.name.trim();

    if (!name) {
      setFormError("Name is required.");
      return;
    }

    setFormLoading(true);
    setFormError("");

    try {
      const url = editingCustomer
        ? `/api/customers/${editingCustomer.id}`
        : "/api/customers";

      const method = editingCustomer ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          notes: formData.notes.trim() || null,
        }),
      });

      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to save customer"
        );
      }

      setModalOpen(false);
      setEditingCustomer(null);
      setFormData({
        name: "",
        phone: "",
        email: "",
        notes: "",
      });

      await fetchCustomers();
    } catch (error) {
      console.error("Failed to save customer:", error);

      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to save customer"
      );
    } finally {
      setFormLoading(false);
    }
  }

  // Delete customer
  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this customer?")) {
      return;
    }

    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });

      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to delete customer"
        );
      }

      await fetchCustomers();
    } catch (error) {
      console.error("Failed to delete customer:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to delete customer"
      );
    }
  }

  function openCreate() {
    setEditingCustomer(null);

    setFormData({
      name: "",
      phone: "",
      email: "",
      notes: "",
    });

    setFormError("");
    setModalOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditingCustomer(customer);

    setFormData({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      notes: customer.notes || "",
    });

    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (formLoading) return;

    setModalOpen(false);
    setEditingCustomer(null);
    setFormError("");
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>

          <p className="text-sm text-muted-foreground">
            Manage your customer database and view history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDuplicates}
            disabled={mergeLoading}
            className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {mergeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}

            {t("find_duplicates")}
          </button>

          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 sm:w-80">
        <Search className="h-4 w-4 text-muted-foreground" />

        <input
          placeholder={t("search_placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Customer table */}
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-xs font-medium uppercase text-muted-foreground">
                <th className="px-4 py-3">{t("name")}</th>
                <th className="px-4 py-3">{t("contact")}</th>
                <th className="px-4 py-3 text-right">
                  {t("total_spent")}
                </th>
                <th className="px-4 py-3 text-right">
                  {t("visits")}
                </th>
                <th className="px-4 py-3 text-right">
                  {t("last_visit")}
                </th>
                <th className="px-4 py-3 text-right">
                  {t("loyalty_points")}
                </th>
                <th className="w-24 px-4 py-3 text-center">
                  {tc("edit")}/{tc("delete")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("loading")}
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {t("no_customers_found")}
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="group transition-colors hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-primary hover:underline"
                      >
                        {customer.name}
                      </Link>

                      {customer.notes && (
                        <div className="max-w-[150px] truncate text-[10px] italic text-muted-foreground">
                          {customer.notes}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col text-xs text-muted-foreground">
                        {customer.phone && (
                          <span>{customer.phone}</span>
                        )}

                        {customer.email && (
                          <span>{customer.email}</span>
                        )}

                        {!customer.phone && !customer.email && (
                          <span className="opacity-50">-</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(customer.totalSpend)}
                    </td>

                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {customer.visitCount}
                    </td>

                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {customer.lastVisit
                        ? new Date(
                            customer.lastVisit
                          ).toLocaleDateString()
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {customer.loyaltyPoints}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(customer)}
                          className="rounded p-1.5 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                          title="Edit"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() =>
                            handleDelete(customer.id)
                          }
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
          <button
            onClick={() =>
              setPage((current) => Math.max(1, current - 1))
            }
            disabled={page === 1 || loading}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {tc("back")}
          </button>

          <span className="text-xs text-muted-foreground">
            {page} {tc("of")} {totalPages}
          </span>

          <button
            onClick={() =>
              setPage((current) =>
                Math.min(totalPages, current + 1)
              )
            }
            disabled={page === totalPages || loading}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Merge Duplicates Modal */}
      {mergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMergeOpen(false)}
          />

          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <GitMerge className="h-5 w-5 text-primary" />
                  Merge Duplicate Customers
                </h3>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Customers with the same phone number are listed
                  below. Choose which record to keep.
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {mergeGroups.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>

                  <p className="font-medium">
                    No duplicate phone numbers found
                  </p>

                  <p className="text-sm text-muted-foreground">
                    Your customer database looks clean!
                  </p>
                </div>
              ) : (
                mergeGroups.map((group) => (
                  <div
                    key={group.phone}
                    className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-50/40 p-4 dark:border-amber-800/40 dark:bg-amber-900/10"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />

                      <Phone className="h-3.5 w-3.5 shrink-0" />

                      <span>{group.phone}</span>

                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        {group.customers.length} records share this
                        number
                      </span>
                    </div>

                    <div className="space-y-2">
                      {group.customers.map((customer) => {
                        const isKeep =
                          keepSelections[group.phone] ===
                          customer.id;

                        return (
                          <button
                            key={customer.id}
                            onClick={() =>
                              setKeepSelections((previous) => ({
                                ...previous,
                                [group.phone]: customer.id,
                              }))
                            }
                            className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                              isKeep
                                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                : "border-border bg-background hover:bg-muted/50"
                            }`}
                          >
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                isKeep
                                  ? "border-primary bg-primary"
                                  : "border-border"
                              }`}
                            >
                              {isKeep && (
                                <Check className="h-3 w-3 text-primary-foreground" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {customer.name}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {customer.email && (
                                  <span className="mr-2">
                                    {customer.email}
                                  </span>
                                )}

                                <span>
                                  {customer.salesCount} sale
                                  {customer.salesCount !== 1
                                    ? "s"
                                    : ""}
                                </span>

                                <span className="mx-1">·</span>

                                <span>
                                  {customer.loyaltyPoints} pts
                                </span>
                              </p>
                            </div>

                            {isKeep && (
                              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Keep
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-start gap-2 rounded bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />

                      <span>
                        Sales history, loyalty points, and loyalty logs
                        from the other record(s) will be merged into
                        the kept customer. Duplicate records will be
                        deleted.
                      </span>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() =>
                          executeMerge(group.phone)
                        }
                        disabled={
                          mergingPhone === group.phone
                        }
                        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {mergingPhone === group.phone ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <GitMerge className="h-3.5 w-3.5" />
                        )}

                        Merge into kept record
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end border-t bg-muted/20 px-6 py-4">
              <button
                onClick={() => setMergeOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                {tc("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="relative w-full max-w-md overflow-hidden rounded-lg border bg-background shadow-xl">
            <form onSubmit={handleSubmit}>
              <div className="border-b px-6 py-4">
                <h3 className="text-lg font-semibold">
                  {editingCustomer
                    ? t("edit_title")
                    : t("new_title")}
                </h3>
              </div>

              <div className="space-y-4 p-6">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("name")}{" "}
                    <span className="text-destructive">*</span>
                  </label>

                  <input
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((previous) => ({
                        ...previous,
                        name: e.target.value,
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="John Doe"
                  />
                </div>

                {/* Phone + Email */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("phone")}
                    </label>

                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData((previous) => ({
                          ...previous,
                          phone: e.target.value,
                        }))
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="+1 (555)..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("email")}
                    </label>

                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((previous) => ({
                          ...previous,
                          email: e.target.value,
                        }))
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("notes")}
                  </label>

                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((previous) => ({
                        ...previous,
                        notes: e.target.value,
                      }))
                    }
                    className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Customer preferences..."
                  />
                </div>

                {formError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {formError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t bg-muted/40 px-6 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={formLoading}
                  className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                >
                  {tc("cancel")}
                </button>

                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {formLoading && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  {formLoading ? tc("loading") : tc("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
