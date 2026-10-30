import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { supabase, supabaseReady } from "./lib/supabase";
import type { Action, SignedInUser } from "./types";

interface AuthValue {
  user: SignedInUser | null;
  actions: Action[];
  loading: boolean;
  /** Set when the person is signed in to Supabase but the office app will not let them in yet. */
  blocked: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  can(action: Action): boolean;
}

const AuthContext = createContext<AuthValue>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const me = await api.get<{ user: SignedInUser; actions: Action[] }>("/me");
      setUser(me.user);
      setActions(me.actions);
      setBlocked(null);
    } catch (e: any) {
      setUser(null);
      setActions([]);
      // 403 means Supabase knows them but the Admin has not let them in yet.
      setBlocked(e?.status === 403 ? e.message : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return; }
    supabase!.auth.getSession().then(({ data }) => (data.session ? loadProfile() : setLoading(false)));
    const { data: sub } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) { setUser(null); setActions([]); setBlocked(null); setLoading(false); }
      else loadProfile();
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value = useMemo<AuthValue>(() => ({
    user,
    actions,
    loading,
    blocked,
    async signIn(email, password) {
      if (!supabase) throw new Error("The app is not connected to Supabase yet. Check frontend/.env.");
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setLoading(false); throw new Error(error.message.match(/invalid/i) ? "Wrong email or password." : error.message); }
      await loadProfile();
    },
    async signOut() {
      await supabase?.auth.signOut();
      setUser(null); setActions([]); setBlocked(null);
    },
    can: (action) => actions.includes(action)
  }), [user, actions, loading, blocked, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
