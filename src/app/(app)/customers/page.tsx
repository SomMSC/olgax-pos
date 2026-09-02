"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Search,
  Plus,
  Loader2,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Customer = {
  id: string;
  name: string;
  type: "STUDENT" | "STAFF";
  schoolId: string | null;
  staffId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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
      const params = new URLSearchParams();

      if (debouncedQuery) {
        params.set("search", debouncedQuery);
      }

      params.set("page", String(page));
      params.set("limit", "10");

      const res = await fetch(`/api/customers?${params.toString()}`);

      if (!res.ok) {
        throw new Error("Failed to fetch customers");
      }

      const data = await res.json();

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const name = formData.name.trim();

    if (!name) {
      setFormError("Name is required");
      return;
    }

    setFormLoading(true);
    setFormError("");

    try {
      const url = editingCustomer
        ? `/api/customers/${editingCustomer.id}`
        : "/api/customers";

      const method = editingCustomer ? "PUT" : "POST";

      const payload = {
        name,
        type: formData.type,
        schoolId:
          formData.type === "STUDENT" && formData.schoolId.trim()
            ? formData.schoolId.trim()
            : null,
        staffId:
          formData.type === "STAFF" && formData.staffId.trim()
            ? formData.staffId.trim()
            : null,
      };

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
        throw new Error(data.error || "Failed to save customer");
      }

      setModalOpen(false);
      setEditingCustomer(null);

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
    if (!confirm("Are you sure you want to delete this customer?")) {
      return;
    }

    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text();

        let message = "Failed to delete customer";

        if (text) {
          try {
            const data = JSON.parse(text);
            message = data.error || message;
          } catch {
            // Keep default message.
          }
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

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>

          <p className="text-sm text-muted-foreground">
            Manage your customer database.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t("add")}
        </button>
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

                <th className="px-4 py-3">
                  Status
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
                    colSpan={5}
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
                    colSpan={5}
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
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          customer.type === "STUDENT"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        }`}
                      >
                        {customer.type === "STUDENT"
                          ? "Student"
                          : "Staff"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {customer.type === "STUDENT"
                        ? customer.schoolId || "-"
                        : customer.staffId || "-"}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          customer.active
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {customer.active
                          ? "Active"
                          : "Inactive"}
                      </span>
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
              setPage((p) => Math.max(1, p - 1))
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
              setPage((p) =>
                Math.min(totalPages, p + 1)
              )
            }
            disabled={page === totalPages || loading}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            {tc("next")}
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!formLoading) {
                setModalOpen(false);
              }
            }}
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

              <div className="space-y-5 p-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("name")}{" "}
                    <span className="text-destructive">
                      *
                    </span>
                  </label>

                  <input
                    required
                    autoFocus
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        name: e.target.value,
                      })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="John Doe"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Customer type
                  </label>

                  <select
                    value={formData.type}
                    onChange={(e) => {
                      const nextType =
                        e.target.value as
                          | "STUDENT"
                          | "STAFF";

                      setFormData({
                        ...formData,
                        type: nextType,
                        schoolId:
                          nextType === "STUDENT"
                            ? formData.schoolId
                            : "",
                        staffId:
                          nextType === "STAFF"
                            ? formData.staffId
                            : "",
                      });
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="STUDENT">
                      Student
                    </option>

                    <option value="STAFF">
                      Staff
                    </option>
                  </select>
                </div>

                {formData.type === "STUDENT" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      School ID
                    </label>

                    <input
                      value={formData.schoolId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          schoolId: e.target.value,
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Student ID"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Staff ID
                    </label>

                    <input
                      value={formData.staffId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          staffId: e.target.value,
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Staff ID"
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
                  disabled={formLoading}
                  onClick={() =>
                    setModalOpen(false)
                  }
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
                    ? tc("loading")
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
