import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./context/AuthContext";
import { AdminBillingStatementsPage } from "./pages/AdminBillingStatementsPage";
import { AdminCatalogPage } from "./pages/AdminCatalogPage";
import { AdminCreateAccountPage } from "./pages/AdminCreateAccountPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminFinancialLedgerPage } from "./pages/AdminFinancialLedgerPage";
import { AdminModeratorsPage } from "./pages/AdminModeratorsPage";
import { AdminOrderDetailPage } from "./pages/AdminOrderDetailPage";
import { AdminOrdersPage } from "./pages/AdminOrdersPage";
import { AdminOutstandingBillsPage } from "./pages/AdminOutstandingBillsPage";
import { AdminPurchasePendingBillsPage } from "./pages/AdminPurchasePendingBillsPage";
import { AdminStockPage } from "./pages/AdminStockPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { LoginPage } from "./pages/LoginPage";
import { ModeratorOrderDetailPage } from "./pages/ModeratorOrderDetailPage";
import { ModeratorOrdersPage } from "./pages/ModeratorOrdersPage";
import { OrderFormPage } from "./pages/OrderFormPage";
import { PurchaseBillingStatementsPage } from "./pages/PurchaseBillingStatementsPage";
import { PurchaseInvoiceDetailPage } from "./pages/PurchaseInvoiceDetailPage";
import { ReviewOrderPage } from "./pages/ReviewOrderPage";
import { UserChallanDetailPage } from "./pages/UserChallanDetailPage";
import { UserInvoiceDetailPage } from "./pages/UserInvoiceDetailPage";
import { UserInvoicesPage } from "./pages/UserInvoicesPage";
import { UserOrderDashboard } from "./pages/UserOrderDashboard";
import type { Role } from "./types";

function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireRole({ allow }: { allow: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/user/orders" replace />} />
          <Route
            element={<RequireRole allow={["user", "admin", "master_admin"]} />}
          >
            <Route path="/user/orders" element={<UserOrderDashboard />} />
            <Route path="/user/orders/new" element={<OrderFormPage />} />
            <Route path="/user/orders/:id/edit" element={<OrderFormPage />} />
            <Route
              path="/user/orders/:id/review"
              element={<ReviewOrderPage />}
            />
            <Route path="/user/invoices" element={<UserInvoicesPage />} />
            <Route
              path="/user/invoices/:id"
              element={<UserInvoiceDetailPage />}
            />
            <Route
              path="/user/challans/:id"
              element={<UserChallanDetailPage />}
            />
            <Route
              path="/user/catalog"
              element={<Navigate to="/user/catalog/categories" replace />}
            />
            <Route
              path="/user/catalog/categories"
              element={<AdminCatalogPage view="categories" />}
            />
            <Route
              path="/user/catalog/products"
              element={<AdminCatalogPage view="products" />}
            />
          </Route>
          <Route
            element={
              <RequireRole allow={["moderator", "admin", "master_admin"]} />
            }
          >
            <Route
              path="/moderator/orders/new"
              element={<AdminOrderDetailPage />}
            />
            <Route
              path="/moderator/orders/:id/bookkeeping"
              element={<AdminOrderDetailPage />}
            />
            <Route path="/moderator/orders" element={<ModeratorOrdersPage />} />
            <Route
              path="/moderator/purchase-invoices/:id"
              element={<PurchaseInvoiceDetailPage />}
            />
            <Route
              path="/moderator/challans/:id"
              element={<UserChallanDetailPage />}
            />
            <Route
              path="/moderator/purchase-pending-bills"
              element={<AdminPurchasePendingBillsPage />}
            />
            <Route
              path="/moderator/purchase-statements"
              element={<PurchaseBillingStatementsPage />}
            />
            <Route
              path="/moderator/orders/:id"
              element={<ModeratorOrderDetailPage />}
            />
            <Route
              path="/moderator/dashboard"
              element={<AdminDashboardPage />}
            />
            <Route
              path="/moderator/catalog"
              element={<Navigate to="/moderator/catalog/categories" replace />}
            />
            <Route
              path="/moderator/catalog/categories"
              element={<AdminCatalogPage view="categories" />}
            />
            <Route
              path="/moderator/catalog/products"
              element={<AdminCatalogPage view="products" />}
            />
          </Route>
          <Route element={<RequireRole allow={["admin", "master_admin"]} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route
              path="/admin/catalog"
              element={<Navigate to="/admin/catalog/categories" replace />}
            />
            <Route
              path="/admin/catalog/categories"
              element={<AdminCatalogPage view="categories" />}
            />
            <Route
              path="/admin/catalog/products"
              element={<AdminCatalogPage view="products" />}
            />
            <Route
              path="/admin/orders/new"
              element={<AdminOrderDetailPage />}
            />
            <Route path="/admin/orders" element={<AdminOrdersPage />} />
            <Route
              path="/admin/purchase-invoices"
              element={<AdminOrdersPage />}
            />
            <Route
              path="/admin/purchase-invoices/:id"
              element={<PurchaseInvoiceDetailPage />}
            />
            <Route
              path="/admin/challans/:id"
              element={<UserChallanDetailPage />}
            />
            <Route
              path="/admin/purchase-pending-bills"
              element={<AdminPurchasePendingBillsPage />}
            />
            <Route
              path="/admin/purchase-statements"
              element={<PurchaseBillingStatementsPage />}
            />
            <Route
              path="/admin/billing-invoices"
              element={<AdminOrdersPage />}
            />
            <Route
              path="/admin/billing-invoices/:id"
              element={<UserInvoiceDetailPage />}
            />
            <Route
              path="/admin/orders/:id"
              element={<AdminOrderDetailPage />}
            />
            <Route
              path="/admin/statements"
              element={<AdminBillingStatementsPage />}
            />
            <Route
              path="/admin/outstanding"
              element={<AdminOutstandingBillsPage />}
            />
            <Route
              path="/admin/ledger"
              element={<AdminFinancialLedgerPage />}
            />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route
              path="/admin/users/:id/edit"
              element={<AdminCreateAccountPage />}
            />
            <Route path="/admin/moderators" element={<AdminModeratorsPage />} />
            <Route
              path="/admin/moderators/:id/edit"
              element={<AdminCreateAccountPage />}
            />
            <Route path="/admin/create" element={<AdminCreateAccountPage />} />
            <Route path="/admin/stock" element={<AdminStockPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
