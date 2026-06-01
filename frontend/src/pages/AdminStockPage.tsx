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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiAdjustStock,
  apiCreateStockItem,
  apiDeleteStockItem,
  apiEnabled,
  apiListStock,
  apiUpdateStockItem,
  type StockItem,
} from "../lib/api";

const LOCAL_KEY = "gom-stock";

function loadLocal(): StockItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as StockItem[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(items: StockItem[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function newId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type EditForm = {
  nameEn: string;
  nameBn: string;
  unit: string;
  quantity: string;
  reorderLevel: string;
  notes: string;
};

const EMPTY_FORM: EditForm = {
  nameEn: "",
  nameBn: "",
  unit: "kg",
  quantity: "0",
  reorderLevel: "0",
  notes: "",
};

export function AdminStockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  // Add/Edit dialog
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Adjust dialog
  const [adjustTarget, setAdjustTarget] = useState<StockItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      if (apiEnabled()) {
        const data = await apiListStock();
        setItems(data);
      } else {
        setItems(loadLocal());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.nameEn.toLowerCase().includes(q) ||
        i.nameBn.toLowerCase().includes(q) ||
        i.unit.toLowerCase().includes(q),
    );
  }, [items, query]);

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setShowAddEdit(true);
  }

  function openEdit(item: StockItem) {
    setEditTarget(item);
    setForm({
      nameEn: item.nameEn,
      nameBn: item.nameBn,
      unit: item.unit,
      quantity: String(item.quantity),
      reorderLevel: String(item.reorderLevel),
      notes: item.notes ?? "",
    });
    setSaveError(null);
    setShowAddEdit(true);
  }

  async function handleSave() {
    if (!form.nameEn.trim()) {
      setSaveError("Name (English) is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        nameEn: form.nameEn.trim(),
        nameBn: form.nameBn.trim(),
        unit: form.unit.trim() || "kg",
        quantity: Number(form.quantity) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        notes: form.notes.trim() || null,
      };
      if (apiEnabled()) {
        if (editTarget) {
          await apiUpdateStockItem(editTarget.id, payload);
        } else {
          await apiCreateStockItem(payload);
        }
        await loadItems();
      } else {
        if (editTarget) {
          const updated = items.map((i) =>
            i.id === editTarget.id ? { ...i, ...payload } : i,
          );
          saveLocal(updated);
          setItems(updated);
        } else {
          const newItem: StockItem = {
            id: newId(),
            catalogItemId: null,
            isActive: true,
            updatedAt: null,
            ...payload,
          };
          const updated = [newItem, ...items];
          saveLocal(updated);
          setItems(updated);
        }
      }
      setShowAddEdit(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function openAdjust(item: StockItem) {
    setAdjustTarget(item);
    setAdjustDelta("");
    setAdjustNotes("");
    setAdjustError(null);
  }

  async function handleAdjust() {
    if (!adjustTarget) return;
    const delta = Number(adjustDelta);
    if (!adjustDelta.trim() || isNaN(delta)) {
      setAdjustError("Enter a valid number (positive or negative).");
      return;
    }
    setAdjusting(true);
    setAdjustError(null);
    try {
      if (apiEnabled()) {
        await apiAdjustStock(adjustTarget.id, delta, adjustNotes || undefined);
        await loadItems();
      } else {
        const updated = items.map((i) =>
          i.id === adjustTarget.id
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i,
        );
        saveLocal(updated);
        setItems(updated);
      }
      setAdjustTarget(null);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Failed to adjust.");
    } finally {
      setAdjusting(false);
    }
  }

  async function handleDelete(item: StockItem) {
    setDeleting(true);
    try {
      if (apiEnabled()) {
        await apiDeleteStockItem(item.id);
        await loadItems();
      } else {
        const updated = items.filter((i) => i.id !== item.id);
        saveLocal(updated);
        setItems(updated);
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

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
            <BreadcrumbPage>Stock management</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Stock management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track inventory levels and reorder thresholds.
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-2 self-start"
          onClick={openAdd}
        >
          <PlusCircle className="h-4 w-4" />
          Add item
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items…"
              className="h-10 border-border bg-muted pl-9 shadow-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="pl-6">Item</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Reorder at</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    No stock items found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => {
                  const low = item.quantity <= item.reorderLevel;
                  return (
                    <TableRow key={item.id} className="border-b border-border">
                      <TableCell className="pl-6">
                        <p className="font-medium text-foreground">
                          {item.nameEn}
                        </p>
                        {item.nameBn && (
                          <p className="text-xs text-muted-foreground">
                            {item.nameBn}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.unit}
                      </TableCell>
                      <TableCell
                        className={
                          low ? "font-semibold text-red-600" : "text-sm"
                        }
                      >
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.reorderLevel}
                      </TableCell>
                      <TableCell>
                        {low ? (
                          <Badge className="gap-1 rounded-md border-0 bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-400">
                            <TrendingDown className="h-3 w-3" />
                            Low stock
                          </Badge>
                        ) : (
                          <Badge className="gap-1 rounded-md border-0 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400">
                            <TrendingUp className="h-3 w-3" />
                            OK
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                            onClick={() => openAdjust(item)}
                          >
                            Adjust
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => openEdit(item)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(item)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog
        open={showAddEdit}
        onOpenChange={(o) => {
          if (!saving) setShowAddEdit(o);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit stock item" : "Add stock item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nameEn">Name (English) *</Label>
              <Input
                id="nameEn"
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameBn">Name (বাংলা)</Label>
              <Input
                id="nameBn"
                value={form.nameBn}
                onChange={(e) => setForm({ ...form, nameBn: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="kg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  min={0}
                  step="any"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reorderLevel">Reorder at</Label>
                <Input
                  id="reorderLevel"
                  type="number"
                  value={form.reorderLevel}
                  onChange={(e) =>
                    setForm({ ...form, reorderLevel: e.target.value })
                  }
                  min={0}
                  step="any"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddEdit(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog
        open={Boolean(adjustTarget)}
        onOpenChange={(o) => {
          if (!adjusting) {
            if (!o) setAdjustTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust quantity — {adjustTarget?.nameEn}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Current:{" "}
              <span className="font-semibold text-foreground">
                {adjustTarget?.quantity} {adjustTarget?.unit}
              </span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delta">Change amount (e.g. +10 or -5)</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() =>
                    setAdjustDelta((v) => {
                      const n = Number(v);
                      return isNaN(n) ? "-1" : String(n - 1);
                    })
                  }
                >
                  <TrendingDown className="h-4 w-4" />
                </Button>
                <Input
                  id="delta"
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  step="any"
                  className="text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() =>
                    setAdjustDelta((v) => {
                      const n = Number(v);
                      return isNaN(n) ? "1" : String(n + 1);
                    })
                  }
                >
                  <TrendingUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjustNotes">Notes (optional)</Label>
              <Input
                id="adjustNotes"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
              />
            </div>
            {adjustError && (
              <p className="text-sm text-destructive">{adjustError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdjustTarget(null)}
              disabled={adjusting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAdjust} disabled={adjusting}>
              {adjusting ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!deleting && !o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete stock item?</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            Remove{" "}
            <span className="font-semibold text-foreground">
              {deleteTarget?.nameEn}
            </span>{" "}
            from stock? This cannot be undone.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
