import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  tableActionsContainerClass,
  tableActionsTightAccountRow,
  tableActionsWideAccountRow,
} from "@/lib/tableActionsLayout";
import { cn } from "@/lib/utils";
import {
  Ban,
  MoreVertical,
  Pencil,
  Search,
  Shield,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOnlineUserIds } from "../../lib/userPresence";
import type { Role, SessionUser } from "../../types";
import { ConfirmActionModal } from "../ConfirmActionModal";
import { ExportToolbar, useColumnVisibility } from "../ExportToolbar";
import {
  SortableHeader,
  nextSort,
  sortRows,
  type SortDir,
} from "../SortableHeader";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0] ?? ""}${p[1][0] ?? ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function departmentLabel(a: SessionUser): string {
  const line = a.billingAddress?.trim().split("\n")[0]?.trim();
  if (!line) return "—";
  return line.length > 36 ? `${line.slice(0, 34)}…` : line;
}

function registeredLabel(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactPages(current: number, total: number): Array<number | "..."> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  const nums = Array.from(set)
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out: Array<number | "..."> = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push("...");
    out.push(nums[i]);
  }
  return out;
}

export function AdminAccountsDataTable({
  kind,
  accounts,
}: {
  kind: "users" | "moderators";
  accounts: SessionUser[];
}) {
  const title = kind === "users" ? "Users" : "Moderators";
  const crumb = kind === "users" ? "Users" : "Moderators";
  const subtitle =
    kind === "users"
      ? "Manage procurement requesters and their contact details."
      : "Manage moderators who process orders and documents.";
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const COL_DEFS = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "role", label: "Role" },
    { key: "department", label: "Department" },
    { key: "status", label: "Status" },
    { key: "registeredAt", label: "Registered" },
    { key: "actions", label: "Actions" },
  ];
  const { visibleColumns, toggleColumn, isVisible } =
    useColumnVisibility(COL_DEFS);

  const getData = () => {
    const headers = COL_DEFS.filter(
      (c) => c.key !== "actions" && isVisible(c.key),
    ).map((c) => c.label);
    const rows = sorted.map((a) => {
      const status = a.phone?.trim() ? "Active" : "Inactive";
      const role = kind === "users" ? "User" : "Moderator";
      const cols: string[] = [];
      if (isVisible("name")) cols.push(a.name);
      if (isVisible("email")) cols.push(a.email);
      if (isVisible("role")) cols.push(role);
      if (isVisible("department")) cols.push(departmentLabel(a));
      if (isVisible("status")) cols.push(status);
      if (isVisible("registeredAt")) cols.push(registeredLabel(a.registeredAt));
      return cols;
    });
    return { headers, rows };
  };

  const handleSort = (field: string) => {
    const next = nextSort({ key: sortKey, dir: sortDir }, field);
    setSortKey(next.key);
    setSortDir(next.dir);
    setPage(1);
  };
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() =>
    getOnlineUserIds(),
  );
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const {
    deleteAccountByAdmin,
    blockAccountByAdmin,
    updateRoleByAdmin,
    user: currentUser,
  } = useAuth();

  useEffect(() => {
    // Refresh online status every 15 s so the dot updates without a page reload
    tickRef.current = setInterval(
      () => setOnlineIds(getOnlineUserIds()),
      15_000,
    );
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const result = await deleteAccountByAdmin(deleteTarget.id);
    if (!result.ok) {
      setDeleteError(result.message ?? "Failed to delete account.");
      return;
    }
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleteTarget, deleteAccountByAdmin]);

  const tabFiltered = useMemo(() => {
    if (tab === "active")
      return accounts.filter(
        (a) => Boolean(a.phone?.trim()) && a.isActive !== false,
      );
    if (tab === "inactive")
      return accounts.filter((a) => !a.phone?.trim() && a.isActive !== false);
    if (tab === "suspended")
      return accounts.filter((a) => a.isActive === false);
    return accounts;
  }, [accounts, tab]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.phone || "").toLowerCase().includes(q) ||
        departmentLabel(a).toLowerCase().includes(q),
    );
  }, [tabFiltered, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return searched;
    const key = sortKey as keyof SessionUser;
    return sortRows(searched, key, sortDir);
  }, [searched, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = sorted.slice((safePage - 1) * perPage, safePage * perPage);
  const from = sorted.length === 0 ? 0 : (safePage - 1) * perPage + 1;
  const to = Math.min(safePage * perPage, sorted.length);

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{crumb}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button asChild className="shrink-0 gap-2 self-start sm:self-auto">
          <Link to="/admin/create">
            <span className="text-lg leading-none">+</span>
            {kind === "users" ? "Add user" : "Add moderator"}
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "inactive", "suspended"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                variant={tab === t ? "secondary" : "outline"}
                size="sm"
                className="h-9 rounded-full border px-4 text-xs capitalize shadow-none"
                onClick={() => {
                  setTab(t);
                  setPage(1);
                }}
              >
                {t}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={
                  kind === "users" ? "Search users…" : "Search moderators…"
                }
                className="h-10 border-border bg-muted pl-9 shadow-none"
              />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <ExportToolbar
                filename={`${kind}-export`}
                columns={COL_DEFS}
                visibleColumns={visibleColumns}
                onToggleColumn={toggleColumn}
                getData={getData}
              />
            </div>
          </div>
        </div>

        <div className={tableActionsContainerClass("table-scroll")}>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                {isVisible("name") && (
                  <TableHead className="w-[280px] pl-6">
                    <SortableHeader
                      label="Name"
                      field="name"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {isVisible("email") && (
                  <TableHead>
                    <SortableHeader
                      label="Email"
                      field="email"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {isVisible("role") && (
                  <TableHead>
                    <SortableHeader
                      label="Role"
                      field="role"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {isVisible("department") && (
                  <TableHead className="hidden md:table-cell">
                    <SortableHeader
                      label="Department"
                      field="billingAddress"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {isVisible("status") && (
                  <TableHead>
                    <SortableHeader
                      label="Status"
                      field="phone"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {isVisible("registeredAt") && (
                  <TableHead className="hidden lg:table-cell">
                    <SortableHeader
                      label="Registered"
                      field="registeredAt"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                )}
                {isVisible("actions") && (
                  <TableHead className="w-[100px] pr-6 text-right">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No results match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((a) => {
                  const active = Boolean(a.phone?.trim());
                  return (
                    <TableRow key={a.id} className="border-b border-border">
                      {isVisible("name") && (
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback>
                                  {initials(a.name)}
                                </AvatarFallback>
                              </Avatar>
                              {onlineIds.has(a.id) ? (
                                <span
                                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950"
                                  title="Online"
                                />
                              ) : (
                                <span
                                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-slate-300 ring-2 ring-white dark:ring-zinc-950"
                                  title="Offline"
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {a.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {a.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                      )}
                      {isVisible("email") && (
                        <TableCell className="text-sm text-muted-foreground">
                          {a.email}
                        </TableCell>
                      )}
                      {isVisible("role") && (
                        <TableCell>
                          {kind === "users" ? (
                            <Badge className="rounded-md border-0 bg-muted px-2.5 py-0.5 font-medium text-foreground hover:bg-muted">
                              User
                            </Badge>
                          ) : (
                            <Badge className="rounded-md border-0 bg-orange-500 px-2.5 py-0.5 font-medium text-white hover:bg-orange-500">
                              Moderator
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      {isVisible("department") && (
                        <TableCell className="hidden max-w-[200px] truncate text-muted-foreground md:table-cell">
                          {departmentLabel(a)}
                        </TableCell>
                      )}
                      {isVisible("status") && (
                        <TableCell>
                          {a.isActive === false ? (
                            <Badge className="rounded-md border-0 bg-red-600 px-2.5 py-0.5 font-medium text-white hover:bg-red-600">
                              Blocked
                            </Badge>
                          ) : active ? (
                            <Badge className="rounded-md border-0 bg-emerald-600 px-2.5 py-0.5 font-medium text-white hover:bg-emerald-600">
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="rounded-md font-medium text-muted-foreground"
                            >
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      {isVisible("registeredAt") && (
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {registeredLabel(a.registeredAt)}
                        </TableCell>
                      )}
                      {isVisible("actions") && (
                        <TableCell className="pr-6 text-right">
                          <div className={tableActionsWideAccountRow()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              asChild
                            >
                              <Link
                                to={`/admin/${kind}/${a.id}/edit`}
                                aria-label="Edit account"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Remove"
                              onClick={() => {
                                setDeleteTarget(a);
                                setDeleteError(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className={tableActionsTightAccountRow()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  aria-label="Row actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link
                                    to={`/admin/${kind}/${a.id}/edit`}
                                    className="flex cursor-pointer items-center gap-2"
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                                {a.id !== currentUser?.id && (
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onSelect={async () => {
                                      const res = await blockAccountByAdmin(
                                        a.id,
                                      );
                                      if (!res.ok)
                                        setBlockError(res.message ?? "Failed.");
                                    }}
                                  >
                                    {a.isActive === false ? (
                                      <UserCheck className="h-4 w-4" />
                                    ) : (
                                      <Ban className="h-4 w-4" />
                                    )}
                                    {a.isActive === false ? "Unblock" : "Block"}
                                  </DropdownMenuItem>
                                )}
                                {a.id !== currentUser?.id && (
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger className="gap-2">
                                      <Shield className="h-4 w-4" />
                                      Change role
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {(
                                        [
                                          "user",
                                          "moderator",
                                          "admin",
                                          ...(currentUser?.role ===
                                          "master_admin"
                                            ? ["master_admin"]
                                            : []),
                                        ] as Role[]
                                      ).map((r) => (
                                        <DropdownMenuItem
                                          key={r}
                                          disabled={a.role === r}
                                          onSelect={async () => {
                                            const res = await updateRoleByAdmin(
                                              a.id,
                                              r,
                                            );
                                            if (!res.ok)
                                              setRoleError(
                                                res.message ?? "Failed.",
                                              );
                                          }}
                                        >
                                          {r}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-destructive focus:text-destructive data-[highlighted]:bg-red-50 data-[highlighted]:text-destructive dark:data-[highlighted]:bg-red-950"
                                  onSelect={() => {
                                    setDeleteTarget(a);
                                    setDeleteError(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Showing {from}-{to} of {sorted.length} results
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs">Rows</span>
              <Select
                value={String(perPage)}
                onValueChange={(v) => {
                  setPerPage(parseInt(v, 10));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[4.5rem] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-foreground"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {compactPages(safePage, totalPages).map((p, idx) =>
                p === "..." ? (
                  <span key={`e-${idx}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    type="button"
                    variant={p === safePage ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-9 min-w-9 px-0",
                      p === safePage && "pointer-events-none",
                    )}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ),
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-foreground"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title="Delete account?"
        description={
          deleteError
            ? deleteError
            : `This will soft-delete ${deleteTarget?.name ?? "this account"} (${deleteTarget?.email ?? ""}). The account will be hidden from active lists but stays in the database for audit.`
        }
        confirmLabel="Delete"
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      <ConfirmActionModal
        open={Boolean(blockError)}
        title="Error"
        description={blockError ?? ""}
        confirmLabel="OK"
        onCancel={() => setBlockError(null)}
        onConfirm={() => setBlockError(null)}
      />

      <ConfirmActionModal
        open={Boolean(roleError)}
        title="Error"
        description={roleError ?? ""}
        confirmLabel="OK"
        onCancel={() => setRoleError(null)}
        onConfirm={() => setRoleError(null)}
      />
    </div>
  );
}
