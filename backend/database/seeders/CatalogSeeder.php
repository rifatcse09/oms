<?php

namespace Database\Seeders;

use App\Models\CatalogItem;
use App\Models\Category;
use Illuminate\Database\Seeder;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = [
            [
                'code' => 'fresh',
                'name_bn' => 'তাজা শাকসবজি',
                'name_en' => 'Fresh Produce',
                'items' => [
                    ['code' => 'fresh-1', 'name_bn' => 'ক্যাপসিকাম', 'name_en' => 'Capsicum'],
                    ['code' => 'fresh-2', 'name_bn' => 'ধনিয়া পাতা', 'name_en' => 'Coriander leaves'],
                    ['code' => 'fresh-3', 'name_bn' => 'টমেটো', 'name_en' => 'Tomato'],
                    ['code' => 'fresh-4', 'name_bn' => 'বেগুন', 'name_en' => 'Eggplant'],
                    ['code' => 'fresh-5', 'name_bn' => 'ফুলকপি', 'name_en' => 'Cauliflower'],
                    ['code' => 'fresh-6', 'name_bn' => 'বাঁধাকপি', 'name_en' => 'Cabbage'],
                ],
            ],
            [
                'code' => 'dry',
                'name_bn' => 'শুকনো খাদ্য সামগ্রী',
                'name_en' => 'Dry Store',
                'items' => [
                    ['code' => 'dry-1', 'name_bn' => 'আলু', 'name_en' => 'Potato'],
                    ['code' => 'dry-2', 'name_bn' => 'পিয়াজ', 'name_en' => 'Onion'],
                    ['code' => 'dry-3', 'name_bn' => 'আদা', 'name_en' => 'Ginger'],
                    ['code' => 'dry-4', 'name_bn' => 'রসুন', 'name_en' => 'Garlic'],
                ],
            ],
            [
                'code' => 'meat',
                'name_bn' => 'ডিম, মাংস ও মাছ',
                'name_en' => 'Egg, Meat & Poultry',
                'items' => [
                    ['code' => 'meat-1', 'name_bn' => 'ডিম', 'name_en' => 'Eggs'],
                    ['code' => 'meat-2', 'name_bn' => 'মুরগি', 'name_en' => 'Chicken'],
                    ['code' => 'meat-3', 'name_bn' => 'মাছ', 'name_en' => 'Fish'],
                ],
            ],
            [
                'code' => 'pantry',
                'name_bn' => 'রান্নার উপকরণ (মসলা ছাড়া)',
                'name_en' => 'Pantry Goods (Non-spice)',
                'items' => [
                    ['code' => 'pantry-1', 'name_bn' => 'চাউল', 'name_en' => 'Rice'],
                    ['code' => 'pantry-2', 'name_bn' => 'ডাল', 'name_en' => 'Lentils'],
                    ['code' => 'pantry-3', 'name_bn' => 'আটা', 'name_en' => 'Flour'],
                    ['code' => 'pantry-4', 'name_bn' => 'চিনি', 'name_en' => 'Sugar'],
                    ['code' => 'pantry-5', 'name_bn' => 'লবণ', 'name_en' => 'Salt'],
                    ['code' => 'pantry-6', 'name_bn' => 'তেল', 'name_en' => 'Oil'],
                    ['code' => 'pantry-7', 'name_bn' => 'গুঁড়া দুধ', 'name_en' => 'Powdered milk'],
                ],
            ],
            [
                'code' => 'spice',
                'name_bn' => 'মসলা ও স্বাদবর্ধক উপকরণ',
                'name_en' => 'Spices & Seasonings',
                'items' => [
                    ['code' => 'spice-1', 'name_bn' => 'মরিচ গুঁড়া', 'name_en' => 'Chili powder'],
                    ['code' => 'spice-2', 'name_bn' => 'হলুদ গুঁড়া', 'name_en' => 'Turmeric powder'],
                    ['code' => 'spice-3', 'name_bn' => 'ধনিয়া গুঁড়া', 'name_en' => 'Coriander powder'],
                    ['code' => 'spice-4', 'name_bn' => 'মুরগির মসলা', 'name_en' => 'Chicken spice mix'],
                    ['code' => 'spice-5', 'name_bn' => 'বিফের মসলা', 'name_en' => 'Beef spice mix'],
                    ['code' => 'spice-6', 'name_bn' => 'মাছের মসলা', 'name_en' => 'Fish spice mix'],
                    ['code' => 'spice-7', 'name_bn' => 'পাঁচফোড়ন মসলা', 'name_en' => 'Panch phoron spice'],
                    ['code' => 'spice-8', 'name_bn' => 'এলাচ', 'name_en' => 'Cardamom'],
                    ['code' => 'spice-9', 'name_bn' => 'লবঙ্গ', 'name_en' => 'Clove'],
                    ['code' => 'spice-10', 'name_bn' => 'দারুচিনি', 'name_en' => 'Cinnamon'],
                    ['code' => 'spice-11', 'name_bn' => 'জিরা', 'name_en' => 'Cumin'],
                    ['code' => 'spice-12', 'name_bn' => 'শুকনা মরিচ', 'name_en' => 'Dried Red Chili'],
                    ['code' => 'spice-13', 'name_bn' => 'তেজপাতা', 'name_en' => 'Bay leaf'],
                ],
            ],
            [
                'code' => 'household',
                'name_bn' => 'প্রয়োজনীয় সামগ্রী',
                'name_en' => 'Household Essentials',
                'items' => [
                    ['code' => 'hh-1', 'name_bn' => 'ভিম সাবান', 'name_en' => 'Vim dishwashing soap'],
                    ['code' => 'hh-2', 'name_bn' => 'ছোট হ্যান্ড সাবান', 'name_en' => 'Small hand soap'],
                    ['code' => 'hh-3', 'name_bn' => 'হ্যান্ড টাওয়েল টিস্যু', 'name_en' => 'Hand towel tissue'],
                ],
            ],
        ];

        foreach ($catalog as $categoryRow) {
            $category = Category::query()->updateOrCreate(
                ['code' => $categoryRow['code']],
                [
                    'name_bn' => $categoryRow['name_bn'],
                    'name_en' => $categoryRow['name_en'],
                    'is_active' => true,
                ],
            );

            foreach ($categoryRow['items'] as $itemRow) {
                CatalogItem::query()->updateOrCreate(
                    ['code' => $itemRow['code']],
                    [
                        'category_id' => $category->id,
                        'name_bn' => $itemRow['name_bn'],
                        'name_en' => $itemRow['name_en'],
                        'is_active' => true,
                    ],
                );
            }
        }
    }
}
