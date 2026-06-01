import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "gom-brand-settings";

export interface BrandSettings {
  /** base64 data URL or null = use default hmc-logo.png */
  logoUrl: string | null;
  companyNameEn: string;
  companyNameBn: string;
  companyAddress: string;
  hotline: string;
}

export const BRAND_DEFAULTS: BrandSettings = {
  logoUrl: null,
  companyNameEn: "Hossein Meat & Co.",
  companyNameBn: "হোসেন মিট অ্যান্ড কো.",
  companyAddress: "ভুলতা-গাউসিয়া, রূপগঞ্জ, নারায়ণগঞ্জ — ১৪৬০",
  hotline: "+৮৮০১৫৭১ ২২৭৫৮৮",
};

function loadSettings(): BrandSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BRAND_DEFAULTS;
    return { ...BRAND_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return BRAND_DEFAULTS;
  }
}

interface BrandContextValue {
  brand: BrandSettings;
  updateBrand: (patch: Partial<BrandSettings>) => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandSettings>(loadSettings);

  function updateBrand(patch: Partial<BrandSettings>) {
    setBrand((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage full — skip persistence */
      }
      return next;
    });
  }

  return (
    <BrandContext.Provider value={{ brand, updateBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within BrandProvider");
  return ctx;
}
