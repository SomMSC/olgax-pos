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
  type: "STUDENT" | "STAFF";
  schoolId?: string | null;
  staffId?: string | null;
  phone?: string;
  email?: string;
  notes?: string;
  loyaltyPoints: number;
  totalSpend: number;
  lastVisit: string | null;
  visitCount: number;
  createdAt: string;
};

type DuplicateCustomer = Customer & {
  salesCount: number;
};

type DuplicateGroup = {
  phone: string;
  customers: DuplicateCustomer[];
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

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "STUDENT" as "STUDENT" | "STAFF",
    schoolId: "",
    staffId: "",
  });

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeGroups, setMergeGroups] = useState<DuplicateGroup[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [keepSelections, setKeepSelections] = useState<
    Record<string, string>
  >({});
  const [mergingPhone, setMergingPhone] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  async function fetchCustomers() {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/customers?q=${encodeURIComponent(
          debouncedQuery
        )}&page=${page}&limit=10`
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch customers");
      }

      setCustomers(data.customers || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, [debouncedQuery, page]);

  function openCreate() {
    setEditingCustomer(null);
    setFormError("");

    setFormData({
      name: "",
      type: "STUDENT",
      schoolId: "",
      staffId: "",
    });

    setModalOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditingCustomer(customer);
    setFormError("");

    setFormData({
      name: customer.name,
      type: customer.type,
      schoolId: customer.schoolId || "",
      staffId: customer.staffId || "",
    });

    setModalOpen(true);
  }

  function closeModal() {
    if (formLoading) return;

    setModalOpen(false);
    setEditingCustomer(null);
    setFormError("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const name = formData.name.trim();

    if (!name) {
      setFormError("Name is required");
      return;
    }

    if (
      formData.type !== "STUDENT" &&
      formData.type !== "STAFF"
    ) {
      setFormError("Customer type is required");
      return;
    }

    setFormLoading(true);
    setFormError("");

    try {
      const payload = {
        name,
        type: formData.type,
        schoolId:
          formData.type === "STUDENT" &&
          formData.schoolId.trim()
            ? formData.schoolId.trim()
            : null,
        staffId:
          formData.type === "STAFF" &&
          formData.staffId.trim()
            ? formData.staffId.trim()
            : null,
      };

      const url = editingCustomer
        ? `/api/customers/${editingCustomer.id}`
        : "/api/customers";

      const method = editingCustomer ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      let data: { error?: string } = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
            `Failed to ${
              editingCustomer ? "update" : "create"
            } customer`
        );
      }

      setModalOpen(false);
      setEditingCustomer(null);
      setFormError("");

      setFormData({
        name: "",
        type: "STUDENT",
        schoolId: "",
        staffId: "",
      });

      await fetchCustomers();
    } catch (error) {
      console.error("Customer save error:", error);

      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to save customer"
      );
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Are you sure you want to delete this customer?"
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "DELETE",
      });

      const text = await res.text();

      if (!res.ok) {
        let message = "Failed to delete customer";

        try {
          const data = JSON.parse(text);
          message = data.error || message;
        } catch {
          // Ignore invalid JSON.
        }

        throw new Error(message);
      }

      await fetchCustomers();
    } catch (error) {
      console.error("Delete customer error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to delete customer"
      );
    }
  }

  async function loadDuplicates() {
    setMergeLoading(true);

    try {
      const res = await fetch("/api/customers/duplicates");
      const text = await res.text();

      let data: { groups?: DuplicateGroup[]; error?: string } =
        {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to find duplicates");
      }

      const groups = data.groups ?? [];

      setMergeGroups(groups);

      const defaults: Record<string, string> = {};

      for (const group of groups) {
        if (group.customers.length > 0) {
          defaults[group.phone] = group.customers[0].id;
        }
      }

      setKeepSelections(defaults);
      setMergeOpen(true);
    } catch (error) {
      console.error("Duplicate search error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to find duplicates"
      );
    } finally {
      setMergeLoading(false);
    }
  }

  async function executeMerge(phone: string) {
    const group = mergeGroups.find(
      (item) => item.phone === phone
    );

    if (!group) return;

    const keepId = keepSelections[phone];

    if (!keepId) return;

    const mergeCustomer = group.customers.find(
      (customer) => customer.id !== keepId
    );

    if (!mergeCustomer) return;

    setMergingPhone(phone);

    try {
      const res = await fetch("/api/customers/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keepId,
          mergeId: mergeCustomer.id,
        }),
      });

      const text = await res.text();

      let data: { error?: string } = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        throw new Error(data.error || "Merge failed");
      }

      setMergeGroups((previous) =>
        previous.filter((group) => group.phone !== phone)
      );

      await fetchCustomers();
    } catch (error) {
      console.error("Merge error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Merge failed"
      );
    } finally {
      setMergingPhone(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
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

      <div className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 sm:w-80">
        <Search className="h-4 w-4 text-muted-foreground" />

        <input
          placeholder={t("search_placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-xs font-medium uppercase text-muted-foreground">
                <th className="px-4 py-3">
                  {t("name")}
                </th>

                <th className="px-4 py-3">
                  Type
                </th>

                <th className="px-4 py-3">
                  ID
                </th>

                <th className="px-4 py-3 text-right">
                  {t("total_spent")}
                </th>

                <th className="px-4 py-3 text-right">
                  {t("visits")}
                </th>

                <th className="px-4 py-3 text-right">
                  {t("last_visit")}
                </th>

                <th className="px-4 py-3 text-center">
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
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-2 py-1 text-xs font-medium">
                        {customer.type}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {customer.type === "STUDENT"
                        ? customer.schoolId || "-"
                        : customer.staffId || "-"}
                    </td>

                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(
                        customer.totalSpend
                      )}
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

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() =>
                            openEdit(customer)
                          }
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

        <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
          <button
            onClick={() =>
              setPage((current) =>
                Math.max(1, current - 1)
              )
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

      {/* Merge duplicates */}
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
                  Customers with duplicate phone numbers are
                  listed below.
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
                    No duplicate customers found
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
                      <AlertTriangle className="h-4 w-4" />
                      <Phone className="h-3.5 w-3.5" />
                      <span>{group.phone}</span>

                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        {group.customers.length} records
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
                              setKeepSelections(
                                (previous) => ({
                                  ...previous,
                                  [group.phone]:
                                    customer.id,
                                })
                              )
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
                                {customer.type}
                                {" · "}
                                {customer.salesCount} sales
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
                        The duplicate record will be merged into
                        the selected customer.
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

                        Merge
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

      {/* Create/Edit customer */}
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
                    ? "Edit Customer"
                    : "New Customer"}
                </h3>
              </div>

              <div className="space-y-4 p-6">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Name{" "}
                    <span className="text-destructive">
                      *
                    </span>
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
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="John Doe"
                  />
                </div>

                {/* Customer type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Customer type{" "}
                    <span className="text-destructive">
                      *
                    </span>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((previous) => ({
                          ...previous,
                          type: "STUDENT",
                          staffId: "",
                        }))
                      }
                      className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                        formData.type === "STUDENT"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      Student
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFormData((previous) => ({
                          ...previous,
                          type: "STAFF",
                          schoolId: "",
                        }))
                      }
                      className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                        formData.type === "STAFF"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      Staff
                    </button>
                  </div>
                </div>

                {/* Student ID */}
                {formData.type === "STUDENT" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      School ID
                    </label>

                    <input
                      value={formData.schoolId}
                      onChange={(e) =>
                        setFormData((previous) => ({
                          ...previous,
                          schoolId: e.target.value,
                        }))
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Student ID"
                    />
                  </div>
                )}

                {/* Staff ID */}
                {formData.type === "STAFF" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Staff ID
                    </label>

                    <input
                      value={formData.staffId}
                      onChange={(e) =>
                        setFormData((previous) => ({
                          ...previous,
                          staffId: e.target.value,
                        }))
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Employee ID"
                    />
                  </div>
                )}

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

                  {formLoading
                    ? "Saving..."
                    : tc("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
