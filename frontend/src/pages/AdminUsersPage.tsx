import { useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { AdminAccountsDataTable } from "../components/admin/AdminAccountsDataTable";
import { clearAllSignupNotifications } from "../lib/orderNotifications";

export function AdminUsersPage() {
  const { listAccounts } = useAuth();
  const users = useMemo(() => listAccounts().filter((a) => a.role === "user" && !a.deletedAt), [listAccounts]);

  useEffect(() => {
    clearAllSignupNotifications();
  }, []);

  return <AdminAccountsDataTable kind="users" accounts={users} />;
}
