import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bell,
  BookText,
  Building2,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BRAND_DEFAULTS, useBrand } from "../context/BrandContext";
import {
  clearNewSignupNotification,
  NOTIFICATIONS_EVENT,
  readNewSignups,
  readNewSignupUserIds,
  type SignupNotification,
} from "../lib/orderNotifications";
import { startHeartbeat } from "../lib/userPresence";
import type { Role } from "../types";
import { BrandLogo } from "./BrandLogo";

/**
 * Dashboard root entries (/admin, /moderator/dashboard) are exact-only so that
 * sub-routes like /admin/orders/123 do not accidentally activate them.
 * All other nav items match their own path and any sub-paths; the longest
 * match wins, so /admin/orders/new activates "New order" not "Order list".
 */
function navItemActive(path: string, to: string): boolean {
  if (to === "/admin" || to === "/moderator/dashboard") return path === to;
  return path === to || path.startsWith(`${to}/`);
}

const navFor: Record<
  Role,
  { to: string; label: string; icon: typeof LayoutDashboard }[]
> = {
  user: [
    { to: "/user/orders/new", label: "New order", icon: Package },
    { to: "/user/orders", label: "Orders", icon: ClipboardList },
    { to: "/user/invoices", label: "Invoices", icon: FileText },
    { to: "/user/catalog/categories", label: "Category list", icon: BookText },
    { to: "/user/catalog/products", label: "Product list", icon: Package },
  ],
  moderator: [
    { to: "/moderator/orders/new", label: "New order", icon: Plus },
    { to: "/moderator/dashboard", label: "Dashboard", icon: BarChart3 },
    { to: "/moderator/orders", label: "Order list", icon: ClipboardList },
    {
      to: "/moderator/purchase-pending-bills",
      label: "Purchase pending bills",
      icon: FileText,
    },
    {
      to: "/moderator/purchase-statements",
      label: "Purchase statements",
      icon: FileText,
    },
    {
      to: "/moderator/catalog/categories",
      label: "Category list",
      icon: Package,
    },
    { to: "/moderator/catalog/products", label: "Product list", icon: Package },
  ],
  admin: [
    { to: "/admin/orders/new", label: "New order (bookkeeping)", icon: Plus },
    { to: "/admin", label: "Admin dashboard", icon: BarChart3 },
    { to: "/admin/orders", label: "Order list", icon: ClipboardList },
    {
      to: "/admin/purchase-pending-bills",
      label: "Purchase pending bills",
      icon: FileText,
    },
    {
      to: "/admin/purchase-statements",
      label: "Purchase statements",
      icon: FileText,
    },
    { to: "/admin/statements", label: "Billing statements", icon: FileText },
    { to: "/admin/outstanding", label: "Pending bills", icon: FileText },
    { to: "/admin/ledger", label: "Financial ledger", icon: BookText },
    { to: "/admin/catalog/categories", label: "Category list", icon: BookText },
    { to: "/admin/catalog/products", label: "Product list", icon: Package },
    { to: "/admin/users", label: "User list", icon: Users },
    { to: "/admin/moderators", label: "Moderator list", icon: UserCog },
    { to: "/admin/create", label: "Create user/moderator", icon: UserPlus },
    { to: "/admin/stock", label: "Stock management", icon: Package },
  ],
  master_admin: [
    { to: "/admin/orders/new", label: "New order (bookkeeping)", icon: Plus },
    { to: "/admin", label: "Admin dashboard", icon: BarChart3 },
    { to: "/admin/orders", label: "Order list", icon: ClipboardList },
    {
      to: "/admin/purchase-pending-bills",
      label: "Purchase pending bills",
      icon: FileText,
    },
    {
      to: "/admin/purchase-statements",
      label: "Purchase statements",
      icon: FileText,
    },
    { to: "/admin/statements", label: "Billing statements", icon: FileText },
    { to: "/admin/outstanding", label: "Pending bills", icon: FileText },
    { to: "/admin/ledger", label: "Financial ledger", icon: BookText },
    { to: "/admin/catalog/categories", label: "Category list", icon: BookText },
    { to: "/admin/catalog/products", label: "Product list", icon: Package },
    { to: "/admin/users", label: "User list", icon: Users },
    { to: "/admin/moderators", label: "Moderator list", icon: UserCog },
    { to: "/admin/create", label: "Create user/moderator", icon: UserPlus },
    { to: "/admin/stock", label: "Stock management", icon: Package },
  ],
};

export function AppShell() {
  const { user, logout, updateProfile, updatePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifTick, setNotifTick] = useState(0);
  const [newSignups, setNewSignups] = useState<SignupNotification[]>(() =>
    readNewSignups(),
  );
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showBrand, setShowBrand] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [billingAddress, setBillingAddress] = useState(
    user?.billingAddress ?? "",
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    user?.deliveryAddress ?? "",
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [message, setMessage] = useState("");
  const { brand, updateBrand } = useBrand();
  const [brandNameEn, setBrandNameEn] = useState(brand.companyNameEn);
  const [brandNameBn, setBrandNameBn] = useState(brand.companyNameBn);
  const [brandAddress, setBrandAddress] = useState(brand.companyAddress);
  const [brandHotline, setBrandHotline] = useState(brand.hotline);
  const [brandLogoUrl, setBrandLogoUrl] = useState(brand.logoUrl);
  const [dark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("gom-theme") === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      window.localStorage.setItem("gom-theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);

  useEffect(() => {
    const bump = () => {
      setNotifTick((t) => t + 1);
      setNewSignups(readNewSignups());
    };
    window.addEventListener(NOTIFICATIONS_EVENT, bump);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!user) return;
    return startHeartbeat(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setPhone(user.phone);
    setBillingAddress(user.billingAddress);
    setDeliveryAddress(user.deliveryAddress);
  }, [
    user?.name,
    user?.phone,
    user?.billingAddress,
    user?.deliveryAddress,
    user,
  ]);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "user") return;
    const needsProfile =
      !user.phone.trim() ||
      !user.billingAddress.trim() ||
      !user.deliveryAddress.trim();
    if (needsProfile) {
      setShowProfile(true);
      setMessage("Please complete profile before creating orders.");
    }
  }, [user]);

  const orderNotifyCount = useMemo(() => {
    void notifTick;
    if (!user) return 0;
    // Bell badge = new user signups only (admin/master_admin)
    if (user.role === "admin" || user.role === "master_admin")
      return readNewSignupUserIds().length;
    return 0;
  }, [notifTick, user]);

  if (!user) return <Outlet />;

  const items = navFor[user.role];
  const dedup = items.filter(
    (item, i, arr) => arr.findIndex((x) => x.to === item.to) === i,
  );
  const activeNavTo = useMemo(() => {
    const path = location.pathname;
    const matches = dedup
      .filter(({ to }) => navItemActive(path, to))
      .sort((a, b) => b.to.length - a.to.length);
    return matches[0]?.to ?? null;
  }, [dedup, location.pathname]);
  const primaryCta =
    user.role === "user"
      ? { to: "/user/orders/new", label: "New order", Icon: Plus }
      : user.role === "moderator"
        ? { to: "/moderator/orders/new", label: "New order", Icon: Plus }
        : { to: "/admin/orders", label: "Orders", Icon: ClipboardList };
  const PrimaryIcon = primaryCta.Icon;
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || user.name.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {mobileNavOpen ? (
        <Button
          type="button"
          variant="ghost"
          className="fixed inset-0 z-40 h-auto min-h-0 w-full rounded-none bg-slate-900 p-0 md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close menu overlay"
        />
      ) : null}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-border bg-card py-4 shadow-sm transition-all max-md:bg-background max-md:shadow-xl md:z-40",
          sidebarCollapsed ? "md:w-20" : "md:w-60",
          mobileNavOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="mb-4 flex items-center justify-between px-3">
          <div
            className={cn(
              "min-w-0 flex-1 overflow-hidden",
              sidebarCollapsed ? "md:hidden" : "",
            )}
          >
            {user.role === "admin" || user.role === "master_admin" ? (
              <button
                type="button"
                title="Change logo & brand"
                className="group relative w-full text-left"
                onClick={() => {
                  setBrandNameEn(brand.companyNameEn);
                  setBrandNameBn(brand.companyNameBn);
                  setBrandAddress(brand.companyAddress);
                  setBrandHotline(brand.hotline);
                  setBrandLogoUrl(brand.logoUrl);
                  setShowBrand(true);
                }}
              >
                <BrandLogo showMark compact className="min-w-0" />
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 text-xs font-semibold text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                  Change logo
                </span>
              </button>
            ) : (
              <BrandLogo showMark compact className="min-w-0" />
            )}
          </div>
          <div className={cn("shrink-0", !sidebarCollapsed && "md:hidden")}>
            {user.role === "admin" || user.role === "master_admin" ? (
              <button
                type="button"
                title="Change logo & brand"
                className="group relative"
                onClick={() => {
                  setBrandNameEn(brand.companyNameEn);
                  setBrandNameBn(brand.companyNameBn);
                  setBrandAddress(brand.companyAddress);
                  setBrandHotline(brand.hotline);
                  setBrandLogoUrl(brand.logoUrl);
                  setShowBrand(true);
                }}
              >
                <img
                  src={
                    brand.logoUrl ?? `${import.meta.env.BASE_URL}hmc-logo.png`
                  }
                  alt=""
                  className="h-9 w-9 rounded-xl object-contain bg-muted p-1"
                />
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 text-[9px] font-semibold text-white opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
                  Edit
                </span>
              </button>
            ) : (
              <img
                src={brand.logoUrl ?? `${import.meta.env.BASE_URL}hmc-logo.png`}
                alt=""
                className="h-9 w-9 rounded-xl object-contain bg-muted p-1"
              />
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden text-primary md:inline-flex"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(false)}
            className="md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {dedup.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to + label}
              to={to}
              title={label}
              onClick={() => setMobileNavOpen(false)}
              className={() =>
                cn(
                  buttonVariants({
                    variant: "ghost",
                    size: "sm",
                  }),
                  "h-auto w-full justify-start gap-3 rounded-xl py-2.5",
                  to === activeNavTo &&
                    "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
                  sidebarCollapsed && "md:justify-center md:gap-0 md:px-2",
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className={cn(sidebarCollapsed && "md:hidden")}>
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-auto w-full justify-start gap-3 rounded-xl py-2.5 font-semibold text-destructive hover:bg-red-50 hover:text-destructive dark:hover:bg-red-950",
              sidebarCollapsed && "md:justify-center md:gap-0 md:px-2",
            )}
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            title="Logout"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className={cn(sidebarCollapsed && "md:hidden")}>Logout</span>
          </Button>

          <div
            className={cn(
              "mt-3 border-t border-border pt-3 text-center",
              sidebarCollapsed && "md:hidden",
            )}
          >
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Designed &amp; developed by{" "}
              <a
                href="https://invatiqsoft.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-foreground hover:underline"
              >
                InvatiqSoft
              </a>
            </p>
            <p className="text-[10px] text-muted-foreground">
              <a
                href="mailto:support@invatiqsoft.com"
                className="hover:underline"
              >
                support@invatiqsoft.com
              </a>
            </p>
            <p className="text-[10px] text-muted-foreground">
              <a href="tel:+8801867254624" className="hover:underline">
                01867254624
              </a>
            </p>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "min-h-screen bg-muted",
          sidebarCollapsed ? "md:pl-20" : "md:pl-60",
        )}
      >
        <header className="sticky top-0 z-30 border-b border-border bg-white shadow-sm dark:border-border dark:bg-zinc-950">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-3.5">
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileNavOpen(true)}
                className="shrink-0 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <BrandLogo
                compact
                className="hidden min-w-0 shrink-0 sm:block md:max-w-[min(52vw,320px)]"
              />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-9 max-w-[11rem] gap-1.5 truncate rounded-md bg-slate-700 px-2.5 font-semibold text-white shadow-sm hover:bg-slate-600 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100 sm:max-w-none sm:px-3"
                onClick={() => navigate(primaryCta.to)}
              >
                <PrimaryIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{primaryCta.label}</span>
              </Button>
              <Separator
                orientation="vertical"
                className="mx-0.5 hidden h-7 sm:block"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="relative h-9 w-9 shrink-0 text-muted-foreground"
                    aria-label={
                      orderNotifyCount > 0
                        ? `${orderNotifyCount} notification${orderNotifyCount === 1 ? "" : "s"}`
                        : "Notifications"
                    }
                    title="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {orderNotifyCount > 0 ? (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950" />
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-0">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                    <p className="text-sm font-semibold">Notifications</p>
                    {orderNotifyCount > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {orderNotifyCount}
                      </span>
                    )}
                  </div>

                  {/* New customer signups — admin only */}
                  {(user.role === "admin" || user.role === "master_admin") &&
                    newSignups.length > 0 && (
                      <>
                        <div className="px-3 pt-2.5 pb-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            New customers ({newSignups.length})
                          </p>
                        </div>
                        {newSignups.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            className="flex items-start gap-3 px-3 py-2.5 cursor-pointer"
                            onSelect={() => {
                              clearNewSignupNotification(s.id);
                              navigate("/admin/users");
                            }}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                              {s.name.trim().charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {s.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {s.email}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(s.at).toLocaleString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          className="px-3 py-2 text-xs font-semibold text-primary cursor-pointer"
                          onSelect={() => navigate("/admin/users")}
                        >
                          View all users →
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}

                  {/* Moderator: new submitted orders */}
                  {user.role === "moderator" && orderNotifyCount > 0 && (
                    <>
                      <div className="px-3 pt-2.5 pb-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          New orders ({orderNotifyCount})
                        </p>
                      </div>
                      <DropdownMenuItem
                        className="px-3 py-2.5 cursor-pointer"
                        onSelect={() => navigate("/moderator/orders")}
                      >
                        <ClipboardList className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">View submitted orders</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {orderNotifyCount === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No new notifications
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 rounded-full border-border bg-white px-1.5 shadow-sm hover:bg-muted dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                      {initials}
                    </span>
                    <span className="hidden max-w-[120px] truncate text-xs font-semibold sm:inline">
                      {(() => {
                        const p = user.name.trim().split(/\s+/).filter(Boolean);
                        if (p.length >= 2)
                          return `${p[0]} ${p[1].slice(0, 1)}.`;
                        return user.name;
                      })()}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-2">
                  <DropdownMenuLabel className="px-2 py-2 font-normal">
                    <p className="text-sm font-semibold leading-tight text-foreground">
                      {user.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    onSelect={() => {
                      setShowProfile(true);
                      setMessage("");
                    }}
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  {(user.role === "admin" || user.role === "master_admin") && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setBrandNameEn(brand.companyNameEn);
                        setBrandNameBn(brand.companyNameBn);
                        setBrandAddress(brand.companyAddress);
                        setBrandHotline(brand.hotline);
                        setBrandLogoUrl(brand.logoUrl);
                        setShowBrand(true);
                      }}
                    >
                      <Building2 className="h-4 w-4" />
                      Brand settings
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      setShowPassword(true);
                      setMessage("");
                    }}
                  >
                    <Lock className="h-4 w-4" />
                    Change password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive data-[highlighted]:bg-red-50 data-[highlighted]:text-destructive dark:data-[highlighted]:bg-red-950"
                    onSelect={() => {
                      logout();
                      navigate("/login", { replace: true });
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-screen-2xl px-4 py-5 md:px-6 md:py-8">
          <Outlet />
        </main>
      </div>

      <Dialog
        open={showProfile}
        onOpenChange={(o) => {
          if (!o) setMessage("");
          setShowProfile(o);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4" />
              Profile settings
            </DialogTitle>
            <DialogDescription>
              Update name, phone, billing and delivery address.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-billing">Billing address</Label>
              <Input
                id="profile-billing"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-delivery">Delivery address</Label>
              <Input
                id="profile-delivery"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
            {message ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowProfile(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={async () => {
                const res = await updateProfile({
                  name,
                  phone,
                  billingAddress,
                  deliveryAddress,
                });
                setMessage(
                  res.ok
                    ? "Profile updated."
                    : (res.message ?? "Update failed."),
                );
                if (res.ok) setTimeout(() => setShowProfile(false), 700);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPassword}
        onOpenChange={(o) => {
          if (!o) setMessage("");
          setShowPassword(o);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Change password
            </DialogTitle>
            <DialogDescription>
              Enter your current password and a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pwd-current">Current password</Label>
              <Input
                id="pwd-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pwd-next">New password</Label>
              <Input
                id="pwd-next"
                type="password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
              />
            </div>
            {message ? (
              <p className="text-xs text-muted-foreground">{message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPassword(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                const res = updatePassword(currentPassword, nextPassword);
                setMessage(
                  res.ok
                    ? "Password updated."
                    : (res.message ?? "Update failed."),
                );
                if (res.ok) {
                  setCurrentPassword("");
                  setNextPassword("");
                  setTimeout(() => setShowPassword(false), 700);
                }
              }}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBrand} onOpenChange={setShowBrand}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Brand settings
            </DialogTitle>
            <DialogDescription>
              Update the company logo and address shown in the header, invoices,
              and challans.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <img
                  src={
                    brandLogoUrl ?? `${import.meta.env.BASE_URL}hmc-logo.png`
                  }
                  alt="Logo preview"
                  className="h-14 w-auto rounded border border-border object-contain bg-muted p-1"
                />
                <div className="flex flex-col gap-1.5">
                  <Input
                    id="brand-logo-upload"
                    type="file"
                    accept="image/*"
                    className="h-auto cursor-pointer text-xs file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setBrandLogoUrl(ev.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {brandLogoUrl && (
                    <button
                      type="button"
                      className="text-left text-xs text-muted-foreground underline hover:text-destructive"
                      onClick={() => setBrandLogoUrl(null)}
                    >
                      Reset to default logo
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brand-name-en">Company name (English)</Label>
              <Input
                id="brand-name-en"
                value={brandNameEn}
                onChange={(e) => setBrandNameEn(e.target.value)}
                placeholder={BRAND_DEFAULTS.companyNameEn}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brand-name-bn">Company name (Bengali)</Label>
              <Input
                id="brand-name-bn"
                value={brandNameBn}
                onChange={(e) => setBrandNameBn(e.target.value)}
                placeholder={BRAND_DEFAULTS.companyNameBn}
                className="font-bn"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brand-address">Address</Label>
              <Input
                id="brand-address"
                value={brandAddress}
                onChange={(e) => setBrandAddress(e.target.value)}
                placeholder={BRAND_DEFAULTS.companyAddress}
                className="font-bn"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brand-hotline">Hotline</Label>
              <Input
                id="brand-hotline"
                value={brandHotline}
                onChange={(e) => setBrandHotline(e.target.value)}
                placeholder={BRAND_DEFAULTS.hotline}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBrand(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                updateBrand({
                  logoUrl: brandLogoUrl,
                  companyNameEn:
                    brandNameEn.trim() || BRAND_DEFAULTS.companyNameEn,
                  companyNameBn:
                    brandNameBn.trim() || BRAND_DEFAULTS.companyNameBn,
                  companyAddress:
                    brandAddress.trim() || BRAND_DEFAULTS.companyAddress,
                  hotline: brandHotline.trim() || BRAND_DEFAULTS.hotline,
                });
                setShowBrand(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
