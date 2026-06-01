# Execution Checklist

## Phase 1-3 (foundation/schema/seeders)
- [x] Dockerized backend service created in `backend/`
- [x] PostgreSQL schema created in `backend/database/schema.sql`
- [x] Seed data added in `backend/database/seed.sql`
- [x] Role model and token auth tables included

## Phase 4 (auth + admin users)
- [x] Register/login/logout/me endpoints implemented
- [x] Admin user list/create endpoints implemented
- [x] Role guards enforced in API handlers

## Phase 5-7 (orders/workflow/invoices)
- [x] Draft order create + update endpoints
- [x] Confirm order endpoint + notification creation
- [x] Edit window lock check with `EDIT_WINDOW_HOURS`
- [x] Challan endpoint
- [x] Purchase invoice endpoint (moderator/admin)
- [x] Billing invoice endpoint (admin only)
- [x] Billing invoice visibility blocked for moderator

## Phase 8-9 (finance/reports/notifications)
- [x] Statement cycle generate/list endpoints
- [x] Payment/adjustment endpoints
- [x] Ledger endpoint and postings
- [x] Admin summary report endpoint
- [x] Notification listing endpoint
- [x] Activity and ledger logs on major actions

## Phase 10 (frontend integration)
- [x] API client added: `frontend/src/lib/api.ts`
- [x] Auth context wired for API login/register/admin-create
- [x] Orders context wired for API list/create/update (fallback-safe)

## Notes
- The current environment lacks Composer/Laravel install capability, so implementation is a framework-free PHP API with PostgreSQL and Docker orchestration.
- Structure follows the planned domain and endpoint responsibilities, ready to migrate into Laravel controllers/models later if needed.

---

## Technical implementation log (Cursor)

Use this section to record **what** was implemented in Cursor-driven sessions and **where** it lives in the repo. Add new dated subsections as work continues.

### 2026-05-02 — Order workflow UI (independent busy state)

- **Goal:** Generate challan / purchase invoice / billing invoice must not block each other while a request is in flight.
- **Change:** Replaced shared `workflowStep` with separate flags:
  - `AdminOrderDetailPage.tsx`: `challanBusy`, `purchaseBusy`, `billingBusy`; handlers set/clear only their own flag in `finally`. Mark delivery waits on `purchaseBusy` / `billingBusy` only (not challan).
  - `ModeratorOrderDetailPage.tsx`: `challanBusy`, `purchaseBusy`; same pattern for challan vs purchase invoice.
- **Removed:** All `workflowStep` / `setWorkflowStep` usage on those pages.

### 2026-05-02 — Statement adjust UX (duplicate copy)

- **Goal:** Avoid repeating the “enter quantities and cost unit…” warning when the amber callout above the line table already states cost requirements.
- **Change:** Removed the duplicate paragraph under workflow buttons in `AdminOrderDetailPage.tsx` and `ModeratorOrderDetailPage.tsx`. Tooltips on disabled purchase button remain.

### 2026-05-02 — Billing & purchase statement adjustments (correct partial / multi-order)

- **Problem:** Statement `totalDue` can aggregate multiple orders per cycle, but each `POST /payments` is capped per **order** invoice. Sending the full delta to one anchor order caused partial totals, confusing “cumulative vs incremental” paid amounts, and status stuck on Partial.
- **New module:** `frontend/src/lib/statementPaymentAllocation.ts`
  - `netPaidAppliedOnOrder`, `invoiceCapForStatement`, `ordersForStatementInvoices`
  - `planPaymentIncreaseChunks` — splits positive payment delta across cycle orders (oldest first), respecting per-order headroom; uses simulated payment rows so multi-chunk plans are consistent.
  - `totalPaymentRoomOnOrders` — validates before API calls.
  - `planAdjustmentDecreaseChunks` — splits negative delta into per-order **adjustments** (newest orders first), capped by net applied per order.
- **Pages updated:** `AdminBillingStatementsPage.tsx`, `PurchaseBillingStatementsPage.tsx`
  - Save path runs sequential `apiCreatePayment` / `apiCreateAdjustment` per chunk.
  - Modal pre-fills **current total paid**; label **“Total paid to date (cumulative)”** and clearer help text.
  - Explicit errors when delta exceeds aggregate per-order room (e.g. carryover larger than cycle invoice caps) or allocation cannot cover the requested change.
- **Backend:** Unchanged; still enforces per-order caps (`backend/public/index.php` payment POST logic).

### 2026-05-02 — Ledger + statement clarity (purchase vs billing)

- **Goal:** Reconcile rows like ৳505 purchase invoice + ৳500 purchase payment with statement **Partial**; ledger looked like generic “Payment” with one mixed running total.
- **`frontend/src/lib/ledgerDisplay.ts`:** `ledgerBookFromEntryType`, `humanLedgerEntryType`, `ledgerBookLabel`.
- **`AdminFinancialLedgerPage.tsx`:** Book filter (All / Supplier purchase / Customer billing / Other); columns Book, Order ref, Entry label; debit/credit/closing totals for **filtered** rows; running balance = credit − debit over filtered set (oldest→newest, table newest first); amber tip to filter purchase book for order-level math.
- **`PurchaseBillingStatementsPage.tsx` / `AdminBillingStatementsPage.tsx`:** Statement detail panels add explanation of cycle-level **Partial** vs per-order math, plus **Per-order settlement** table (invoice cap, net paid, still due per order).

### 2026-05-02 — Moderator (and admin): edit quantities after purchase invoice

- **`OrderLinesEditor.tsx`:** Optional `quantityLocked` and `pricingLocked` (both still implied when legacy `linesLocked` is true). Quantity fields + instructions respect `quantityLocked`; cost unit, delete row respect `pricingLocked`.
- **`ModeratorOrderDetailPage.tsx`:** After a **purchase invoice** exists, **kg / g / pcs** and instructions stay editable until **delivered** or **invoiced**; supplier **cost unit** locked; add-line / add-catalog disabled when pricing is locked.
- **`AdminOrderDetailPage.tsx`:** Same split: quantities editable with purchase or **billing** invoice until delivery/invoiced; cost locked once either invoice exists.

### How to extend this log

1. Add `### YYYY-MM-DD — Short title` under **Technical implementation log**.
2. Bullet **Goal**, **Change**, and key **files** (and **API** if relevant).
3. Link PRs or tickets if you use them externally.
