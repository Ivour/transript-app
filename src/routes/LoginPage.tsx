import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";

/**
 * Single-user sign-in screen. No public sign-up exists in this app — the
 * only account is created manually in the Supabase dashboard (see
 * .clinerules section 0 & 3).
 */
export default function LoginPage() {
  const { session, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session) {
    const redirectTo =
      (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await signIn(email, password);

    setIsSubmitting(false);
    if (signInError) {
      setError(signInError);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-md bg-card-bg p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-ink">Přihlášení</h1>

        <div className="space-y-1">
          <label
            htmlFor="email"
            className="text-sm font-medium text-ink"
          >
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-ink outline-none focus:border-focus"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="text-sm font-medium text-ink"
          >
            Heslo
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-ink outline-none focus:border-focus"
          />
        </div>

        {error && <p className="text-sm text-live">{error}</p>}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full cursor-pointer rounded-full text-callout font-semibold"
        >
          {isSubmitting ? "Přihlašuji…" : "Přihlásit se"}
        </Button>
      </form>
    </div>
  );
}
