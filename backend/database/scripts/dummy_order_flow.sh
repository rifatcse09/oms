#!/usr/bin/env bash
# Repeatable dummy data: submit orders → purchase invoice → challan (API smoke test).
#
# Defaults (after php artisan db:seed):
#   Emails match database/seeders/DatabaseSeeder.php: user@demo.local + moderator@demo.local
#   If PHP has PDO (pdo_mysql / pdo_sqlite), pick_dummy_users.php overrides from the users table.
#   Passwords default to demo123 (override with GOM_SHARED_PASSWORD or per-account vars).
#
# Usage:
#   export GOM_API_BASE="http://127.0.0.1:8000"   # must be the API that uses the SAME backend/.env DB
#   bash backend/database/scripts/dummy_order_flow.sh
#
# Optional overrides:
#   GOM_USER_EMAIL / GOM_USER_PASSWORD / GOM_STAFF_EMAIL / GOM_STAFF_PASSWORD
#   GOM_SHARED_PASSWORD=yourpw   (used when a password env is unset)
#   GOM_REPEAT=5   GOM_SLEEP_SEC=0.2
#
# Requires: curl, python3. Catalog must have at least one item. PHP optional (for DB email pick only).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PICK_PHP="$SCRIPT_DIR/pick_dummy_users.php"

API_BASE="${GOM_API_BASE:-http://127.0.0.1:8000}"
API_BASE="${API_BASE%/}"
API="${API_BASE}/api/v1"

SHARED_PW="${GOM_SHARED_PASSWORD:-demo123}"

# Same emails/password as DatabaseSeeder — used when PHP CLI has no PDO driver or pick fails.
SEED_USER_EMAIL="user@demo.local"
SEED_STAFF_EMAIL="moderator@demo.local"

if [[ -z "${GOM_USER_EMAIL:-}" || -z "${GOM_STAFF_EMAIL:-}" ]]; then
  picked_output=""
  pick_ok=0
  if command -v php >/dev/null 2>&1; then
    if picked_output="$(php "$PICK_PHP" 2>/dev/null)" && [[ -n "$picked_output" ]]; then
      if echo "$picked_output" | python3 -c "import json,sys; json.load(sys.stdin)" >/dev/null 2>&1; then
        pick_ok=1
      fi
    fi
  fi
  if [[ "$pick_ok" -eq 1 ]]; then
    [[ -z "${GOM_USER_EMAIL:-}" ]] && GOM_USER_EMAIL="$(echo "$picked_output" | python3 -c "import json,sys; print(json.load(sys.stdin)['userEmail'])")"
    [[ -z "${GOM_STAFF_EMAIL:-}" ]] && GOM_STAFF_EMAIL="$(echo "$picked_output" | python3 -c "import json,sys; print(json.load(sys.stdin)['staffEmail'])")"
    echo "note: picked user emails from DB (pick_dummy_users.php)." >&2
  else
    echo "note: using DatabaseSeeder defaults ($SEED_USER_EMAIL / $SEED_STAFF_EMAIL). Install php-mysql or php-sqlite to auto-read users from DB." >&2
    GOM_USER_EMAIL="${GOM_USER_EMAIL:-$SEED_USER_EMAIL}"
    GOM_STAFF_EMAIL="${GOM_STAFF_EMAIL:-$SEED_STAFF_EMAIL}"
  fi
fi

GOM_USER_PASSWORD="${GOM_USER_PASSWORD:-$SHARED_PW}"
GOM_STAFF_PASSWORD="${GOM_STAFF_PASSWORD:-$SHARED_PW}"

REPEAT="${GOM_REPEAT:-1}"
SLEEP="${GOM_SLEEP_SEC:-0}"

die() { echo "error: $*" >&2; exit 1; }

echo "API:    $API_BASE  (must match the server using $BACKEND_ROOT/.env)"
echo "User:   $GOM_USER_EMAIL"
echo "Staff:  $GOM_STAFF_EMAIL"
curl -fsS "${API}/health" -H "Accept: application/json" | python3 -c "import json,sys; json.load(sys.stdin)" >/dev/null \
  || die "GET ${API}/health failed — start PHP on GOM_API_BASE or fix URL"

login() {
  local email="$1" password="$2"
  local payload resp
  payload=$(EMAIL="$email" PASS="$password" python3 -c "import json,os; print(json.dumps({'email':os.environ['EMAIL'],'password':os.environ['PASS']}))")
  resp=$(curl -fsS -X POST "${API}/auth/login" \
    -H "Content-Type: application/json" -H "Accept: application/json" \
    -d "$payload") || die "login failed for $email (wrong password? try GOM_SHARED_PASSWORD=demo123 after db:seed)"
  python3 -c "import json,sys; d=json.loads(sys.argv[1]); t=d.get('token'); assert t, d; print(t)" "$resp" \
    || die "no token in login response for $email: $resp"
}

first_catalog_line_json() {
  curl -fsS "${API}/catalog" -H "Accept: application/json" | python3 -c "
import json, sys
d = json.load(sys.stdin)
cats = d.get('data') or []
for cat in cats:
    cid = cat.get('id') or ''
    for it in cat.get('items') or []:
        iid = it.get('id') or ''
        if cid and iid:
            print(json.dumps({
                'categoryId': cid,
                'itemId': iid,
                'itemNameBn': it.get('nameBn') or 'Dummy',
                'itemNameEn': it.get('nameEn') or 'Dummy',
            }))
            sys.exit(0)
print('No catalog categories/items found.', file=sys.stderr)
sys.exit(1)
"
}

post_json() {
  local token="$1" url="$2" data="$3"
  curl -fsS -X POST "$url" \
    -H "Content-Type: application/json" -H "Accept: application/json" \
    -H "Authorization: Bearer ${token}" \
    -d "$data"
}

LINE_JSON=$(first_catalog_line_json) || die "catalog fetch / parse failed"

USER_TOKEN=$(login "$GOM_USER_EMAIL" "$GOM_USER_PASSWORD") || exit 1
STAFF_TOKEN=$(login "$GOM_STAFF_EMAIL" "$GOM_STAFF_PASSWORD") || exit 1

today=$(date +%F)
delivery="${today}T10:00 to 12:00"

for ((i = 1; i <= REPEAT; i++)); do
  payload=$(LINE_JSON="$LINE_JSON" TODAY="$today" DELIVERY="$delivery" python3 -c "
import json, os
line = json.loads(os.environ['LINE_JSON'])
line['serial'] = 1
line['kg'] = ''
line['gram'] = ''
line['piece'] = '2'
line['instructions'] = 'dummy-order-flow'
line['unitPrice'] = 42.5
line['lineTotal'] = 85.0
body = {
    'orderDate': os.environ['TODAY'],
    'deliveryDate': os.environ['TODAY'],
    'deliveryTime': os.environ['DELIVERY'],
    'status': 'draft',
    'billingAddress': 'Test billing',
    'deliveryAddress': 'Test delivery',
    'contactPerson': 'Dummy Customer',
    'phone': '01700000000',
    'lines': [line],
}
print(json.dumps(body))
")

  echo "--- run $i/$REPEAT: create order ---"
  created=$(post_json "$USER_TOKEN" "${API}/orders" "$payload") || die "create order failed"
  oid=$(echo "$created" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])") \
    || die "parse order id"

  echo "  order id=$oid"
  post_json "$USER_TOKEN" "${API}/orders/${oid}/confirm" "{}" >/dev/null
  echo "  confirmed"

  echo "  purchase invoice…"
  if post_json "$STAFF_TOKEN" "${API}/orders/${oid}/purchase-invoice" "{}" >/dev/null 2>&1; then
    echo "  purchase invoice OK"
  else
    echo "  purchase-invoice failed (staff role, prices, or duplicate)" >&2
  fi

  echo "  challan…"
  if post_json "$STAFF_TOKEN" "${API}/orders/${oid}/challan" "{}" >/dev/null 2>&1; then
    echo "  challan OK"
  else
    echo "  challan failed (duplicate, or order state)" >&2
  fi

  [[ "$SLEEP" != "0" ]] && sleep "$SLEEP"
done

echo "done. attempted $REPEAT cycle(s)."
echo "If tables stay empty, the API server is using a different database than $BACKEND_ROOT/.env (check that app’s DB_*)."
echo "Postgres check: SELECT id, order_no, status FROM orders ORDER BY id DESC LIMIT 5;"
echo "SQLite check:  sqlite3 $BACKEND_ROOT/database/database.sqlite \"SELECT id, order_no, status FROM orders ORDER BY id DESC LIMIT 5;\""
