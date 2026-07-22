import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

/**
 * Split into its own file (separate from the `AuthProvider` component and
 * the `useAuth` hook) so that Vite's react-refresh plugin can still treat
 * `AuthProvider.tsx` as a component-only module.
 */
export interface AuthContextValue {
  /** Current Supabase session, or null when signed out. */
  session: Session | null;
  /** Convenience accessor for `session.user`. */
  user: User | null;
  /** True while the initial session is being restored on page load. */
  isLoading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
