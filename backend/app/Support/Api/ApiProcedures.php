<?php

declare(strict_types=1);

function envv(string $key, string $default = ''): string {
    return \App\Support\LegacyEnv::get($key, $default);
}

function json_input(): array {
    $raw = file_get_contents('php://input') ?: '{}';
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function json_response(int $status, array $payload): void {
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    if (! headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        \App\Http\Cors\CorsPolicy::sendNativeCorsHeaders();
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function app_debug(): bool {
    return strtolower(envv('APP_DEBUG', 'false')) === 'true';
}

/**
 * Request path for the legacy API router (must match route definitions like /api/v1/health).
 *
 * All API routes live under /api/v1. On shared hosts the browser path is often prefixed
 * (e.g. /hmc/backend/api/v1/… or …/public/index.php) while SCRIPT_NAME varies; we therefore
 * derive the route path from REQUEST_URI, REDIRECT_URL (common after mod_rewrite), and PATH_INFO.
 */
function legacy_api_request_path(): string
{
    foreach (['REQUEST_URI', 'REDIRECT_URL', 'PATH_INFO'] as $serverKey) {
        $raw = $_SERVER[$serverKey] ?? null;
        if (! is_string($raw) || $raw === '') {
            continue;
        }
        $path = parse_url($raw, PHP_URL_PATH);
        if (! is_string($path) || $path === '') {
            continue;
        }
        $path = str_replace('\\', '/', $path);
        if ($path === '' || $path[0] !== '/') {
            $path = '/' . ltrim($path, '/');
        }
        // Longest API suffix at end of this path segment (handles …/hmc/backend/api/v1/auth/login).
        if (preg_match('#(/api/v1(?:/.*)?)$#', $path, $m)) {
            $out = rtrim($m[1], '/') ?: '/';

            return $out;
        }
    }

    $raw = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    $path = parse_url($raw, PHP_URL_PATH);
    $path = is_string($path) && $path !== '' ? str_replace('\\', '/', $path) : '/';
    $p = strpos($path, '/api/v1');
    if ($p !== false) {
        return rtrim(substr($path, $p), '/') ?: '/';
    }

    return rtrim($path, '/') ?: '/';
}

function db(): PDO {
    return \App\Database\LegacyPdo::connection();
}

/** Undefined table: PostgreSQL 42P01, MySQL / MariaDB 42S02. */
function pdo_exception_is_missing_table(\PDOException $e): bool {
    $state = (string)($e->errorInfo[0] ?? '');

    return $state === '42P01' || $state === '42S02';
}

function bearer_token(): ?string {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $auth, $m) === 1) {
        return trim($m[1]);
    }
    return null;
}

function current_user(): ?array {
    $token = bearer_token();
    if (!$token) {
        return null;
    }
    $hash = hash('sha256', $token);
    $stmt = db()->prepare('SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = :h LIMIT 1');
    $stmt->execute(['h' => $hash]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function require_auth(): array {
    $user = current_user();
    if (!$user) {
        json_response(401, ['message' => 'Unauthorized']);
    }
    if (!$user['is_active']) {
        json_response(403, ['message' => 'Account inactive']);
    }
    return $user;
}

function require_role(array $user, array $allowed): void {
    if (!in_array($user['role'], $allowed, true)) {
        json_response(403, ['message' => 'Forbidden']);
    }
}

function make_token(int $userId): string {
    $raw = bin2hex(random_bytes(32));
    $hash = hash('sha256', $raw);
    $stmt = db()->prepare('INSERT INTO auth_tokens (user_id, token_hash) VALUES (:uid, :h)');
    $stmt->execute(['uid' => $userId, 'h' => $hash]);
    return $raw;
}

/** Matches LegacyPdo / Laravel DB_CONNECTION (mysql, sqlite, …). */
function legacy_db_driver(): string {
    return strtolower(trim(envv('DB_CONNECTION', 'mysql')));
}

function users_password_column(): string {
    static $column = null;
    if (is_string($column) && $column !== '') {
        return $column;
    }
    if (legacy_db_driver() === 'sqlite') {
        $stmt = db()->query('PRAGMA table_info(users)');
        $column = 'password';
        foreach ($stmt->fetchAll() ?: [] as $row) {
            $n = (string) ($row['name'] ?? '');
            if ($n === 'password') {
                $column = 'password';
                break;
            }
            if ($n === 'password_hash') {
                $column = 'password_hash';
            }
        }

        return $column;
    }
    $stmt = db()->query("
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'users'
          AND column_name IN ('password', 'password_hash')
        ORDER BY CASE WHEN column_name = 'password' THEN 0 ELSE 1 END
        LIMIT 1
    ");
    $row = $stmt->fetch();
    $column = (string) ($row['column_name'] ?? 'password');
    return $column;
}

function ensure_table_exists(string $table, string $featureLabel): void {
    if (legacy_db_driver() === 'sqlite') {
        if (! preg_match('/^[a-zA-Z0-9_]+$/', $table)) {
            json_response(503, ['message' => 'Invalid table name.', 'missingTable' => $table]);
        }
        $stmt = db()->prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = :t LIMIT 1");
        $stmt->execute(['t' => $table]);
        if (! $stmt->fetch()) {
            json_response(503, [
                'message' => "{$featureLabel} is not ready. Missing database table: {$table}. Please run migrations.",
                'missingTable' => $table,
            ]);
        }

        return;
    }
    $stmt = db()->prepare('
        SELECT COUNT(*) AS c
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = :t
    ');
    $stmt->execute(['t' => $table]);
    $c = (int) (($stmt->fetch()['c'] ?? 0));
    if ($c < 1) {
        json_response(503, [
            'message' => "{$featureLabel} is not ready. Missing database table: {$table}. Please run migrations.",
            'missingTable' => $table,
        ]);
    }
}

function table_has_column(string $table, string $column): bool {
    if (legacy_db_driver() === 'sqlite') {
        if (! preg_match('/^[a-zA-Z0-9_]+$/', $table) || ! preg_match('/^[a-zA-Z0-9_]+$/', $column)) {
            return false;
        }
        $stmt = db()->query('PRAGMA table_info('.$table.')');
        foreach ($stmt->fetchAll() ?: [] as $row) {
            if (($row['name'] ?? '') === $column) {
                return true;
            }
        }

        return false;
    }
    $stmt = db()->prepare('
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = :table
          AND column_name = :column
        LIMIT 1
    ');
    $stmt->execute(['table' => $table, 'column' => $column]);
    return (bool) $stmt->fetch();
}

/** SQL fragment: invoice row is active (not voided). */
function invoice_not_voided_sql(string $tableAlias = ''): string
{
    if (! table_has_column('invoices', 'voided_at')) {
        return '1=1';
    }
    $p = $tableAlias !== '' ? $tableAlias.'.' : '';

    return '('.$p.'voided_at IS NULL)';
}

/** SQL fragment: order is not soft-deleted. */
function order_not_deleted_sql(string $tableAlias = ''): string
{
    if (! table_has_column('orders', 'deleted_at')) {
        return '1=1';
    }
    $p = $tableAlias !== '' ? $tableAlias.'.' : '';

    return '('.$p.'deleted_at IS NULL)';
}

/**
 * Mark invoice voided and post opposite ledger entry so totals net out.
 *
 * @throws RuntimeException when voided_at column is missing
 */
function void_invoice_and_reverse_ledger(int $invoiceId, int $actorUserId): void
{
    if (! table_has_column('invoices', 'voided_at')) {
        throw new RuntimeException(
            'Regenerating invoices or soft-deleting orders requires the invoices.voided_at column. '
            .'Run database migrations from the backend folder (e.g. php artisan migrate). '
            .'Expected migration: 2026_05_08_120000_add_order_soft_delete_and_invoice_void.',
        );
    }
    $stmt = db()->prepare('SELECT * FROM invoices WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $invoiceId]);
    $inv = $stmt->fetch();
    if (! $inv) {
        return;
    }
    if (! empty($inv['voided_at'])) {
        return;
    }
    $amount = (float) ($inv['grand_total'] ?? 0);
    $orderId = (int) ($inv['order_id'] ?? 0);
    $type = (string) ($inv['type'] ?? '');
    $upd = db()->prepare('UPDATE invoices SET voided_at = NOW(), updated_at = NOW() WHERE id = :id AND voided_at IS NULL');
    $upd->execute(['id' => $invoiceId]);
    if ($upd->rowCount() === 0) {
        return;
    }
    if ($type === 'purchase') {
        add_ledger($orderId, 'purchase_invoice_void', $amount, 'debit', 'invoice', $invoiceId);
    } elseif ($type === 'billing') {
        add_ledger($orderId, 'billing_invoice_void', $amount, 'credit', 'invoice', $invoiceId);
    }
    log_activity($actorUserId, 'invoice', $invoiceId, 'invoice_voided', null, [
        'orderId' => $orderId,
        'type' => $type,
        'amount' => $amount,
    ]);
    if ($orderId > 0) {
        sync_order_invoice_generated_at_columns($orderId);
    }
}

/**
 * Soft-delete order (master admin): void active invoices + ledger reversal, set deleted_at.
 *
 * @throws RuntimeException when deleted_at column is missing
 */
function soft_delete_order_master(int $orderId, int $actorUserId): void
{
    if (! table_has_column('orders', 'deleted_at')) {
        throw new RuntimeException(
            'Soft-delete requires orders.deleted_at (and related columns). '
            .'Run database migrations from the backend folder (e.g. php artisan migrate). '
            .'Expected migration: 2026_05_08_120000_add_order_soft_delete_and_invoice_void.',
        );
    }
    foreach (['purchase', 'billing'] as $t) {
        $inv = order_latest_invoice_row($orderId, $t);
        if ($inv) {
            void_invoice_and_reverse_ledger((int) $inv['id'], $actorUserId);
        }
    }
    $upd = db()->prepare('UPDATE orders SET deleted_at = NOW(), deleted_by = :uid, updated_at = NOW() WHERE id = :id AND deleted_at IS NULL');
    $upd->execute(['id' => $orderId, 'uid' => $actorUserId]);
    log_activity($actorUserId, 'order', $orderId, 'order_soft_deleted', null, [
        'orderId' => $orderId,
    ]);
}

function persist_signature(mixed $incoming): ?string {
    if ($incoming === null) {
        return null;
    }
    $value = trim((string)$incoming);
    if ($value === '') {
        return null;
    }

    if (!str_starts_with($value, 'data:image/')) {
        return $value;
    }

    if (!preg_match('/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/', $value, $m)) {
        throw new RuntimeException('Invalid signature image format.');
    }

    $mimeExt = strtolower($m[1]);
    $ext = match ($mimeExt) {
        'jpeg' => 'jpg',
        'jpg', 'png', 'gif', 'webp' => $mimeExt,
        default => 'png',
    };
    $binary = base64_decode($m[2], true);
    if ($binary === false) {
        throw new RuntimeException('Invalid signature image content.');
    }

    // Store under Laravel web root: <app-root>/public/uploads/signatures → URL /uploads/signatures/<file>
    // (__DIR__ = …/app/Support/Api, three levels up = app root, same layout as backend/public in this repo.)
    $dir = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'signatures';
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Failed to create signature storage directory.');
        }
    }
    @chmod($dir, 0775);

    $name = date('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $ext;
    $fullPath = $dir . '/' . $name;
    if (file_put_contents($fullPath, $binary, LOCK_EX) === false) {
        throw new RuntimeException('Failed to store signature image.');
    }
    @chmod($fullPath, 0644);

    return '/uploads/signatures/' . $name;
}

function public_user(array $row): array {
    return [
        'id'               => (string)$row['id'],
        'name'             => $row['name'],
        'email'            => $row['email'],
        'phone'            => $row['phone'],
        'role'             => $row['role'],
        'billingAddress'   => $row['billing_address'],
        'deliveryAddress'  => $row['delivery_address'],
        'isActive'         => (bool)$row['is_active'],
        'emailVerifiedAt'  => $row['email_verified_at'] ?? null,
        'created_at'       => $row['created_at'] ?? null,
        'updated_at'       => $row['updated_at'] ?? null,
    ];
}

function map_catalog(): array {
    return (new \App\Services\Catalog\CatalogMapService(db()))->mapIndexed();
}

function read_order_lines(int $orderId): array {
    $stmt = db()->prepare('SELECT * FROM order_lines WHERE order_id = :id ORDER BY serial ASC');
    $stmt->execute(['id' => $orderId]);
    $rows = $stmt->fetchAll();
    return array_map(static fn(array $line) => [
        'id' => (string)$line['id'],
        'serial' => (int)$line['serial'],
        'categoryId' => $line['category_code'] ? (string)$line['category_code'] : '',
        'itemId' => $line['item_code'] ? (string)$line['item_code'] : '',
        'itemNameBn' => $line['item_name_bn'],
        'itemNameEn' => $line['item_name_en'],
        'kg' => ((float)($line['kg'] ?? 0)) > 0 ? (string)$line['kg'] : '',
        'gram' => ((float)($line['gram'] ?? 0)) > 0 ? (string)$line['gram'] : '',
        'piece' => ((float)($line['piece'] ?? 0)) > 0 ? (string)$line['piece'] : '',
        'instructions' => $line['instructions'] ?? '',
        'unitPrice' => $line['unit_price'] !== null ? (float)$line['unit_price'] : null,
        'lineTotal' => $line['line_total'] !== null ? (float)$line['line_total'] : null,
        'markupPercent' => $line['markup_percent'] !== null ? (float)$line['markup_percent'] : 0.0,
        'markupAmount' => $line['markup_amount'] !== null ? (float)$line['markup_amount'] : 0.0,
        'unitPriceAfterMarkup' => $line['unit_price_after_markup'] !== null ? (float)$line['unit_price_after_markup'] : null,
        'lineTotalAfterMarkup' => $line['line_total_after_markup'] !== null ? (float)$line['line_total_after_markup'] : null,
        'profitLossAmount' => $line['profit_loss_amount'] !== null ? (float)$line['profit_loss_amount'] : 0.0,
    ], $rows);
}

/** Positive qty from kg/gram/piece string (comma as decimal). */
function parse_qty_for_challan(string $s): float
{
    $t = str_replace(',', '.', trim($s));
    if ($t === '' || $t === '.') {
        return 0.0;
    }
    $n = (float) $t;

    return (is_finite($n) && $n > 0.0) ? $n : 0.0;
}

/**
 * Same rules as frontend validateLineQuantity: weight OR pieces, not both; every line must have quantity.
 *
 * @param  array<int, array<string, mixed>>  $lines
 */
function order_lines_ready_for_challan(array $lines): bool
{
    if ($lines === []) {
        return false;
    }
    foreach ($lines as $line) {
        $kg = parse_qty_for_challan((string) ($line['kg'] ?? ''));
        $g = parse_qty_for_challan((string) ($line['gram'] ?? ''));
        $p = parse_qty_for_challan((string) ($line['piece'] ?? ''));
        $hasWeight = $kg > 0.0 || $g > 0.0;
        $hasPiece = $p > 0.0;
        if (! $hasWeight && ! $hasPiece) {
            return false;
        }
        if ($hasWeight && $hasPiece) {
            return false;
        }
    }

    return true;
}

function order_has_challan(int $orderId): bool {
    $stmt = db()->prepare('SELECT 1 FROM challans WHERE order_id = :id LIMIT 1');
    $stmt->execute(['id' => $orderId]);
    return (bool)$stmt->fetchColumn();
}

function order_has_invoice_type(int $orderId, string $type): bool {
    $stmt = db()->prepare('SELECT 1 FROM invoices WHERE order_id = :id AND type = :type AND '.invoice_not_voided_sql().' LIMIT 1');
    $stmt->execute(['id' => $orderId, 'type' => $type]);
    return (bool)$stmt->fetchColumn();
}

function order_purchase_generated_by_role(int $orderId): ?string {
    $invA = invoice_not_voided_sql('i');
    $stmt = db()->prepare("
        SELECT u.role
        FROM invoices i
        LEFT JOIN users u ON u.id = i.generated_by
        WHERE i.order_id = :id AND i.type = 'purchase' AND {$invA}
        ORDER BY i.id DESC
        LIMIT 1
    ");
    $stmt->execute(['id' => $orderId]);
    $role = $stmt->fetchColumn();
    if ($role === false || $role === null) return null;
    $role = (string)$role;
    if ($role === 'master_admin') {
        return 'admin';
    }

    return in_array($role, ['admin', 'moderator'], true) ? $role : null;
}

function order_latest_invoice_row(int $orderId, string $type): ?array {
    $stmt = db()->prepare('SELECT * FROM invoices WHERE order_id = :id AND type = :type AND '.invoice_not_voided_sql().' ORDER BY id DESC LIMIT 1');
    $stmt->execute(['id' => $orderId, 'type' => $type]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Denormalize latest active invoice timestamps onto orders (updated on each generate / void / regenerate).
 */
function sync_order_invoice_generated_at_columns(int $orderId): void
{
    if ($orderId < 1) {
        return;
    }
    $hasPur = table_has_column('orders', 'purchase_invoice_generated_at');
    $hasBill = table_has_column('orders', 'billing_invoice_generated_at');
    if (! $hasPur && ! $hasBill) {
        return;
    }
    $p = order_has_invoice_type($orderId, 'purchase') ? order_latest_invoice_row($orderId, 'purchase') : null;
    $b = order_has_invoice_type($orderId, 'billing') ? order_latest_invoice_row($orderId, 'billing') : null;
    $pAt = $p && ! empty($p['created_at']) ? (string) $p['created_at'] : null;
    $bAt = $b && ! empty($b['created_at']) ? (string) $b['created_at'] : null;
    $sets = ['updated_at = NOW()'];
    $params = ['id' => $orderId];
    if ($hasPur) {
        $sets[] = 'purchase_invoice_generated_at = :p_at';
        $params['p_at'] = $pAt;
    }
    if ($hasBill) {
        $sets[] = 'billing_invoice_generated_at = :b_at';
        $params['b_at'] = $bAt;
    }
    $sql = 'UPDATE orders SET '.implode(', ', $sets).' WHERE id = :id';
    db()->prepare($sql)->execute($params);
}

function read_order(array $row): array {
    if (table_has_column('orders', 'created_by') && ! empty($row['created_by']) && ! array_key_exists('created_by_user_name', $row)) {
        $st = db()->prepare('SELECT name, role FROM users WHERE id = :id LIMIT 1');
        $st->execute(['id' => (int) $row['created_by']]);
        $u = $st->fetch();
        if ($u) {
            $row['created_by_user_name'] = $u['name'] ?? null;
            $row['created_by_user_role'] = $u['role'] ?? null;
        }
    }
    $deliveryWindow = trim((string)($row['delivery_time_window'] ?? ''));
    $orderId = (int)$row['id'];
    $challanGenerated = (bool)($row['challan_generated'] ?? false) || order_has_challan($orderId);
    $purchaseInvoiceGenerated = (bool)($row['purchase_invoice_generated'] ?? false) || order_has_invoice_type($orderId, 'purchase');
    $billingInvoiceGenerated = (bool)($row['billing_invoice_generated'] ?? false) || order_has_invoice_type($orderId, 'billing');
    $purchaseInvoiceGeneratedBy = order_purchase_generated_by_role($orderId);
    $purchaseInvoice = $purchaseInvoiceGenerated ? order_latest_invoice_row($orderId, 'purchase') : null;
    $billingInvoice = $billingInvoiceGenerated ? order_latest_invoice_row($orderId, 'billing') : null;
    $billingSnap = [];
    if ($billingInvoice && !empty($billingInvoice['snapshot'])) {
        $decoded = json_decode((string)$billingInvoice['snapshot'], true);
        if (is_array($decoded)) $billingSnap = $decoded;
    }
    $purchaseSubtotal = $purchaseInvoice && isset($purchaseInvoice['grand_total']) ? (float)$purchaseInvoice['grand_total'] : null;
    $billingSubtotal = $billingInvoice && isset($billingInvoice['grand_total']) ? (float)$billingInvoice['grand_total'] : null;
    $billingCategoryMarkups = is_array($billingSnap['markupByCategory'] ?? null) ? $billingSnap['markupByCategory'] : null;
    $billingMarkupPercent = isset($billingSnap['markupPercent']) ? (float)$billingSnap['markupPercent'] : null;
    $grandTotal = $billingSubtotal;
    $deliveredAt = $row['delivered_at'] ?? null;
    if (($deliveredAt === null || $deliveredAt === '') && in_array((string)($row['status'] ?? ''), ['completed', 'invoiced'], true)) {
        $deliveredAt = order_delivered_at_from_activity($orderId);
    }
    $purchaseInvoiceCreatedAt = null;
    if ($purchaseInvoice && ! empty($purchaseInvoice['created_at'])) {
        $purchaseInvoiceCreatedAt = (string) $purchaseInvoice['created_at'];
    } elseif (! empty($row['purchase_invoice_generated_at'])) {
        $purchaseInvoiceCreatedAt = (string) $row['purchase_invoice_generated_at'];
    }
    $billingInvoiceCreatedAt = null;
    if ($billingInvoice && ! empty($billingInvoice['created_at'])) {
        $billingInvoiceCreatedAt = (string) $billingInvoice['created_at'];
    } elseif (! empty($row['billing_invoice_generated_at'])) {
        $billingInvoiceCreatedAt = (string) $row['billing_invoice_generated_at'];
    }
    $out = [
        'id' => (string)$orderId,
        'ownerId' => (string)$row['owner_id'],
        'orderNo' => $row['order_no'],
        'orderDate' => $row['order_date'],
        'createdAt' => $row['created_at'] ?? null,
        'submittedAt' => $row['submitted_at'],
        'deliveredAt' => $deliveredAt,
        'deliveryDate' => substr((string)$row['delivery_datetime'], 0, 10),
        'deliveryTime' => $deliveryWindow !== '' ? $deliveryWindow : substr((string)$row['delivery_datetime'], 11, 5),
        'status' => $row['status'],
        'billingAddress' => $row['billing_address'],
        'deliveryAddress' => $row['delivery_address'],
        'contactPerson' => $row['contact_person'],
        'phone' => $row['phone'],
        'signatureDataUrl' => $row['signature_data_url'] ?? null,
        'challanGenerated' => $challanGenerated,
        'purchaseInvoiceGenerated' => $purchaseInvoiceGenerated,
        'purchaseInvoiceGeneratedBy' => $purchaseInvoiceGeneratedBy,
        'billingInvoiceGenerated' => $billingInvoiceGenerated,
        'purchaseInvoiceCreatedAt' => $purchaseInvoiceCreatedAt,
        'billingInvoiceCreatedAt' => $billingInvoiceCreatedAt,
        'purchaseSubtotal' => $purchaseSubtotal,
        'billingSubtotal' => $billingSubtotal,
        'markupPercent' => $billingMarkupPercent,
        'billingCategoryMarkups' => $billingCategoryMarkups,
        'grandTotal' => $grandTotal,
        'lines' => read_order_lines($orderId),
    ];
    if (table_has_column('orders', 'created_by')) {
        $cb = $row['created_by'] ?? null;
        $out['createdById'] = $cb !== null && $cb !== '' ? (string) $cb : null;
        $out['createdByName'] = isset($row['created_by_user_name']) && (string) $row['created_by_user_name'] !== ''
            ? (string) $row['created_by_user_name']
            : null;
        $out['createdByRole'] = isset($row['created_by_user_role']) && (string) $row['created_by_user_role'] !== ''
            ? (string) $row['created_by_user_role']
            : null;
    }
    if (table_has_column('orders', 'deleted_at') && ! empty($row['deleted_at'])) {
        $out['deletedAt'] = $row['deleted_at'];
    }

    // Customer invoice balance (same net as admin per-order billing settlement).
    $cap = (float) ($out['grandTotal'] ?? 0);
    $netB = 0.0;
    if ($billingInvoiceGenerated && table_has_column('payments', 'payment_type')) {
        $netB = max(0.0, (float) order_net_billing_paid_applied($orderId));
    }
    $out['billingNetPaid'] = round($netB, 2);
    $out['billingAmountDue'] = ($billingInvoiceGenerated && $cap > 0.00001)
        ? round(max(0.0, $cap - $netB), 2)
        : null;

    return $out;
}

function order_delivered_at_from_activity(int $orderId): ?string
{
    try {
        $stmt = db()->prepare("
            SELECT created_at
            FROM activity_logs
            WHERE entity_type = 'order' AND entity_id = :id AND action = 'order_marked_delivered'
            ORDER BY id DESC
            LIMIT 1
        ");
        $stmt->execute(['id' => $orderId]);
        $row = $stmt->fetch();
        $v = (string)($row['created_at'] ?? '');
        return $v !== '' ? $v : null;
    } catch (\PDOException $e) {
        if (pdo_exception_is_missing_table($e)) {
            return null;
        }
        throw $e;
    }
}

function log_activity(int $actorId, string $entityType, int $entityId, string $action, ?array $before = null, ?array $after = null): void {
    try {
        $stmt = db()->prepare('INSERT INTO activity_logs (actor_user_id, entity_type, entity_id, action, before_json, after_json) VALUES (:actor, :etype, :eid, :action, :before, :after)');
        $stmt->execute([
            'actor' => $actorId,
            'etype' => $entityType,
            'eid' => $entityId,
            'action' => $action,
            'before' => $before ? json_encode($before) : null,
            'after' => $after ? json_encode($after) : null,
        ]);
    } catch (\PDOException $e) {
        // Allow business flow to continue when audit table is missing.
        if (pdo_exception_is_missing_table($e)) {
            return;
        }
        throw $e;
    }
}

function add_ledger(?int $orderId, string $entryType, float $amount, string $direction, string $refType, ?int $refId): void {
    // Guard: prevent duplicate ledger entry for the same invoice/ref.
    // This makes the function idempotent when ref_id is present (e.g. purchase_invoice, billing_invoice).
    if ($refId !== null) {
        $dup = db()->prepare('SELECT 1 FROM ledger_entries WHERE entry_type = :et AND ref_type = :rt AND ref_id = :rid LIMIT 1');
        $dup->execute(['et' => $entryType, 'rt' => $refType, 'rid' => $refId]);
        if ($dup->fetch()) {
            return;
        }
    }
    $ts = date('Y-m-d H:i:s');
    $stmt = db()->prepare('INSERT INTO ledger_entries (order_id, entry_type, amount, direction, ref_type, ref_id, created_at, updated_at) VALUES (:order_id, :entry_type, :amount, :direction, :ref_type, :ref_id, :ts, :ts2)');
    $stmt->execute([
        'order_id' => $orderId,
        'entry_type' => $entryType,
        'amount' => $amount,
        'direction' => $direction,
        'ref_type' => $refType,
        'ref_id' => $refId,
        'ts' => $ts,
        'ts2' => $ts,
    ]);
}

/**
 * Resolve purchase vs billing for a stored payment row (must match GET /api/v1/payments).
 *
 * @param array<string, mixed> $r Row with payment_type or stored_payment_type, note, invoice_type
 */
function resolve_stored_payment_row_effective_type(array $r): string
{
    $stored = (string)($r['stored_payment_type'] ?? $r['payment_type'] ?? '');
    if (in_array($stored, ['purchase', 'billing'], true)) {
        return $stored;
    }
    $note = (string)($r['note'] ?? '');
    if (stripos($note, 'Purchase statement payment') !== false) {
        return 'purchase';
    }
    if (stripos($note, 'Billing statement payment') !== false) {
        return 'billing';
    }
    $resolved = (string)($r['invoice_type'] ?? 'billing');

    return in_array($resolved, ['purchase', 'billing'], true) ? $resolved : 'billing';
}

/**
 * @return array<int, array<string, mixed>>
 */
function payment_rows_for_order_with_invoice_type(int $orderId): array
{
    $paymentTypeSelect = table_has_column('payments', 'payment_type')
        ? 'p.payment_type'
        : 'NULL';
    $invActive = invoice_not_voided_sql('i2');
    $stmt = db()->prepare("
        SELECT
            p.*,
            {$paymentTypeSelect} AS stored_payment_type,
            COALESCE(inv.type, (
                SELECT i2.type
                FROM invoices i2
                WHERE i2.order_id = o.id AND {$invActive}
                ORDER BY i2.id DESC
                LIMIT 1
            )) AS invoice_type
        FROM payments p
        LEFT JOIN invoices inv ON inv.id = p.invoice_id
        LEFT JOIN orders o ON o.id = COALESCE(p.order_id, inv.order_id)
        WHERE p.order_id = :id
    ");
    $stmt->execute(['id' => $orderId]);
    $rows = $stmt->fetchAll();

    return is_array($rows) ? $rows : [];
}

/** Same as statement UI: purchase payments minus purchase adjustments for this order. */
function order_net_purchase_paid_applied(int $orderId): float
{
    if (!table_has_column('payments', 'payment_type')) {
        return 0.0;
    }
    $paid = 0.0;
    foreach (payment_rows_for_order_with_invoice_type($orderId) as $row) {
        if (resolve_stored_payment_row_effective_type($row) === 'purchase') {
            $paid += (float)($row['amount'] ?? 0);
        }
    }
    $a = db()->prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM adjustments WHERE order_id = :id AND type = 'purchase'");
    $a->execute(['id' => $orderId]);
    $adj = (float)($a->fetch()['t'] ?? 0);

    return $paid - $adj;
}

function order_latest_purchase_invoice_grand(int $orderId): ?float
{
    $s = db()->prepare("SELECT grand_total FROM invoices WHERE order_id = :id AND type = 'purchase' AND ".invoice_not_voided_sql().' ORDER BY id DESC LIMIT 1');
    $s->execute(['id' => $orderId]);
    $row = $s->fetch();
    if (!$row || !isset($row['grand_total'])) {
        return null;
    }

    return (float)$row['grand_total'];
}

/** Billing payments minus billing adjustments (customer collections). */
function order_net_billing_paid_applied(int $orderId): float
{
    if (!table_has_column('payments', 'payment_type')) {
        return 0.0;
    }
    $paid = 0.0;
    foreach (payment_rows_for_order_with_invoice_type($orderId) as $row) {
        if (resolve_stored_payment_row_effective_type($row) === 'billing') {
            $paid += (float)($row['amount'] ?? 0);
        }
    }
    $a = db()->prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM adjustments WHERE order_id = :id AND type = 'billing'");
    $a->execute(['id' => $orderId]);
    $adj = (float)($a->fetch()['t'] ?? 0);

    return $paid - $adj;
}

function order_latest_billing_invoice_grand(int $orderId): ?float
{
    $s = db()->prepare("SELECT grand_total FROM invoices WHERE order_id = :id AND type = 'billing' AND ".invoice_not_voided_sql().' ORDER BY id DESC LIMIT 1');
    $s->execute(['id' => $orderId]);
    $row = $s->fetch();
    if (!$row || !isset($row['grand_total'])) {
        return null;
    }

    return (float)$row['grand_total'];
}

function payment_or_order_type(array $input): string {
    $inputType = (string)($input['type'] ?? '');
    if (in_array($inputType, ['purchase', 'billing'], true)) {
        return $inputType;
    }

    $invoiceId = isset($input['invoiceId']) ? (int)$input['invoiceId'] : null;
    if ($invoiceId) {
        $stmt = db()->prepare('SELECT type FROM invoices WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $invoiceId]);
        $row = $stmt->fetch();
        $resolved = (string)($row['type'] ?? '');
        if (in_array($resolved, ['purchase', 'billing'], true)) {
            return $resolved;
        }
    }

    $orderId = isset($input['orderId']) ? (int)$input['orderId'] : null;
    if ($orderId) {
        $stmt = db()->prepare('SELECT type FROM invoices WHERE order_id = :id AND '.invoice_not_voided_sql().' ORDER BY id DESC LIMIT 1');
        $stmt->execute(['id' => $orderId]);
        $row = $stmt->fetch();
        $resolved = (string)($row['type'] ?? '');
        if (in_array($resolved, ['purchase', 'billing'], true)) {
            return $resolved;
        }
    }

    return 'billing';
}

/**
 * Insert one payment + matching ledger row. Caller may wrap in a DB transaction.
 *
 * @return array<string, mixed> Inserted payment row
 */
function insert_payment_and_ledger_row(int $userId, ?int $orderId, ?int $invoiceId, string $paymentType, float $payAmount, string $note): array
{
    ensure_table_exists('payments', 'Payments');
    [$orderId, $invoiceId] = resolve_payment_order_and_invoice_ids($orderId, $invoiceId, $paymentType);
    if (($orderId === null || $orderId <= 0) && ($invoiceId === null || $invoiceId <= 0)) {
        throw new InvalidArgumentException('orderId or invoiceId is required for payment entry.');
    }
    if ($payAmount <= 0.00001) {
        throw new InvalidArgumentException('Payment amount must be greater than zero.');
    }
    if ($orderId !== null && $paymentType === 'purchase' && table_has_column('payments', 'payment_type')) {
        $grand = order_latest_purchase_invoice_grand($orderId);
        if ($grand !== null) {
            $net = order_net_purchase_paid_applied($orderId);
            if ($net + $payAmount > $grand + 0.01) {
                $remain = max(0.0, $grand - $net);
                throw new InvalidArgumentException(
                    'Total purchase payments for this order cannot exceed the purchase invoice (৳ ' . (string)round($grand) . '). Already recorded (net): ৳ ' . (string)round($net) . '. You can pay at most ৳ ' . (string)round($remain) . ' more.',
                );
            }
        }
    }
    if ($orderId !== null && $paymentType === 'billing' && table_has_column('payments', 'payment_type')) {
        $grand = order_latest_billing_invoice_grand($orderId);
        if ($grand !== null) {
            $net = order_net_billing_paid_applied($orderId);
            if ($net + $payAmount > $grand + 0.01) {
                $remain = max(0.0, $grand - $net);
                throw new InvalidArgumentException(
                    'Total billing payments for this order cannot exceed the billing invoice (৳ ' . (string)round($grand) . '). Already recorded (net): ৳ ' . (string)round($net) . '. You can pay at most ৳ ' . (string)round($remain) . ' more.',
                );
            }
        }
    }
    if (table_has_column('payments', 'payment_type')) {
        $payTs = table_has_column('payments', 'created_at') && table_has_column('payments', 'updated_at');
        $sql = $payTs
            ? 'INSERT INTO payments (order_id, invoice_id, payment_type, amount, note, created_by, created_at, updated_at) VALUES (:order, :invoice, :ptype, :amount, :note, :uid, NOW(), NOW())'
            : 'INSERT INTO payments (order_id, invoice_id, payment_type, amount, note, created_by) VALUES (:order, :invoice, :ptype, :amount, :note, :uid)';
        $stmt = db()->prepare($sql);
        $stmt->execute([
            'order' => $orderId,
            'invoice' => $invoiceId,
            'ptype' => $paymentType,
            'amount' => $payAmount,
            'note' => $note,
            'uid' => $userId,
        ]);
    } else {
        $payTs = table_has_column('payments', 'created_at') && table_has_column('payments', 'updated_at');
        $sql = $payTs
            ? 'INSERT INTO payments (order_id, invoice_id, amount, note, created_by, created_at, updated_at) VALUES (:order, :invoice, :amount, :note, :uid, NOW(), NOW())'
            : 'INSERT INTO payments (order_id, invoice_id, amount, note, created_by) VALUES (:order, :invoice, :amount, :note, :uid)';
        $stmt = db()->prepare($sql);
        $stmt->execute([
            'order' => $orderId,
            'invoice' => $invoiceId,
            'amount' => $payAmount,
            'note' => $note,
            'uid' => $userId,
        ]);
    }
    $payId = (int) db()->lastInsertId();
    if ($payId <= 0 && legacy_db_driver() === 'mysql') {
        $lid = db()->query('SELECT LAST_INSERT_ID()')->fetchColumn();
        $payId = is_numeric($lid) ? (int) $lid : 0;
    } elseif ($payId <= 0 && legacy_db_driver() === 'sqlite') {
        $lid = db()->query('SELECT last_insert_rowid()')->fetchColumn();
        $payId = is_numeric($lid) ? (int) $lid : 0;
    }
    $sel = db()->prepare('SELECT * FROM payments WHERE id = :id LIMIT 1');
    $sel->execute(['id' => $payId]);
    $payment = $sel->fetch();
    if (!$payment || !isset($payment['id'])) {
        throw new RuntimeException('Payment insert did not return a row.');
    }
    $paymentDirection = $paymentType === 'purchase' ? 'debit' : 'credit';
    add_ledger(
        $orderId,
        $paymentType . '_payment',
        (float)$payment['amount'],
        $paymentDirection,
        'payment',
        (int)$payment['id']
    );

    return $payment;
}

/**
 * @return array<string, mixed> Inserted adjustment row
 */
function insert_adjustment_and_ledger_row(int $userId, int $orderId, string $type, float $adjAmount, string $reason): array
{
    if ($orderId <= 0) {
        throw new InvalidArgumentException('orderId is required for adjustment entry.');
    }
    if (!in_array($type, ['purchase', 'billing'], true)) {
        throw new InvalidArgumentException('Invalid adjustment type');
    }
    if ($adjAmount <= 0.00001) {
        throw new InvalidArgumentException('Adjustment amount must be greater than zero.');
    }
    if ($type === 'purchase' && table_has_column('payments', 'payment_type')) {
        $net = order_net_purchase_paid_applied($orderId);
        if ($adjAmount > $net + 0.01) {
            throw new InvalidArgumentException(
                'Purchase adjustment cannot exceed net purchase payments already recorded for this order (৳ ' . (string)round($net) . ').',
            );
        }
    }
    if ($type === 'billing' && table_has_column('payments', 'payment_type')) {
        $net = order_net_billing_paid_applied($orderId);
        if ($adjAmount > $net + 0.01) {
            throw new InvalidArgumentException(
                'Billing adjustment cannot exceed net billing payments already recorded for this order (৳ ' . (string)round($net) . ').',
            );
        }
    }
    $adjTs = table_has_column('adjustments', 'created_at') && table_has_column('adjustments', 'updated_at');
    $adjSql = $adjTs
        ? 'INSERT INTO adjustments (order_id, type, amount, reason, created_by, created_at, updated_at) VALUES (:order, :type, :amount, :reason, :uid, NOW(), NOW())'
        : 'INSERT INTO adjustments (order_id, type, amount, reason, created_by) VALUES (:order, :type, :amount, :reason, :uid)';
    $stmt = db()->prepare($adjSql);
    $stmt->execute([
        'order' => $orderId,
        'type' => $type,
        'amount' => $adjAmount,
        'reason' => $reason,
        'uid' => $userId,
    ]);
    $adjId = (int)db()->lastInsertId();
    $sel = db()->prepare('SELECT * FROM adjustments WHERE id = :id LIMIT 1');
    $sel->execute(['id' => $adjId]);
    $adj = $sel->fetch();
    if (!$adj || !isset($adj['id'])) {
        throw new RuntimeException('Adjustment insert did not return a row.');
    }
    $adjDirection = $type === 'purchase' ? 'credit' : 'debit';
    add_ledger(
        $orderId,
        $type . '_adjustment',
        (float)$adj['amount'],
        $adjDirection,
        'adjustment',
        (int)$adj['id']
    );

    return $adj;
}

/**
 * Resolve purchase unit + line total from order line JSON (camelCase or snake_case).
 * If line total is missing but unit and qty exist, derive total (same rules as frontend).
 *
 * @return array{unit: ?float, total: ?float}
 */
function order_line_purchase_prices(array $line): array
{
    $u = null;
    foreach (['unitPrice', 'unit_price'] as $k) {
        if (!array_key_exists($k, $line) || $line[$k] === '' || $line[$k] === null) {
            continue;
        }
        if (is_numeric($line[$k])) {
            $u = (float)$line[$k];
            break;
        }
    }
    $t = null;
    foreach (['lineTotal', 'line_total'] as $k) {
        if (!array_key_exists($k, $line) || $line[$k] === '' || $line[$k] === null) {
            continue;
        }
        if (is_numeric($line[$k])) {
            $t = (float)$line[$k];
            break;
        }
    }
    if ($t === null && $u !== null && $u > 0) {
        $kg = (float)($line['kg'] ?? 0);
        $gram = (float)($line['gram'] ?? 0);
        $piece = (float)($line['piece'] ?? 0);
        if ($piece > 0) {
            $t = round($u * $piece, 2);
        } else {
            $w = $kg + $gram / 1000.0;
            if ($w > 0) {
                $t = round($u * $w, 2);
            }
        }
    }

    return ['unit' => $u, 'total' => $t];
}

function upsert_item_price_history(int $orderId, array $line, ?array $actorUser): void {
    if (!$actorUser) return;
    $role = (string)($actorUser['role'] ?? '');
    if (!in_array($role, ['admin', 'moderator', 'master_admin'], true)) return;
    $itemCode = trim((string)($line['itemId'] ?? $line['item_code'] ?? ''));
    if ($itemCode === '') return;
    $pr = order_line_purchase_prices($line);
    $unitPrice = $pr['unit'];
    if ($unitPrice === null) {
        return;
    }
    $lineTotal = $pr['total'];

    $catItemStmt = db()->prepare('SELECT id FROM catalog_items WHERE code = :code LIMIT 1');
    $catItemStmt->execute(['code' => $itemCode]);
    $catalogItem = $catItemStmt->fetch();
    if (!$catalogItem || !isset($catalogItem['id'])) return;

    $existingStmt = db()->prepare('SELECT id, new_price FROM item_price_histories WHERE order_id = :order AND item_code = :item LIMIT 1');
    $existingStmt->execute(['order' => $orderId, 'item' => $itemCode]);
    $existing = $existingStmt->fetch();

    if ($existing) {
        $upd = db()->prepare('UPDATE item_price_histories SET old_price = :old_price, new_price = :new_price, unit_price = :unit_price, line_total = :line_total, changed_by = :changed_by, effective_from = NOW(), updated_at = NOW() WHERE id = :id');
        $upd->execute([
            'id' => $existing['id'],
            'old_price' => isset($existing['new_price']) ? (float)$existing['new_price'] : null,
            'new_price' => $unitPrice,
            'unit_price' => $unitPrice,
            'line_total' => $lineTotal,
            'changed_by' => $actorUser['id'] ?? null,
        ]);
        return;
    }

    $ins = db()->prepare('INSERT INTO item_price_histories (catalog_item_id, order_id, item_code, old_price, new_price, unit_price, line_total, changed_by, effective_from, created_at, updated_at) VALUES (:catalog_item_id, :order_id, :item_code, :old_price, :new_price, :unit_price, :line_total, :changed_by, NOW(), NOW(), NOW())');
    $ins->execute([
        'catalog_item_id' => $catalogItem['id'],
        'order_id' => $orderId,
        'item_code' => $itemCode,
        'old_price' => null,
        'new_price' => $unitPrice,
        'unit_price' => $unitPrice,
        'line_total' => $lineTotal,
        'changed_by' => $actorUser['id'] ?? null,
    ]);
}

function order_line_optional_float(array $line, string $camel, string $snake): ?float
{
    $v = $line[$camel] ?? $line[$snake] ?? null;
    if ($v === null || $v === '') {
        return null;
    }
    if (! is_numeric((string) $v)) {
        return null;
    }
    $f = (float) $v;

    return is_finite($f) ? $f : null;
}

function replace_order_lines(int $orderId, array $lines, ?array $actorUser = null): void {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM order_lines WHERE order_id = :id')->execute(['id' => $orderId]);
        if (!$lines) {
            $pdo->commit();

            return;
        }
        $ins = $pdo->prepare('INSERT INTO order_lines (order_id, serial, category_code, item_code, item_name_bn, item_name_en, kg, gram, piece, instructions, unit_price, line_total, markup_percent, markup_amount, unit_price_after_markup, line_total_after_markup, profit_loss_amount, created_at, updated_at) VALUES (:order_id, :serial, :category_code, :item_code, :item_name_bn, :item_name_en, :kg, :gram, :piece, :instructions, :unit_price, :line_total, :markup_percent, :markup_amount, :unit_after, :line_after, :profit_loss, NOW(), NOW())');
        foreach ($lines as $idx => $line) {
            if (!is_array($line)) continue;
            $pr = order_line_purchase_prices($line);
            $cat = (string)($line['categoryId'] ?? $line['category_code'] ?? '');
            $item = (string)($line['itemId'] ?? $line['item_code'] ?? '');
            $markupPct = order_line_optional_float($line, 'markupPercent', 'markup_percent');
            $markupPctIns = $markupPct !== null ? max(0.0, $markupPct) : 0.0;
            $markupAmt = order_line_optional_float($line, 'markupAmount', 'markup_amount');
            $unitAfter = order_line_optional_float($line, 'unitPriceAfterMarkup', 'unit_price_after_markup');
            $lineAfter = order_line_optional_float($line, 'lineTotalAfterMarkup', 'line_total_after_markup');
            $profitLoss = order_line_optional_float($line, 'profitLossAmount', 'profit_loss_amount');
            $ins->execute([
                'order_id' => $orderId,
                'serial' => (int)($line['serial'] ?? ($idx + 1)),
                'category_code' => $cat,
                'item_code' => $item,
                'item_name_bn' => (string)($line['itemNameBn'] ?? $line['item_name_bn'] ?? ''),
                'item_name_en' => (string)($line['itemNameEn'] ?? $line['item_name_en'] ?? ''),
                'kg' => (float)($line['kg'] ?? 0),
                'gram' => (float)($line['gram'] ?? 0),
                'piece' => (float)($line['piece'] ?? 0),
                'instructions' => isset($line['instructions']) ? (string)$line['instructions'] : '',
                'unit_price' => $pr['unit'],
                'line_total' => $pr['total'],
                'markup_percent' => $markupPctIns,
                'markup_amount' => $markupAmt !== null ? $markupAmt : 0.0,
                'unit_after' => $unitAfter,
                'line_after' => $lineAfter,
                'profit_loss' => $profitLoss !== null ? $profitLoss : 0.0,
            ]);
            $normLine = array_merge($line, [
                'categoryId' => $cat,
                'itemId' => $item,
                'unitPrice' => $pr['unit'],
                'lineTotal' => $pr['total'],
            ]);
            upsert_item_price_history($orderId, $normLine, $actorUser);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function delivery_start_parts(string $fallbackDate, string $deliveryTimeField): array {
    $date = $fallbackDate;
    $time = '10:00';
    $window = trim($deliveryTimeField);
    if ($window === '') return [$date, $time, null];

    if (preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})\s*(?:to|–|—|-)\s*/i', $window, $m) === 1) {
        return [$m[1], $m[2], $window];
    }
    if (preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/', $window, $m) === 1) {
        return [$m[1], $m[2], $window];
    }
    if (preg_match('/^\d{2}:\d{2}$/', $window) === 1) {
        return [$date, $window, $window];
    }
    return [$date, $time, $window];
}

/**
 * Billing cycle for statement bucketing. Configure via .env (see backend/.env.example).
 *
 * @return array{cycleDays: int, weekStartDay: int, label: string}
 */
function billing_cycle_config(): array {
    return (new \App\Services\Billing\BillingCycleConfigService())->toArray();
}
/**
 * Build purchase invoice subtotal + snapshot payload from read_order_lines() rows.
 *
 * @param array<int, array<string, mixed>> $lines
 * @return array{subtotal: float, snapshotJson: string}
 */
function purchase_invoice_totals_snapshot(array $lines): array
{
    $subtotal = 0.0;
    $snapshotLines = [];
    foreach ($lines as $line) {
        $lineTotal = (float)($line['lineTotal'] ?? 0);
        $subtotal += $lineTotal;
        $snapshotLines[] = [
            'id' => (string)($line['id'] ?? ''),
            'serial' => (int)($line['serial'] ?? 0),
            'categoryId' => (string)($line['categoryId'] ?? ''),
            'itemId' => (string)($line['itemId'] ?? ''),
            'itemNameBn' => (string)($line['itemNameBn'] ?? ''),
            'itemNameEn' => (string)($line['itemNameEn'] ?? ''),
            'kg' => (string)($line['kg'] ?? ''),
            'gram' => (string)($line['gram'] ?? ''),
            'piece' => (string)($line['piece'] ?? ''),
            'unitPriceBeforeMarkup' => isset($line['unitPrice']) ? (float)$line['unitPrice'] : null,
            'lineTotalBeforeMarkup' => $lineTotal,
            'markupPercent' => 0,
            'markupAmount' => 0,
            'unitPriceAfterMarkup' => isset($line['unitPrice']) ? (float)$line['unitPrice'] : null,
            'lineTotalAfterMarkup' => $lineTotal,
            'profitLossAmount' => 0,
        ];
    }
    $snap = [
        'markupMode' => 'none',
        'markupPercent' => 0,
        'purchaseSubtotal' => $subtotal,
        'billingSubtotal' => $subtotal,
        'profitLossTotal' => 0,
        'lines' => $snapshotLines,
    ];

    return ['subtotal' => $subtotal, 'snapshotJson' => json_encode($snap)];
}

/** Compare invoice totals for regenerate no-op (two decimals, small tolerance). */
function invoice_totals_effectively_equal(float $a, float $b): bool
{
    return abs($a - $b) < 0.02;
}

/**
 * Preview billing grand total from lines + markup inputs (same rules as POST …/billing-invoice; read-only).
 *
 * @param array<int, array<string, mixed>> $lines
 * @param array<string, mixed>            $markupByCategory
 * @param array<string, mixed>            $markupByItem
 */
function billing_invoice_preview_grand_total(array $lines, float $markupPercent, array $markupByCategory, array $markupByItem): float
{
    $lineCategoryCodes = [];
    foreach ($lines as $line) {
        $lineCategory = (string) ($line['categoryId'] ?? '');
        if ($lineCategory !== '') {
            $lineCategoryCodes[$lineCategory] = true;
        }
    }
    $dbMarkupByCategory = [];
    if ($lineCategoryCodes !== []) {
        $codes = array_keys($lineCategoryCodes);
        $placeholders = implode(',', array_fill(0, count($codes), '?'));
        $catMarkupStmt = db()->prepare("SELECT code, COALESCE(markup_percent, 0) AS markup_percent FROM categories WHERE code IN ($placeholders)");
        $catMarkupStmt->execute($codes);
        foreach ($catMarkupStmt->fetchAll() as $catMarkupRow) {
            $dbMarkupByCategory[(string) $catMarkupRow['code']] = (float) $catMarkupRow['markup_percent'];
        }
    }
    $subtotal = 0.0;
    foreach ($lines as $line) {
        $base = (float) ($line['lineTotal'] ?? 0);
        $lineCategory = (string) ($line['categoryId'] ?? '');
        $lineIdKey = (string) ($line['id'] ?? '');
        $lineMarkupPercent = $lineCategory !== '' && array_key_exists($lineCategory, $dbMarkupByCategory)
            ? $dbMarkupByCategory[$lineCategory]
            : $markupPercent;
        if ($lineCategory !== '' && array_key_exists($lineCategory, $markupByCategory)) {
            $lineMarkupPercent = (float) $markupByCategory[$lineCategory];
        }
        if ($lineIdKey !== '' && array_key_exists($lineIdKey, $markupByItem)) {
            $lineMarkupPercent = (float) $markupByItem[$lineIdKey];
        }
        $markupAmount = round($base * ($lineMarkupPercent / 100), 2);
        $billedTotal = $base + $markupAmount;
        $subtotal += $billedTotal;
    }

    return $subtotal;
}

/**
 * Fill missing order_id (from invoice) and invoice_id (latest non-void invoice for type) so payment rows join correctly.
 *
 * @return array{0: ?int, 1: ?int}
 */
function resolve_payment_order_and_invoice_ids(?int $orderId, ?int $invoiceId, string $paymentType): array
{
    $invoiceId = ($invoiceId !== null && $invoiceId > 0) ? $invoiceId : null;
    $orderId = ($orderId !== null && $orderId > 0) ? $orderId : null;

    if ($orderId === null && $invoiceId !== null) {
        $st = db()->prepare('SELECT order_id FROM invoices WHERE id = :id LIMIT 1');
        $st->execute(['id' => $invoiceId]);
        $row = $st->fetch();
        if ($row && isset($row['order_id'])) {
            $orderId = (int) $row['order_id'];
        }
    }

    if ($invoiceId === null && $orderId !== null && in_array($paymentType, ['purchase', 'billing'], true)) {
        $inv = order_latest_invoice_row($orderId, $paymentType);
        if ($inv) {
            $invoiceId = (int) $inv['id'];
        }
    }

    return [$orderId, $invoiceId];
}

/** Refresh latest purchase invoice totals/snapshot after order line cost edits (before billing). */
function sync_latest_purchase_invoice_from_order_lines(int $orderId): void
{
    if (!order_has_invoice_type($orderId, 'purchase')) {
        return;
    }
    $stmt = db()->prepare("SELECT id FROM invoices WHERE order_id = :oid AND type = 'purchase' AND ".invoice_not_voided_sql().' ORDER BY id DESC LIMIT 1');
    $stmt->execute(['oid' => $orderId]);
    $inv = $stmt->fetch();
    if (!$inv) {
        return;
    }
    $lines = read_order_lines($orderId);
    $pack = purchase_invoice_totals_snapshot($lines);
    $upd = db()->prepare('UPDATE invoices SET subtotal = :s, grand_total = :g, snapshot = :snap, updated_at = NOW() WHERE id = :id');
    $upd->execute([
        's' => $pack['subtotal'],
        'g' => $pack['subtotal'],
        'snap' => $pack['snapshotJson'],
        'id' => (int)$inv['id'],
    ]);
}

/** Refresh latest challan snapshot after order line edits. */
function sync_latest_challan_snapshot_from_order(int $orderId): void
{
    if (!order_has_challan($orderId)) {
        return;
    }
    $chStmt = db()->prepare('SELECT id FROM challans WHERE order_id = :oid ORDER BY id DESC LIMIT 1');
    $chStmt->execute(['oid' => $orderId]);
    $ch = $chStmt->fetch();
    if (!$ch || !isset($ch['id'])) {
        return;
    }

    $orderStmt = db()->prepare('SELECT * FROM orders WHERE id = :id LIMIT 1');
    $orderStmt->execute(['id' => $orderId]);
    $orderRow = $orderStmt->fetch();
    if (!$orderRow) {
        return;
    }

    $snapshot = read_order($orderRow);
    $upd = db()->prepare('UPDATE challans SET snapshot = :snap, updated_at = NOW() WHERE id = :id');
    $upd->execute([
        'snap' => json_encode($snapshot),
        'id' => (int)$ch['id'],
    ]);
}
