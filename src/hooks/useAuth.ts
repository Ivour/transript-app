import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./auth-context";

/**
 * Access the current Supabase auth session (see `src/hooks/AuthProvider.tsx`
 * for the provider). Auth in this app is single-user, email/password only —
 * see .clinerules section 0 & 7.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
