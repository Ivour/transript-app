import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, BarChart2, AlertCircle } from "lucide-react";

interface UsageSession {
  id: string;
  duration_seconds: number;
  cost_usd: number;
  created_at: string;
}

export default function UsagePage() {
  const { user } = useAuth();
  const [sessions, setUsageSessions] = useState<UsageSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchUsageData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(prev => prev === true ? prev : true);
    }
    setError(prev => prev === null ? prev : null);

    try {
      const { data, error: selectError } = await supabase
        .from("usage_sessions")
        .select("id, duration_seconds, cost_usd, created_at")
        .order("created_at", { ascending: false });

      if (selectError) {
        throw selectError;
      }

      setUsageSessions(data || []);
    } catch (err) {
      console.error("Error fetching usage stats:", err);
      setError("Nepodařilo se načíst statistiky využití.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Defer the initial load to the next event loop tick to ensure zero synchronous state setting during render
    const timer = setTimeout(() => {
      fetchUsageData(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchUsageData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchUsageData(true);
  };

  // Compute metric summaries
  const totalSeconds = sessions.reduce((acc, s) => acc + s.duration_seconds, 0);
  const totalMinutes = totalSeconds / 60;
  const totalCostUsd = sessions.reduce((acc, s) => acc + Number(s.cost_usd), 0);

  const formatDateTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs} s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon-sm" aria-label="Zpět na nahrávání">
              <ArrowLeft className="size-4 text-slate-600" />
            </Button>
          </Link>
          <span className="text-sm font-semibold text-slate-800">Moje využití</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          aria-label="Obnovit"
        >
          <RefreshCw className={`size-4 text-slate-600 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6 pb-20">
        {/* User Info Bar */}
        <div className="text-xs text-slate-500 text-center">
          Uživatel: <span className="font-medium text-slate-700">{user?.email}</span>
        </div>

        {/* Totals Widgets cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Celkový čas</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {totalMinutes ? totalMinutes.toFixed(1) : "0.0"}
              </span>
              <span className="text-xs font-medium text-slate-500">minuty</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Odhad ceny</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xs font-medium text-slate-500">$</span>
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {totalCostUsd ? totalCostUsd.toFixed(4) : "0.0000"}
              </span>
              <span className="text-xs font-medium text-slate-500">USD</span>
            </div>
          </div>
        </div>

        {/* Loading and Error States */}
        {loading && (
          <div className="flex justify-center py-8">
            <RefreshCw className="animate-spin text-slate-400 size-6" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-rose-300/30 text-rose-700 text-sm flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Usage Logs section */}
        {!loading && !error && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 px-1">
              <BarChart2 className="size-4 text-slate-500" />
              <span>Historie spojení</span>
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 font-normal">
                {sessions.length}
              </span>
            </h2>

            {sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 py-10 text-center">
                <p className="text-sm text-slate-400">Dosud nebyly zaznamenány žádné přepisy.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                <div className="divide-y divide-slate-150">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-slate-400">
                          {formatDateTime(session.created_at)}
                        </p>
                        <p className="text-sm font-semibold text-slate-800">
                          {formatDuration(session.duration_seconds)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                          Cena:
                        </span>
                        <p className="text-sm font-semibold text-slate-950">
                          ${session.cost_usd ? Number(session.cost_usd).toFixed(5) : "0.00000"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
