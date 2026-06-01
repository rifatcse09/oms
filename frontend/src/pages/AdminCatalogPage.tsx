import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import {
  SearchableSelect,
  categoryOptionsFromCatalog,
} from "../components/SearchableSelect";
import { useCatalog } from "../context/CatalogContext";
import { useAuth } from "../context/AuthContext";
import { useOrders } from "../context/OrdersContext";
import { PaginationControls } from "../components/PaginationControls";
import {
  apiEnabled,
  apiGetCategoryMarkupSettings,
  apiListCatalogCategories,
  apiListCatalogItems,
  apiUpdateCategoryMarkup,
  type CategoryMarkupHistoryEntry,
} from "../lib/api";
import { getCategoryColor } from "../lib/categoryColors";
import {
  markupPercentToInputString,
  parseMarkupPercentInput,
  roundMarkupPercent,
} from "../lib/markupPercentInput";
import { UNKNOWN_CATEGORY_LABEL } from "../lib/uiLabels";
import { type CategoryDef, isAdministrationRole } from "../types";

type CatalogView = "all" | "categories" | "products";

type ServerCatalogCategoryRow = {
  id: string;
  nameBn: string;
  nameEn: string;
  itemsCount: number;
};

function categoryRowItemCount(row: CategoryDef | ServerCatalogCategoryRow): number {
  if ("itemsCount" in row) return row.itemsCount;
  return row.items.length;
}

export function AdminCatalogPage({ view = "all" }: { view?: CatalogView }) {
  const { user } = useAuth();
  const { orders } = useOrders();
  const { categories, loadCatalog, addCategory, addCustomItem, updateCategory, deleteCategory, updateItem, deleteItem } = useCatalog();
  const [newCatBn, setNewCatBn] = useState("");
  const [newCatEn, setNewCatEn] = useState("");
  const [itemCat, setItemCat] = useState("");
  const [itemBn, setItemBn] = useState("");
  const [itemEn, setItemEn] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editBn, setEditBn] = useState("");
  const [editEn, setEditEn] = useState("");
  const [message, setMessage] = useState("");
  const [catQuery, setCatQuery] = useState("");
  const [catPage, setCatPage] = useState(1);
  const [catPerPage, setCatPerPage] = useState(10);
  const [apiCategories, setApiCategories] = useState<ServerCatalogCategoryRow[]>([]);
  const [apiCategoriesTotal, setApiCategoriesTotal] = useState(0);
  const [itemQuery, setItemQuery] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [itemPerPage, setItemPerPage] = useState(10);
  const [apiItems, setApiItems] = useState<
    Array<{
      id: string;
      categoryId: string;
      nameBn: string;
      nameEn: string;
      categoryNameBn: string;
      categoryNameEn: string;
    }>
  >([]);
  const [apiItemsTotal, setApiItemsTotal] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<
    { type: "category"; id: string; name: string } | { type: "item"; id: string; name: string } | null
  >(null);
  const [categoryMarkups, setCategoryMarkups] = useState<Record<string, number>>({});
  /** Controlled text so users can type decimals (e.g. 7.25) without number-input quirks. */
  const [categoryMarkupDrafts, setCategoryMarkupDrafts] = useState<Record<string, string>>({});
  const [markupHistory, setMarkupHistory] = useState<CategoryMarkupHistoryEntry[]>([]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => `${a.nameEn}${a.nameBn}`.localeCompare(`${b.nameEn}${b.nameBn}`)),
    [categories],
  );
  const categoryOptionsForAddProduct = useMemo(() => categoryOptionsFromCatalog(sorted), [sorted]);
  const role = user?.role ?? "user";
  const canAddCategory = isAdministrationRole(role) || role === "moderator";
  const canAddItem = isAdministrationRole(role) || role === "moderator";
  const canEditCategory = isAdministrationRole(role);
  const canDeleteCategory = isAdministrationRole(role);
  const canEditItem = isAdministrationRole(role) || role === "moderator";
  const canDeleteItem = isAdministrationRole(role);
  const canManageCategoryActions = canEditCategory || canDeleteCategory;
  const canManageItemActions = canEditItem || canDeleteItem;
  const canViewProducts = canAddItem || role === "user";
  const showCategories = view === "all" || view === "categories";
  const showProducts = (view === "all" || view === "products") && canViewProducts;

  const itemRows = useMemo(
    () =>
      sorted.flatMap((c) =>
        c.items.map((i) => ({
          ...i,
          categoryNameEn: c.nameEn,
          categoryNameBn: c.nameBn,
        })),
      ),
    [sorted],
  );

  const usedItemIds = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) =>
      o.lines.forEach((l) => {
        if (l.itemId) set.add(l.itemId);
      }),
    );
    return set;
  }, [orders]);

  const usedCategoryIds = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) =>
      o.lines.forEach((l) => {
        if (l.categoryId) set.add(l.categoryId);
      }),
    );
    return set;
  }, [orders]);

  const filteredCategories = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    return sorted.filter((c) => {
      if (!q) return true;
      return c.nameEn.toLowerCase().includes(q) || c.nameBn.toLowerCase().includes(q);
    });
  }, [sorted, catQuery]);

  const safeCatPage = Math.min(catPage, Math.max(1, Math.ceil(filteredCategories.length / catPerPage)));
  const pagedCategories = filteredCategories.slice((safeCatPage - 1) * catPerPage, safeCatPage * catPerPage);
  const useServerCategories = apiEnabled();
  const safeServerCatPage = Math.min(catPage, Math.max(1, Math.ceil(apiCategoriesTotal / catPerPage)));

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return itemRows.filter((i) => {
      if (!q) return true;
      return (
        i.nameEn.toLowerCase().includes(q) ||
        i.nameBn.toLowerCase().includes(q) ||
        i.categoryNameEn.toLowerCase().includes(q) ||
        i.categoryNameBn.toLowerCase().includes(q)
      );
    });
  }, [itemRows, itemQuery]);

  const safeItemPage = Math.min(itemPage, Math.max(1, Math.ceil(filteredItems.length / itemPerPage)));
  const pagedItems = filteredItems.slice((safeItemPage - 1) * itemPerPage, safeItemPage * itemPerPage);
  const useServerItems = apiEnabled();
  const safeServerItemPage = Math.min(itemPage, Math.max(1, Math.ceil(apiItemsTotal / itemPerPage)));

  useEffect(() => {
    if (!showCategories || !useServerCategories) return;
    void apiListCatalogCategories({
      query: catQuery,
      page: catPage,
      perPage: catPerPage,
    })
      .then((res) => {
        setApiCategories(res.data);
        setApiCategoriesTotal(res.meta.total);
      })
      .catch(() => {
        setApiCategories([]);
        setApiCategoriesTotal(0);
      });
  }, [showCategories, useServerCategories, catQuery, catPage, catPerPage, categories]);

  useEffect(() => {
    if (!showProducts || !useServerItems) return;
    void apiListCatalogItems({
      query: itemQuery,
      page: itemPage,
      perPage: itemPerPage,
    })
      .then((res) => {
        setApiItems(res.data);
        setApiItemsTotal(res.meta.total);
      })
      .catch(() => {
        setApiItems([]);
        setApiItemsTotal(0);
      });
  }, [showProducts, useServerItems, itemQuery, itemPage, itemPerPage, categories]);

  useEffect(() => {
    if (!isAdministrationRole(role) || !apiEnabled()) return;
    void apiGetCategoryMarkupSettings()
      .then((res) => {
        setCategoryMarkups(res.settings);
        setMarkupHistory(res.history);
        const drafts: Record<string, string> = {};
        if (res.categories.length > 0) {
          res.categories.forEach((row) => {
            drafts[row.categoryId] = markupPercentToInputString(row.markupPercent);
          });
        } else {
          Object.entries(res.settings).forEach(([id, pct]) => {
            drafts[id] = markupPercentToInputString(pct);
          });
        }
        setCategoryMarkupDrafts(drafts);
      })
      .catch(() => {
        setCategoryMarkups({});
        setMarkupHistory([]);
        setCategoryMarkupDrafts({});
      });
  }, [role, categories]);

  const saveCategory = async () => {
    const created = await addCategory(newCatBn, newCatEn);
    if (!created) {
      setMessage("Enter both Bangla and English names for category.");
      return;
    }
    setNewCatBn("");
    setNewCatEn("");
    setItemCat(created.id);
    setMessage(`Category added: ${created.nameEn}`);
  };

  const saveItem = async () => {
    const target = itemCat || sorted[0]?.id || "";
    const created = await addCustomItem(target, itemBn, itemEn);
    if (!created) {
      setMessage("Select category and enter both Bangla and English names for item.");
      return;
    }
    setItemBn("");
    setItemEn("");
    setMessage(`Item added: ${created.nameEn}`);
  };

  const startEditCategory = (id: string, bn: string, en: string) => {
    setEditingCatId(id);
    setEditBn(bn);
    setEditEn(en);
  };
  const startEditItem = (id: string, bn: string, en: string) => {
    setEditingItemId(id);
    setEditBn(bn);
    setEditEn(en);
  };
  const saveEditCategory = async (id: string) => {
    const ok = await updateCategory(id, editBn, editEn);
    setMessage(ok ? "Category updated." : "Category update failed.");
    setEditingCatId(null);
    setEditBn("");
    setEditEn("");
  };
  const saveEditItem = async (id: string) => {
    const ok = await updateItem(id, editBn, editEn);
    setMessage(ok ? "Item updated." : "Item update failed.");
    setEditingItemId(null);
    setEditBn("");
    setEditEn("");
  };
  const removeCategory = (id: string, itemsCount: number) => {
    if (itemsCount > 0) {
      setMessage("Delete all items from this category first.");
      return;
    }
    if (usedCategoryIds.has(id)) {
      setMessage("Category is used in orders and cannot be deleted.");
      return;
    }
    const category = sorted.find((c) => c.id === id);
    setPendingDelete({ type: "category", id, name: category?.nameEn ?? "this category" });
  };
  const removeItem = (id: string) => {
    if (usedItemIds.has(id)) {
      setMessage("This item is used in orders and cannot be deleted.");
      return;
    }
    const item = itemRows.find((i) => i.id === id);
    setPendingDelete({ type: "item", id, name: item?.nameEn ?? "this item" });
  };

  const commitCategoryMarkup = async (categoryId: string) => {
    const raw = categoryMarkupDrafts[categoryId] ?? "";
    const safe = roundMarkupPercent(parseMarkupPercentInput(raw));
    const prevPct = roundMarkupPercent(Number(categoryMarkups[categoryId] ?? 0));
    setCategoryMarkupDrafts((prev) => ({ ...prev, [categoryId]: markupPercentToInputString(safe) }));
    if (prevPct === safe) return;
    if (!apiEnabled()) {
      setCategoryMarkups((prev) => ({ ...prev, [categoryId]: safe }));
      return;
    }
    setCategoryMarkups((prev) => ({ ...prev, [categoryId]: safe }));
    try {
      await apiUpdateCategoryMarkup(categoryId, safe);
      const updated = await apiGetCategoryMarkupSettings();
      setCategoryMarkups(updated.settings);
      setMarkupHistory(updated.history);
      const drafts: Record<string, string> = {};
      if (updated.categories.length > 0) {
        updated.categories.forEach((row) => {
          drafts[row.categoryId] = markupPercentToInputString(row.markupPercent);
        });
      } else {
        Object.entries(updated.settings).forEach(([id, pct]) => {
          drafts[id] = markupPercentToInputString(pct);
        });
      }
      setCategoryMarkupDrafts(drafts);
    } catch {
      setCategoryMarkups((prev) => ({ ...prev, [categoryId]: prevPct }));
      setCategoryMarkupDrafts((prev) => ({ ...prev, [categoryId]: markupPercentToInputString(prevPct) }));
      setMessage("Could not save markup setting. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {view === "categories" ? "Category list" : view === "products" ? "Product list" : "Catalog list"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isAdministrationRole(role)
            ? "Admin can add, edit, and delete categories and products/items."
            : canAddCategory
              ? "Moderator can add categories. Product list is hidden."
              : "User can view product and category lists."}
        </p>
      </div>

      {showCategories && canAddCategory ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold text-slate-900">Add category</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={newCatBn}
              onChange={(e) => setNewCatBn(e.target.value)}
              placeholder="Category name (Bangla)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={newCatEn}
              onChange={(e) => setNewCatEn(e.target.value)}
              placeholder="Category name (English)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void saveCategory();
            }}
            className="mt-3 rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Save category
          </button>
        </section>
      ) : null}

      {showProducts && canAddItem ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold text-slate-900">Add product/item</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <SearchableSelect
                aria-label="Category for new product"
                options={categoryOptionsForAddProduct}
                value={itemCat}
                placeholder="Select category"
                searchPlaceholder="Search categories…"
                onChange={setItemCat}
              />
            </div>
            <input
              value={itemBn}
              onChange={(e) => setItemBn(e.target.value)}
              placeholder="Item name (Bangla)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={itemEn}
              onChange={(e) => setItemEn(e.target.value)}
              placeholder="Item name (English)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void saveItem();
            }}
            className="mt-3 rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Save product
          </button>
        </section>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{message}</div>
      ) : null}

      {isAdministrationRole(role) ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold text-slate-900">Billing markup settings (category-wise)</h2>
          <p className="mt-1 text-sm text-slate-600">
            This markup % is added to purchase item prices when admin generates customer billing invoice. You can use
            decimals (for example 7.25); the server rounds to two decimal places, matching the database column type.
          </p>
          <div className="table-scroll mt-3 rounded-2xl border border-border">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-foreground">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Category (Bangla)</th>
                  <th className="px-3 py-2 text-right">Markup %</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={`markup-${c.id}`} className="border-t border-border bg-card">
                    <td className="px-3 py-2.5 font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-slate-200"
                          style={{ backgroundColor: getCategoryColor(c.id) }}
                          aria-hidden="true"
                        />
                        {c.nameEn}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bn text-slate-700">{c.nameBn}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Markup percent for ${c.nameEn}`}
                        value={categoryMarkupDrafts[c.id] ?? markupPercentToInputString(Number(categoryMarkups[c.id] ?? 0))}
                        onChange={(e) =>
                          setCategoryMarkupDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        onBlur={() => {
                          void commitCategoryMarkup(c.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-5 text-sm font-semibold text-slate-900">Markup rate history</h3>
          <p className="mt-1 text-xs text-slate-600">
            Each row records one past change (previous → new). Current defaults used for new calculations are always the
            percentages in the <strong className="font-semibold text-slate-800">Billing markup settings</strong> table
            above — not an older value from this log.
          </p>
          <div className="table-scroll mt-2 rounded-2xl border border-border">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-foreground">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Previous %</th>
                  <th className="px-3 py-2 text-right">New %</th>
                  <th className="px-3 py-2">Changed at</th>
                </tr>
              </thead>
              <tbody>
                {markupHistory.slice(0, 30).map((h) => {
                  const cat = sorted.find((c) => c.id === h.categoryId);
                  return (
                    <tr key={h.id} className="border-t border-border bg-card">
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {cat ? `${cat.nameEn} (${cat.nameBn})` : UNKNOWN_CATEGORY_LABEL}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">
                        {markupPercentToInputString(h.previousPercent)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                        {markupPercentToInputString(h.nextPercent)}%
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {new Date(h.changedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {markupHistory.length === 0 ? (
                  <tr className="border-t border-border bg-card">
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                      No markup history yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showCategories ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-slate-900">Category list</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={catQuery}
            onChange={(e) => {
              setCatQuery(e.target.value);
              setCatPage(1);
            }}
            placeholder="Search category..."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="text-xs text-slate-500 flex items-center">
            Showing {useServerCategories ? apiCategoriesTotal : filteredCategories.length} categories
          </div>
        </div>
        <div className="table-scroll mt-3 rounded-2xl border border-border">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase tracking-wide text-foreground">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Category (Bangla)</th>
                <th className="px-3 py-2">Items count</th>
                <th className="px-3 py-2">Used in orders</th>
                {canManageCategoryActions ? <th className="px-3 py-2 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {(useServerCategories ? apiCategories : pagedCategories).map((c) => (
                <tr key={c.id} className="border-t border-border bg-card">
                  <td className="px-3 py-2.5 font-semibold text-slate-900">
                    {editingCatId === c.id ? (
                      <input
                        value={editEn}
                        onChange={(e) => setEditEn(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-slate-200"
                          style={{ backgroundColor: getCategoryColor(c.id) }}
                          aria-hidden="true"
                        />
                        {c.nameEn}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-bn text-slate-700">
                    {editingCatId === c.id ? (
                      <input
                        value={editBn}
                        onChange={(e) => setEditBn(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bn"
                      />
                    ) : (
                      c.nameBn
                    )}
                  </td>
                  <td className="px-3 py-2.5">{categoryRowItemCount(c)}</td>
                  <td className="px-3 py-2.5">{usedCategoryIds.has(c.id) ? "Yes" : "No"}</td>
                  {canManageCategoryActions ? (
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        {editingCatId === c.id && canEditCategory ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                void saveEditCategory(c.id);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCatId(null)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {canEditCategory ? (
                              <button
                                type="button"
                                onClick={() => startEditCategory(c.id, c.nameBn, c.nameEn)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                title="Edit category"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {canDeleteCategory ? (
                              <button
                                type="button"
                                onClick={() =>
                                  removeCategory(c.id, categoryRowItemCount(c))
                                }
                                className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                                title="Delete category"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {(useServerCategories ? apiCategories.length : pagedCategories.length) === 0 ? (
                <tr className="border-t border-border bg-card">
                  <td
                    colSpan={canManageCategoryActions ? 5 : 4}
                    className="px-3 py-8 text-center text-sm text-slate-500"
                  >
                    No categories match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {(useServerCategories ? apiCategoriesTotal : filteredCategories.length) > 0 ? (
          <PaginationControls
            totalItems={useServerCategories ? apiCategoriesTotal : filteredCategories.length}
            page={useServerCategories ? safeServerCatPage : safeCatPage}
            perPage={catPerPage}
            onPageChange={setCatPage}
            onPerPageChange={(size) => {
              setCatPerPage(size);
              setCatPage(1);
            }}
          />
        ) : null}
        </section>
      ) : null}

      {showProducts ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold text-slate-900">Product list</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={itemQuery}
              onChange={(e) => {
                setItemQuery(e.target.value);
                setItemPage(1);
              }}
              placeholder="Search product..."
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="text-xs text-slate-500 flex items-center">
              Showing {useServerItems ? apiItemsTotal : filteredItems.length} products
            </div>
          </div>
          <div className="table-scroll mt-3 rounded-2xl border border-border">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-foreground">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Product (Bangla)</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Used in orders</th>
                  {canManageItemActions ? <th className="px-3 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {(useServerItems ? apiItems : pagedItems).map((i) => (
                  <tr key={i.id} className="border-t border-border bg-card">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {editingItemId === i.id ? (
                        <input
                          value={editEn}
                          onChange={(e) => setEditEn(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                      ) : (
                        i.nameEn
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-bn text-slate-700">
                      {editingItemId === i.id ? (
                        <input
                          value={editBn}
                          onChange={(e) => setEditBn(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bn"
                        />
                      ) : (
                        i.nameBn
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {(() => {
                        const en = (i.categoryNameEn ?? "").trim();
                        const bn = (i.categoryNameBn ?? "").trim();
                        if (!en && !bn) return "—";
                        if (en && bn) return `${en} (${bn})`;
                        return en || bn;
                      })()}
                    </td>
                    <td className="px-3 py-2.5">{usedItemIds.has(i.id) ? "Yes" : "No"}</td>
                    {canManageItemActions ? (
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          {editingItemId === i.id && canEditItem ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  void saveEditItem(i.id);
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItemId(null)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {canEditItem ? (
                                <button
                                  type="button"
                                  onClick={() => startEditItem(i.id, i.nameBn, i.nameEn)}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                  title="Edit item"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              {canDeleteItem ? (
                                <button
                                  type="button"
                                  onClick={() => removeItem(i.id)}
                                  className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {(useServerItems ? apiItems.length : pagedItems.length) === 0 ? (
                  <tr className="border-t border-border bg-card">
                    <td
                      colSpan={canManageItemActions ? 5 : 4}
                      className="px-3 py-8 text-center text-sm text-slate-500"
                    >
                      No products match your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {(useServerItems ? apiItemsTotal : filteredItems.length) > 0 ? (
            <PaginationControls
              totalItems={useServerItems ? apiItemsTotal : filteredItems.length}
              page={useServerItems ? safeServerItemPage : safeItemPage}
              perPage={itemPerPage}
              onPageChange={setItemPage}
              onPerPageChange={(size) => {
                setItemPerPage(size);
                setItemPage(1);
              }}
            />
          ) : null}
        </section>
      ) : null}

      <ConfirmActionModal
        open={Boolean(pendingDelete)}
        title={pendingDelete?.type === "category" ? "Delete category" : "Delete item"}
        description={
          pendingDelete
            ? `Are you sure you want to delete ${pendingDelete.name}? This action cannot be undone.`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const ok =
            pendingDelete.type === "category"
              ? await deleteCategory(pendingDelete.id)
              : await deleteItem(pendingDelete.id);
          setMessage(
            ok
              ? pendingDelete.type === "category"
                ? "Category deleted."
                : "Item deleted."
              : pendingDelete.type === "category"
                ? "Category delete failed."
                : "Item delete failed.",
          );
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
