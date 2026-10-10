import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  RefreshCw,
  BarChart2,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface UsageSession {
  id: string;
  duration_seconds: number;
  cost_usd: number;
  created_at: string;
}

const CZECH_MONTHS = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"
];

export default function UsagePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"monthly" | "all-time">("monthly");
  
  // Track selected month based on key e.g. "YYYY-MM"
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Use TanStack Query for fully cached, safe database querying
  const {
    data: sessions = [],
    isLoading,
    error,
    isRefetching,
    refetch,
  } = useQuery<UsageSession[]>({
    queryKey: ["usage-sessions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error: selectError } = await supabase
        .from("usage_sessions")
        .select("id, duration_seconds, cost_usd, created_at")
        .order("created_at", { ascending: false });

      if (selectError) {
        throw selectError;
      }
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["usage-sessions", user?.id] });
    refetch();
  };

  // Format month key e.g. "2026-07" to Czech "Červenec 2026"
  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split("-");
    const monthIndex = parseInt(month, 10) - 1;
    return `${CZECH_MONTHS[monthIndex]} ${year}`;
  };

  // Discover and list all unique chronological month keys ascending (e.g. oldest first)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    
    // Always include current calendar month so it is in the list
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    months.add(currentKey);

    sessions.forEach(s => {
      const date = new Date(s.created_at);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      months.add(`${yyyy}-${mm}`);
    });

    return Array.from(months).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  // Find index of our selected key in the sorted list
  const selectedIndex = useMemo(() => {
    const idx = availableMonths.indexOf(selectedMonthKey);
    return idx !== -1 ? idx : availableMonths.length - 1;
  }, [availableMonths, selectedMonthKey]);

  // Handle previous button click
  const handlePrevMonth = () => {
    if (selectedIndex > 0) {
      setSelectedMonthKey(availableMonths[selectedIndex - 1]);
    }
  };

  // Handle next button click
  const handleNextMonth = () => {
    if (selectedIndex < availableMonths.length - 1) {
      setSelectedMonthKey(availableMonths[selectedIndex + 1]);
    }
  };

  const isPrevDisabled = selectedIndex <= 0;
  const isNextDisabled = selectedIndex >= availableMonths.length - 1;

  // Filtered sessions visible in the log list
  const filteredSessions = useMemo(() => {
    if (viewMode === "all-time") return sessions;
    return sessions.filter(s => {
      const date = new Date(s.created_at);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      return `${yyyy}-${mm}` === selectedMonthKey;
    });
  }, [sessions, viewMode, selectedMonthKey]);

  // Pagination state variables
  const [page, setPage] = useState<number>(1);
  const limit = 10;
  const totalPages = useMemo(() => Math.ceil(filteredSessions.length / limit), [filteredSessions]);
  const paginatedSessions = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredSessions.slice(start, start + limit);
  }, [filteredSessions, page]);

  // Aggregate stats dynamically in memory
  const stats = useMemo(() => {
    const activeSeconds = filteredSessions.reduce((acc, s) => acc + s.duration_seconds, 0);
    const activeCost = filteredSessions.reduce((acc, s) => acc + Number(s.cost_usd), 0);
    const totalSeconds = sessions.reduce((acc, s) => acc + s.duration_seconds, 0);
    const totalCost = sessions.reduce((acc, s) => acc + Number(s.cost_usd), 0);

    return {
      activeMinutes: activeSeconds / 60,
      activeCost,
      totalMinutes: totalSeconds / 60,
      totalCost,
    };
  }, [filteredSessions, sessions]);

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
    <div className="flex min-h-dvh flex-col bg-canvas pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-ink">
      {/* Top Header */}
      <header className="sticky top-[env(safe-area-inset-top)] z-10 flex items-center justify-between border-b border-hairline bg-card-bg px-4 py-3">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon-sm" aria-label="Zpět na nahrávání">
              <ArrowLeft className="size-4 text-ink-muted" />
            </Button>
          </Link>
          <span className="text-sm font-semibold text-ink">Moje využití</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={isLoading || isRefetching}
          aria-label="Obnovit"
        >
          <RefreshCw className={cn("size-4 text-ink-muted", isRefetching && "animate-spin")} />
        </Button>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6 pb-20">
        {/* User Info Bar */}
        <div className="text-xs text-ink-muted text-center">
          Uživatel: <span className="font-medium text-ink">{user?.email}</span>
        </div>

        {/* Dynamic Month Selector / Tab Selector switcher */}
        <div className="rounded-md border border-hairline bg-card-bg p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="size-4 text-ink-muted" />
              Období
            </span>
            <div className="flex gap-1.5 bg-glass-strong rounded-sm p-0.5">
              <button
                onClick={() => setViewMode("monthly")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                  viewMode === "monthly"
                    ? "bg-card-bg text-ink shadow-sm ring-1 ring-hairline"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                Měsíční
              </button>
              <button
                onClick={() => setViewMode("all-time")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                  viewMode === "all-time"
                    ? "bg-card-bg text-ink shadow-sm ring-1 ring-hairline"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                Celkově
              </button>
            </div>
          </div>

          {/* Interactive chevron Month Switcher se šipkami under Monthly Mode */}
          {viewMode === "monthly" && (
            <div className="flex items-center justify-between border-t border-hairline pt-3 mt-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handlePrevMonth}
                disabled={isPrevDisabled}
                aria-label="Předchozí měsíc"
              >
                <ChevronLeft className="size-4 text-ink-muted" />
              </Button>
              
              <span className="text-sm font-bold text-ink tracking-tight text-center min-w-[140px]">
                {formatMonthLabel(selectedMonthKey)}
              </span>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleNextMonth}
                disabled={isNextDisabled}
                aria-label="Následující měsíc"
              >
                <ChevronRight className="size-4 text-ink-muted" />
              </Button>
            </div>
          )}
        </div>

        {/* Totals Widgets cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md border border-hairline bg-card-bg p-4 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              {viewMode === "all-time" ? "Celkový čas" : "Čas v období"}
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight text-ink">
                {stats.activeMinutes.toFixed(1)}
              </span>
              <span className="text-xs font-medium text-ink-muted">minuty</span>
            </div>
            {viewMode !== "all-time" && sessions.length > 0 && (
              <span className="text-[10px] text-ink-muted mt-1">Celkově: {stats.totalMinutes.toFixed(1)} min</span>
            )}
          </div>

          <div className="rounded-md border border-hairline bg-card-bg p-4 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              {viewMode === "all-time" ? "Celková cena" : "Cena v období"}
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xs font-medium text-ink-muted">$</span>
              <span className="text-2xl font-bold tracking-tight text-ink">
                {stats.activeCost.toFixed(4)}
              </span>
              <span className="text-xs font-medium text-ink-muted">USD</span>
            </div>
            {viewMode !== "all-time" && sessions.length > 0 && (
              <span className="text-[10px] text-ink-muted mt-1">Celkově: ${stats.totalCost.toFixed(4)}</span>
            )}
          </div>
        </div>

        {/* Loading and Error States */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <RefreshCw className="animate-spin text-ink-muted size-6" />
          </div>
        )}

        {error && (
          <div className="rounded-sm bg-live/10 p-3 ring-1 ring-live/30 text-live text-sm flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{(error as Error).message || "Nepodařilo se načíst statistiky využití."}</span>
          </div>
        )}

        {/* Usage Logs section */}
        {!isLoading && !error && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5 px-1">
              <BarChart2 className="size-4 text-ink-muted" />
              <span>
                {viewMode === "all-time" ? "Celá historie spojení" : "Historie spojení v období"}
              </span>
              <span className="ml-auto rounded-full bg-glass-strong px-2 py-0.5 text-xs text-ink-muted font-normal">
                {filteredSessions.length} / {sessions.length}
              </span>
            </h2>

            {filteredSessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-hairline bg-card-bg/50 py-10 text-center">
                <p className="text-sm text-ink-muted">Dosud nebyly zaznamenány žádné přepisy.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-hairline bg-card-bg shadow-sm">
                <div className="divide-y divide-hairline pprev-list">
                  {paginatedSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3.5 hover:bg-glass-strong transition-colors"
                    >
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-ink-muted">
                          {formatDateTime(session.created_at)}
                        </p>
                        <p className="text-sm font-semibold text-ink">
                          {formatDuration(session.duration_seconds)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold uppercase text-ink-muted tracking-wider">
                          Cena:
                        </span>
                        <p className="text-sm font-semibold text-ink">
                          ${session.cost_usd ? Number(session.cost_usd).toFixed(5) : "0.00000"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-hairline px-3.5 py-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPage((prev: number) => Math.max(prev - 1, 1))}
                      disabled={page === 1}
                      aria-label="Předchozí stránka"
                    >
                      <ChevronLeft className="size-4 text-ink-muted" />
                    </Button>

                    <span className="text-sm font-bold text-ink tracking-tight">
                      Stránka {page} z {totalPages}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPage((prev: number) => Math.min(prev + 1, totalPages))}
                      disabled={page === totalPages}
                      aria-label="Následující stránka"
                    >
                      <ChevronRight className="size-4 text-ink-muted" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}