import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CatalogItem, CategoryDef } from "../types";
import { seedCatalog } from "../data/catalog";
import {
  apiCreateCatalogItem,
  apiCreateCategory,
  apiDeleteCatalogItem,
  apiDeleteCategory,
  apiEnabled,
  apiListCatalog,
  apiUpdateCatalogItem,
  apiUpdateCategory,
} from "../lib/api";

interface CatalogState {
  categories: CategoryDef[];
  loadCatalog: () => Promise<CategoryDef[]>;
  addCustomItem: (categoryId: string, nameBn: string, nameEn: string) => Promise<CatalogItem | null>;
  addCategory: (nameBn: string, nameEn: string) => Promise<CategoryDef | null>;
  updateCategory: (categoryId: string, nameBn: string, nameEn: string) => Promise<boolean>;
  deleteCategory: (categoryId: string) => Promise<boolean>;
  updateItem: (itemId: string, nameBn: string, nameEn: string) => Promise<boolean>;
  deleteItem: (itemId: string) => Promise<boolean>;
}

const CatalogContext = createContext<CatalogState | null>(null);

const STORAGE_FULL_KEY = "gom_catalog_full";
const STORAGE_KEY = "gom_custom_catalog";
const STORAGE_CAT_KEY = "gom_custom_categories";

function slugifyEnglishName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "category";
}

function loadMerged(): CategoryDef[] {
  try {
    const rawFull = localStorage.getItem(STORAGE_FULL_KEY);
    if (rawFull) {
      const parsed = JSON.parse(rawFull) as CategoryDef[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore parse errors */
  }
  const map = new Map<string, CategoryDef>();
  for (const c of seedCatalog) {
    map.set(c.id, { ...c, items: [...c.items] });
  }
  try {
    const rawCats = localStorage.getItem(STORAGE_CAT_KEY);
    if (rawCats) {
      const customCats = JSON.parse(rawCats) as CategoryDef[];
      for (const c of customCats) {
        if (!map.has(c.id)) map.set(c.id, { ...c, items: [...(c.items ?? [])] });
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return Array.from(map.values());
    const extra = JSON.parse(raw) as Record<string, CatalogItem[]>;
    for (const [cid, items] of Object.entries(extra)) {
      const cat = map.get(cid);
      if (cat) {
        const ids = new Set(cat.items.map((i) => i.id));
        for (const it of items) {
          if (!ids.has(it.id)) cat.items.push(it);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return Array.from(map.values());
}

function persistCatalog(categories: CategoryDef[]) {
  localStorage.setItem(STORAGE_FULL_KEY, JSON.stringify(categories));
  // keep legacy custom buckets in sync for older clients
  const extra: Record<string, CatalogItem[]> = {};
  for (const c of categories) {
    const custom = c.items.filter((i) => i.id.startsWith("custom-"));
    if (custom.length) extra[c.id] = custom;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
  localStorage.setItem(
    STORAGE_CAT_KEY,
    JSON.stringify(categories.filter((c) => c.id.startsWith("custom-cat-"))),
  );
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryDef[]>(loadMerged);
  const loadCatalog = useCallback(async (): Promise<CategoryDef[]> => {
    if (!apiEnabled()) return loadMerged();
    try {
      const rows = await apiListCatalog();
      if (rows.length > 0) {
        setCategories(rows);
        persistCatalog(rows);
        return rows;
      }
    } catch {
      // Keep local fallback if API is unavailable.
    }
    return loadMerged();
  }, []);

  const addCustomItem = useCallback(async (categoryId: string, nameBn: string, nameEn: string) => {
    const bn = nameBn.trim();
    const en = nameEn.trim();
    if (!bn || !en) return null;
    if (apiEnabled()) {
      try {
        const created = await apiCreateCatalogItem(categoryId, bn, en);
        await loadCatalog();
        return created;
      } catch {
        return null;
      }
    }
    const id = `custom-${categoryId}-${Date.now()}`;
    const item: CatalogItem = { id, categoryId, nameBn: bn, nameEn: en };
    setCategories((prev) => {
      const next = prev.map((c) =>
        c.id === categoryId ? { ...c, items: [...c.items, item] } : c,
      );
      persistCatalog(next);
      return next;
    });
    return item;
  }, [loadCatalog]);

  const addCategory = useCallback(async (nameBn: string, nameEn: string) => {
    const bn = nameBn.trim();
    const en = nameEn.trim();
    if (!bn || !en) return null;
    if (apiEnabled()) {
      try {
        const created = await apiCreateCategory(bn, en);
        await loadCatalog();
        return created;
      } catch {
        return null;
      }
    }
    const baseId = `custom-cat-${slugifyEnglishName(en)}`;
    const existing = new Set(categories.map((c) => c.id));
    let id = baseId.slice(0, 50);
    let suffix = 2;
    while (existing.has(id)) {
      const suffixText = `-${suffix}`;
      const trimLen = Math.max(1, 50 - suffixText.length);
      id = `${baseId.slice(0, trimLen)}${suffixText}`;
      suffix += 1;
    }
    const category: CategoryDef = { id, nameBn: bn, nameEn: en, items: [] };
    setCategories((prev) => {
      const next = [...prev, category];
      persistCatalog(next);
      return next;
    });
    return category;
  }, [loadCatalog]);

  const updateCategory = useCallback(async (categoryId: string, nameBn: string, nameEn: string) => {
    const bn = nameBn.trim();
    const en = nameEn.trim();
    if (!bn || !en) return false;
    if (apiEnabled()) {
      try {
        await apiUpdateCategory(categoryId, bn, en);
        await loadCatalog();
        return true;
      } catch {
        return false;
      }
    }
    let changed = false;
    setCategories((prev) => {
      const next = prev.map((c) => {
        if (c.id !== categoryId) return c;
        changed = true;
        return { ...c, nameBn: bn, nameEn: en };
      });
      if (changed) persistCatalog(next);
      return next;
    });
    return changed;
  }, []);

  const deleteCategory = useCallback(async (categoryId: string) => {
    if (apiEnabled()) {
      try {
        await apiDeleteCategory(categoryId);
        await loadCatalog();
        return true;
      } catch {
        return false;
      }
    }
    let changed = false;
    setCategories((prev) => {
      const next = prev.filter((c) => c.id !== categoryId);
      changed = next.length !== prev.length;
      if (changed) persistCatalog(next);
      return next;
    });
    return changed;
  }, []);

  const updateItem = useCallback(async (itemId: string, nameBn: string, nameEn: string) => {
    const bn = nameBn.trim();
    const en = nameEn.trim();
    if (!bn || !en) return false;
    if (apiEnabled()) {
      try {
        await apiUpdateCatalogItem(itemId, bn, en);
        await loadCatalog();
        return true;
      } catch {
        return false;
      }
    }
    let changed = false;
    setCategories((prev) => {
      const next = prev.map((c) => {
        let catChanged = false;
        const items = c.items.map((i) => {
          if (i.id !== itemId) return i;
          catChanged = true;
          changed = true;
          return { ...i, nameBn: bn, nameEn: en };
        });
        return catChanged ? { ...c, items } : c;
      });
      if (changed) persistCatalog(next);
      return next;
    });
    return changed;
  }, []);

  const deleteItem = useCallback(async (itemId: string) => {
    if (apiEnabled()) {
      try {
        await apiDeleteCatalogItem(itemId);
        await loadCatalog();
        return true;
      } catch {
        return false;
      }
    }
    let changed = false;
    setCategories((prev) => {
      const next = prev.map((c) => {
        const items = c.items.filter((i) => i.id !== itemId);
        if (items.length !== c.items.length) {
          changed = true;
          return { ...c, items };
        }
        return c;
      });
      if (changed) persistCatalog(next);
      return next;
    });
    return changed;
  }, []);

  const value = useMemo(
    () => ({
      categories,
      loadCatalog,
      addCustomItem,
      addCategory,
      updateCategory,
      deleteCategory,
      updateItem,
      deleteItem,
    }),
    [categories, loadCatalog, addCustomItem, addCategory, updateCategory, deleteCategory, updateItem, deleteItem],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog inside CatalogProvider");
  return ctx;
}
