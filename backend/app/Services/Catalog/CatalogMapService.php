<?php

declare(strict_types=1);

namespace App\Services\Catalog;

use PDO;

/** Maps categories + catalog items to the legacy API catalog payload. */
final class CatalogMapService
{
    public function __construct(private readonly PDO $pdo) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function mapIndexed(): array
    {
        $cats = $this->pdo->query('SELECT id, code, name_bn, name_en, COALESCE(markup_percent, 0) AS markup_percent FROM categories WHERE is_active = 1 ORDER BY name_en')->fetchAll();
        if (! $cats) {
            return [];
        }
        $catIds = array_map(static fn (array $c): int => (int) $c['id'], $cats);
        $placeholders = implode(',', array_fill(0, count($catIds), '?'));
        $stmt = $this->pdo->prepare("SELECT category_id, code, name_bn, name_en FROM catalog_items WHERE is_active = 1 AND category_id IN ($placeholders) ORDER BY name_en");
        $stmt->execute($catIds);
        $items = $stmt->fetchAll();
        $itemsByCat = [];
        foreach ($items as $it) {
            $cid = (int) $it['category_id'];
            if (! isset($itemsByCat[$cid])) {
                $itemsByCat[$cid] = [];
            }
            $itemsByCat[$cid][] = [
                'id' => (string) $it['code'],
                'categoryId' => '',
                'nameBn' => (string) $it['name_bn'],
                'nameEn' => (string) $it['name_en'],
            ];
        }

        return array_map(static function (array $c) use ($itemsByCat): array {
            $cid = (int) $c['id'];
            $categoryCode = (string) $c['code'];
            $rows = $itemsByCat[$cid] ?? [];
            $rows = array_map(static function (array $r) use ($categoryCode): array {
                $r['categoryId'] = $categoryCode;

                return $r;
            }, $rows);

            return [
                'id' => $categoryCode,
                'nameBn' => (string) $c['name_bn'],
                'nameEn' => (string) $c['name_en'],
                'markupPercent' => (float) $c['markup_percent'],
                'items' => array_values($rows),
            ];
        }, $cats);
    }
}
