import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";

/**
 * Gate for routes that require an authenticated session. Unauthenticated
 * visitors are redirected to /login; the attempted path is preserved so
 * LoginPage can send them back after signing in.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-ink-muted">
        Načítání…
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  return <>{children}</>;
}
