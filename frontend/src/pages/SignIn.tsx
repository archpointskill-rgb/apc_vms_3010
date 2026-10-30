import { useState } from "react";
import { useAuth } from "../auth";
import { supabaseReady } from "../lib/supabase";
import { Banner, Footer, Logo } from "../components/ui";

export default function SignIn() {
  const { signIn, blocked } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center p-4">
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-16" />
            <h1 className="font-head text-xl text-brand-blue">Visitor management</h1>
            <p className="text-xs text-slate-500">Arch Point office, Jaipur</p>
          </div>

          {!supabaseReady && (
            <Banner kind="warn">
              This copy is not connected to Supabase yet. Fill in <code>frontend/.env</code> and restart.
            </Banner>
          )}
          {blocked && <Banner kind="warn">{blocked}</Banner>}

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="input"
                   value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="input"
                   value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && <Banner kind="error">{error}</Banner>}

          <button className="btn-primary w-full" disabled={busy || !supabaseReady}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Accounts are created by the Admin. If you cannot get in, ask them to check your account.
          </p>
        </form>
      </div>
      <Footer />
    </div>
  );
}
