import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { AdminAccountsDataTable } from "../components/admin/AdminAccountsDataTable";

export function AdminModeratorsPage() {
  const { listAccounts } = useAuth();
  const moderators = useMemo(() => listAccounts().filter((a) => a.role === "moderator" && !a.deletedAt), [listAccounts]);

  return <AdminAccountsDataTable kind="moderators" accounts={moderators} />;
}
