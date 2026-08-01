import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Disc3 } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border-2 border-border bg-card p-6 shadow-hard-lg"
      >
        <div className="flex items-center gap-2 border-b-2 border-border pb-4">
          <Disc3 className="size-6 text-primary" />
          <h1 className="font-display text-lg font-bold tracking-widest text-card-foreground uppercase">
            Přihlášení
          </h1>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="email"
            className="font-display text-xs font-bold tracking-wide text-muted-foreground uppercase"
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
            className="w-full rounded-sm border-2 border-border bg-background px-3 py-2 text-card-foreground outline-none focus:border-ring"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="font-display text-xs font-bold tracking-wide text-muted-foreground uppercase"
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
            className="w-full rounded-sm border-2 border-border bg-background px-3 py-2 text-card-foreground outline-none focus:border-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full cursor-pointer"
        >
          {isSubmitting ? "Přihlašuji…" : "Přihlásit se"}
        </Button>
      </form>
    </div>
  );
}
