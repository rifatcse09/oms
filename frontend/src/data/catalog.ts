import type { CategoryDef } from "../types";

/** Seed catalog — users can add custom items per category in the prototype (stored in local state). */
export const seedCatalog: CategoryDef[] = [
  {
    id: "fresh",
    nameBn: "তাজা শাকসবজি",
    nameEn: "Fresh Produce",
    items: [
      { id: "fresh-1", categoryId: "fresh", nameBn: "ক্যাপসিকাম", nameEn: "Capsicum" },
      { id: "fresh-2", categoryId: "fresh", nameBn: "ধনিয়া পাতা", nameEn: "Coriander leaves" },
      { id: "fresh-3", categoryId: "fresh", nameBn: "টমেটো", nameEn: "Tomato" },
      { id: "fresh-4", categoryId: "fresh", nameBn: "বেগুন", nameEn: "Eggplant" },
      { id: "fresh-5", categoryId: "fresh", nameBn: "ফুলকপি", nameEn: "Cauliflower" },
      { id: "fresh-6", categoryId: "fresh", nameBn: "বাঁধাকপি", nameEn: "Cabbage" },
    ],
  },
  {
    id: "dry",
    nameBn: "শুকনো খাদ্য সামগ্রী",
    nameEn: "Dry Store",
    items: [
      { id: "dry-1", categoryId: "dry", nameBn: "আলু", nameEn: "Potato" },
      { id: "dry-2", categoryId: "dry", nameBn: "পিয়াজ", nameEn: "Onion" },
      { id: "dry-3", categoryId: "dry", nameBn: "আদা", nameEn: "Ginger" },
      { id: "dry-4", categoryId: "dry", nameBn: "রসুন", nameEn: "Garlic" },
    ],
  },
  {
    id: "meat",
    nameBn: "ডিম, মাংস ও মাছ",
    nameEn: "Egg, Meat & Poultry",
    items: [
      { id: "meat-1", categoryId: "meat", nameBn: "ডিম", nameEn: "Eggs" },
      { id: "meat-2", categoryId: "meat", nameBn: "মুরগি", nameEn: "Chicken" },
      { id: "meat-3", categoryId: "meat", nameBn: "মাছ", nameEn: "Fish" },
    ],
  },
  {
    id: "pantry",
    nameBn: "রান্নার উপকরণ (মসলা ছাড়া)",
    nameEn: "Pantry Goods (Non-spice)",
    items: [
      { id: "pantry-1", categoryId: "pantry", nameBn: "চাউল", nameEn: "Rice" },
      { id: "pantry-2", categoryId: "pantry", nameBn: "ডাল", nameEn: "Lentils" },
      { id: "pantry-3", categoryId: "pantry", nameBn: "আটা", nameEn: "Flour" },
      { id: "pantry-4", categoryId: "pantry", nameBn: "চিনি", nameEn: "Sugar" },
      { id: "pantry-5", categoryId: "pantry", nameBn: "লবণ", nameEn: "Salt" },
      { id: "pantry-6", categoryId: "pantry", nameBn: "তেল", nameEn: "Oil" },
      { id: "pantry-7", categoryId: "pantry", nameBn: "গুঁড়া দুধ", nameEn: "Powdered milk" },
    ],
  },
  {
    id: "spice",
    nameBn: "মসলা ও স্বাদবর্ধক উপকরণ",
    nameEn: "Spices & Seasonings",
    items: [
      { id: "spice-1", categoryId: "spice", nameBn: "মরিচ গুঁড়া", nameEn: "Chili powder" },
      { id: "spice-2", categoryId: "spice", nameBn: "হলুদ গুঁড়া", nameEn: "Turmeric powder" },
      { id: "spice-3", categoryId: "spice", nameBn: "ধনিয়া গুঁড়া", nameEn: "Coriander powder" },
      { id: "spice-4", categoryId: "spice", nameBn: "মুরগির মসলা", nameEn: "Chicken spice mix" },
      { id: "spice-5", categoryId: "spice", nameBn: "বিফের মসলা", nameEn: "Beef spice mix" },
      { id: "spice-6", categoryId: "spice", nameBn: "মাছের মসলা", nameEn: "Fish spice mix" },
      { id: "spice-7", categoryId: "spice", nameBn: "পাঁচফোড়ন মসলা", nameEn: "Panch phoron spice" },
      { id: "spice-8", categoryId: "spice", nameBn: "এলাচ", nameEn: "Cardamom" },
      { id: "spice-9", categoryId: "spice", nameBn: "লবঙ্গ", nameEn: "Clove" },
      { id: "spice-10", categoryId: "spice", nameBn: "দারুচিনি", nameEn: "Cinnamon" },
      { id: "spice-11", categoryId: "spice", nameBn: "জিরা", nameEn: "Cumin" },
      { id: "spice-12", categoryId: "spice", nameBn: "শুকনা মরিচ", nameEn: "Dried Red Chili" },
      { id: "spice-13", categoryId: "spice", nameBn: "তেজপাতা", nameEn: "Bay leaf" },
    ],
  },
  {
    id: "household",
    nameBn: "প্রয়োজনীয় সামগ্রী",
    nameEn: "Household Essentials",
    items: [
      { id: "hh-1", categoryId: "household", nameBn: "ভিম সাবান", nameEn: "Vim dishwashing soap" },
      { id: "hh-2", categoryId: "household", nameBn: "ছোট হ্যান্ড সাবান", nameEn: "Small hand soap" },
      { id: "hh-3", categoryId: "household", nameBn: "হ্যান্ড টাওয়েল টিস্যু", nameEn: "Hand towel tissue" },
    ],
  },
];
