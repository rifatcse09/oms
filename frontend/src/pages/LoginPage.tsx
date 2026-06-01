import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const roleCards: { role: Role; title: string; hint: string }[] = [
  {
    role: "user",
    title: "User",
    hint: "Create orders and view invoices",
  },
  {
    role: "moderator",
    title: "Moderator",
    hint: "Quantities, pricing, challan & billing",
  },
  {
    role: "admin",
    title: "Administrator",
    hint: "Full analytics & reports",
  },
  {
    role: "master_admin",
    title: "Master administrator",
    hint: "Full control, document regeneration & soft delete",
  },
];

const demoCreds: Record<Role, { email: string; password: string }> = {
  user: { email: "user@demo.local", password: "demo123" },
  moderator: { email: "moderator@demo.local", password: "demo123" },
  admin: { email: "admin@demo.local", password: "demo123" },
  master_admin: { email: "master@demo.local", password: "demo123" },
};

/** Demo quick-pick cards are for `vite` dev only; production build uses a plain role control. */
const showDemoUserCards = import.meta.env.DEV;

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const go = async () => {
    const res = await login(email, password);
    if (!res.ok) {
      setError(res.message ?? "Sign in failed.");
      return;
    }
    if (res.role === "user") navigate("/user/orders", { replace: true });
    else if (res.role === "moderator") navigate("/moderator/orders", { replace: true });
    else navigate("/admin", { replace: true });
  };

  const goSignup = async () => {
    const res = await register({
      name,
      phone,
      email,
      password,
      billingAddress,
      deliveryAddress,
    });
    if (!res.ok) {
      setError(res.message ?? "Sign up failed.");
      return;
    }
    navigate("/user/orders", { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <Card className="border-border shadow-card">
          <CardHeader className="space-y-1 pb-4">
            <BrandLogo showMark className="mb-2" />
            <div className="flex rounded-lg bg-muted p-1 text-xs">
              <Button
                type="button"
                variant={mode === "signin" ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "flex-1 rounded-md shadow-none",
                  mode === "signin"
                    ? "bg-slate-700 text-white hover:bg-slate-600 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
                    : "text-slate-600 hover:bg-slate-100",
                )}
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
              >
                Sign in
              </Button>
              <Button
                type="button"
                variant={mode === "signup" ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "flex-1 rounded-md shadow-none",
                  mode === "signup"
                    ? "bg-slate-700 text-white hover:bg-slate-600 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
                    : "text-slate-600 hover:bg-slate-100",
                )}
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                Sign up
              </Button>
            </div>
            <CardTitle className="text-2xl text-brand-dark">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? showDemoUserCards
                  ? "Use your role account to sign in. For demo roles, any password works."
                  : "Sign in with the email and password for your account."
                : "New registration is for procurement requester (user role)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {mode === "signin" ? (
              showDemoUserCards ? (
                <div className="grid gap-3">
                  {roleCards.map((r) => (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => {
                        setEmail(demoCreds[r.role].email);
                        setPassword(demoCreds[r.role].password);
                        setError("");
                      }}
                      className={cn(
                        "rounded-2xl border p-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        email.trim().toLowerCase() === demoCreds[r.role].email.toLowerCase()
                          ? "border-primary bg-muted ring-2 ring-primary"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <p className="text-base font-semibold">{r.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{r.hint}</p>
                    </button>
                  ))}
                </div>
              ) : null
            ) : null}

            <div className="space-y-3">
              {mode === "signup" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full name</Label>
                    <Input
                      id="signup-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Phone</Label>
                    <Input
                      id="signup-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+8801XXXXXXXXX"
                    />
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-password">Password</Label>
                <div className="relative">
                  <Input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {mode === "signup" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="signup-billing">Billing address</Label>
                    <Input
                      id="signup-billing"
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                      placeholder="Billing address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-delivery">Delivery address</Label>
                    <Input
                      id="signup-delivery"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Delivery address"
                    />
                  </div>
                </>
              ) : null}
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              {mode === "signin" ? (
                <Button type="button" className="w-full bg-slate-700 text-white hover:bg-slate-600" onClick={go}>
                  Sign in
                </Button>
              ) : (
                <Button type="button" className="w-full bg-slate-700 text-white hover:bg-slate-600" onClick={goSignup}>
                  Create account
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Designed &amp; developed by{" "}
            <a href="https://invatiqsoft.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:underline">InvatiqSoft</a>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <a href="mailto:support@invatiqsoft.com" className="hover:underline">support@invatiqsoft.com</a>
            {" · "}
            <a href="tel:+8801867254624" className="hover:underline">01867254624</a>
          </p>
        </div>
      </div>
    </div>
  );
}
