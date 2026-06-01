# Grocery Order Management Backend/API Doc

## Overview
- Backend service lives in `backend/` and is containerized with PostgreSQL via `docker-compose.yml`.
- API base path: `/api/v1`.
- Auth: bearer token.
- Roles: `user`, `moderator`, `admin`.

## Core Domain Rules
- User creates order as `draft`, then confirms order.
- User edit lock applies when delivery window is less than `EDIT_WINDOW_HOURS` (default `24`).
- Moderator/Admin can generate challan and purchase invoice.
- Only Admin can generate billing invoice.
- Moderator cannot access billing invoices.
- Every financial action creates ledger/audit records.

## Main Tables
- Identity/Auth: `users`, `auth_tokens`
- Catalog: `categories`, `catalog_items`, `item_price_histories`
- Orders: `orders`, `order_lines`, `order_status_histories`
- Documents: `challans`, `invoices`, `invoice_lines`
- Pricing history: `category_markup_settings`, `category_markup_histories`
- Finance: `statement_cycles`, `payments`, `adjustments`, `ledger_entries`
- Audit/notifications: `activity_logs`, `notifications`

## Key Endpoints
- Auth:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- Admin user management:
  - `GET /api/v1/admin/users`
  - `POST /api/v1/admin/users`
- Orders:
  - `GET /api/v1/orders`
  - `POST /api/v1/orders`
  - `PUT /api/v1/orders/{id}`
  - `POST /api/v1/orders/{id}/confirm`
- Workflow documents:
  - `POST /api/v1/orders/{id}/challan`
  - `GET /api/v1/orders/{id}/challan`
  - `POST /api/v1/orders/{id}/purchase-invoice`
  - `POST /api/v1/orders/{id}/billing-invoice`
  - `GET /api/v1/orders/{id}/invoices`
- Finance/reporting:
  - `POST /api/v1/statements/generate`
  - `GET /api/v1/statements`
  - `POST /api/v1/payments`
  - `POST /api/v1/adjustments`
  - `GET /api/v1/ledger`
  - `GET /api/v1/admin/reports/summary`

## Running Locally
1. `docker compose up --build`
2. Backend: `http://localhost:8000/api/v1/health`
3. Configure frontend env:
   - `VITE_API_BASE_URL=http://localhost:8000`

## Seed Accounts
- Admin: `admin@demo.local` / `demo123`
- Moderator: `moderator@demo.local` / `demo123`
- User: `user@demo.local` / `demo123`
