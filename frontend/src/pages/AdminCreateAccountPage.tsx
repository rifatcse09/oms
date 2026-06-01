import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../types";

export function AdminCreateAccountPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { createAccountByAdmin, updateAccountByAdmin, listAccounts, user } = useAuth();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    role: "moderator" as Role,
    billingAddress: "",
    deliveryAddress: "",
  });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill form when editing
  useEffect(() => {
    if (!id) return;
    const account = listAccounts().find((a) => a.id === id);
    if (!account) return;
    setForm({
      name: account.name,
      phone: account.phone ?? "",
      email: account.email,
      password: "",
      role: account.role,
      billingAddress: account.billingAddress ?? "",
      deliveryAddress: account.deliveryAddress ?? "",
    });
  }, [id, listAccounts]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    let result: { ok: boolean; message?: string };

    if (isEdit && id) {
      result = await updateAccountByAdmin(id, {
        name: form.name,
        phone: form.phone,
        email: form.email,
        role: form.role,
        billingAddress: form.billingAddress || undefined,
        deliveryAddress: form.deliveryAddress || undefined,
        ...(form.password.trim() ? { password: form.password } : {}),
      });
    } else {
      result = await createAccountByAdmin({
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
        role: form.role,
        billingAddress: form.billingAddress.trim() || undefined,
        deliveryAddress: form.deliveryAddress.trim() || undefined,
      });
    }

    setLoading(false);

    if (!result.ok) {
      setMsg({ type: "err", text: result.message ?? (isEdit ? "Failed to update account." : "Failed to create account.") });
      return;
    }

    if (isEdit) {
      setMsg({ type: "ok", text: "Account updated." });
      setTimeout(() => navigate(-1), 800);
    } else {
      setMsg({ type: "ok", text: `${form.role} account created.` });
      setForm({ name: "", phone: "", email: "", password: "", role: "moderator", billingAddress: "", deliveryAddress: "" });
    }
  }

  const fieldClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="text-2xl font-bold">
        {isEdit ? "Edit account" : "Create user / moderator"}
      </h1>

      <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name</label>
            <input
              className={fieldClass}
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
            <input
              className={fieldClass}
              placeholder="+880..."
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
            <input
              className={fieldClass}
              type="email"
              placeholder="user@example.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Password{isEdit && <span className="ml-1 font-normal normal-case text-slate-400">— leave blank to keep current</span>}
            </label>
            <input
              className={fieldClass}
              type="password"
              placeholder={isEdit ? "Leave blank to keep unchanged" : "Password"}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              {...(!isEdit ? { required: true } : {})}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Role
            </label>
            <select
              className={fieldClass}
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              {(user?.role === "admin" || user?.role === "master_admin") && (
                <option value="admin">Administrator</option>
              )}
              {user?.role === "master_admin" && (
                <option value="master_admin">Master administrator</option>
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Billing address <span className="font-normal normal-case text-slate-400">— optional</span>
            </label>
            <textarea
              className={`${fieldClass} min-h-[72px]`}
              placeholder="Invoice / billing address"
              value={form.billingAddress}
              onChange={(e) => setForm((p) => ({ ...p, billingAddress: e.target.value }))}
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Delivery address <span className="font-normal normal-case text-slate-400">— optional</span>
            </label>
            <textarea
              className={`${fieldClass} min-h-[72px]`}
              placeholder="Default delivery address"
              value={form.deliveryAddress}
              onChange={(e) => setForm((p) => ({ ...p, deliveryAddress: e.target.value }))}
              rows={3}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Saving…" : isEdit ? "Save changes" : "Create account"}
          </button>
        </form>

        {msg ? (
          <p className={`mt-3 text-sm font-medium ${msg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
