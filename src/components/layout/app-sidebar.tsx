"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ShoppingCart,
  Package,
  ReceiptText,
  BarChart3,
  Settings,
  LogOut,
  Users,
  Truck,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  user: {
    name: string;
    email: string;
    role?: string;
  };
  onLinkClick?: () => void;
}

const navItems = [
  { href: "/pos", key: "pos", icon: ShoppingCart, roles: ["ADMIN", "CASHIER"] },
  { href: "/products", key: "products", icon: Package, roles: ["ADMIN"] },
  { href: "/suppliers", key: "suppliers", icon: Truck, roles: ["ADMIN"] },
  { href: "/customers", key: "customers", icon: Users, roles: ["ADMIN"] },
  { href: "/sales", key: "sales", icon: ReceiptText, roles: ["ADMIN", "CASHIER"] },
  { href: "/reports", key: "reports", icon: BarChart3, roles: ["ADMIN"] },
  { href: "/settings", key: "settings", icon: Settings, roles: ["ADMIN"] },
];

export function AppSidebar({ user, onLinkClick }: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const role = user.role ?? "CASHIER";

  const visibleNav = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-sidebar">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/android-chrome-192x192.png"
          alt="Olgax POS"
          className="h-9 w-9 rounded-xl object-contain shrink-0"
        />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">Olgax</span>
          <span className="text-[10px] font-semibold tracking-widest uppercase text-sidebar-primary">
            POS
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {visibleNav.map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            onClick={onLinkClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {t(key as any)}
          </Link>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none truncate text-sidebar-foreground">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate mt-0.5">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
