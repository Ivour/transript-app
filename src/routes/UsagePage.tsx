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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-border bg-tape px-4 py-3 text-tape-foreground">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zpět na nahrávání"
              className="text-tape-foreground hover:bg-tape-foreground/10 hover:text-tape-foreground"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <span className="font-display text-sm font-bold tracking-widest uppercase">
            Počitadlo
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={isLoading || isRefetching}
          aria-label="Obnovit"
          className="text-tape-foreground hover:bg-tape-foreground/10 hover:text-tape-foreground"
        >
          <RefreshCw className={cn("size-4", isRefetching && "animate-spin")} />
        </Button>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 p-4 pb-20">
        {/* User Info Bar */}
        <div className="text-center font-display text-xs tracking-wide text-muted-foreground">
          Uživatel: <span className="font-bold text-foreground">{user?.email}</span>
        </div>

        {/* Dynamic Month Selector / Tab Selector switcher */}
        <div className="space-y-3 rounded-lg border-2 border-border bg-card p-4 shadow-hard-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-display text-xs font-bold tracking-widest text-muted-foreground uppercase">
              <Calendar className="size-4" />
              Období
            </span>
            <div className="flex gap-1 rounded-sm border-2 border-border bg-muted p-0.5">
              <button
                onClick={() => setViewMode("monthly")}
                className={cn(
                  "cursor-pointer rounded-sm px-2.5 py-1 font-display text-xs font-bold tracking-wide uppercase transition-all",
                  viewMode === "monthly"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Měsíční
              </button>
              <button
                onClick={() => setViewMode("all-time")}
                className={cn(
                  "cursor-pointer rounded-sm px-2.5 py-1 font-display text-xs font-bold tracking-wide uppercase transition-all",
                  viewMode === "all-time"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Celkově
              </button>
            </div>
          </div>

          {/* Interactive chevron Month Switcher se šipkami under Monthly Mode */}
          {viewMode === "monthly" && (
            <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-3">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handlePrevMonth}
                disabled={isPrevDisabled}
                aria-label="Předchozí měsíc"
              >
                <ChevronLeft className="size-4" />
              </Button>
              
              <span className="min-w-[140px] text-center font-display text-sm font-bold tracking-tight">
                {formatMonthLabel(selectedMonthKey)}
              </span>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleNextMonth}
                disabled={isNextDisabled}
                aria-label="Následující měsíc"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Totals Widgets cards — digital LED-counter style */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col justify-between rounded-lg border-2 border-border bg-tape p-4 shadow-hard-sm">
            <span className="font-display text-xs font-bold tracking-widest text-tape-foreground/60 uppercase">
              {viewMode === "all-time" ? "Celkový čas" : "Čas v období"}
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl font-bold tracking-tight text-tape-foreground">
                {stats.activeMinutes.toFixed(1)}
              </span>
              <span className="text-xs font-medium text-tape-foreground/60">minuty</span>
            </div>
            {viewMode !== "all-time" && sessions.length > 0 && (
              <span className="mt-1 text-[10px] text-tape-foreground/50">Celkově: {stats.totalMinutes.toFixed(1)} min</span>
            )}
          </div>

          <div className="flex flex-col justify-between rounded-lg border-2 border-border bg-tape p-4 shadow-hard-sm">
            <span className="font-display text-xs font-bold tracking-widest text-tape-foreground/60 uppercase">
              {viewMode === "all-time" ? "Celková cena" : "Cena v období"}
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xs font-medium text-tape-foreground/60">$</span>
              <span className="font-display text-2xl font-bold tracking-tight text-tape-foreground">
                {stats.activeCost.toFixed(4)}
              </span>
              <span className="text-xs font-medium text-tape-foreground/60">USD</span>
            </div>
            {viewMode !== "all-time" && sessions.length > 0 && (
              <span className="mt-1 text-[10px] text-tape-foreground/50">Celkově: ${stats.totalCost.toFixed(4)}</span>
            )}
          </div>
        </div>

        {/* Loading and Error States */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-sm border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{(error as Error).message || "Nepodařilo se načíst statistiky využití."}</span>
          </div>
        )}

        {/* Usage Logs section */}
        {!isLoading && !error && (
          <div className="space-y-3">
            <h2 className="flex items-center gap-1.5 px-1 font-display text-sm font-bold tracking-wide text-foreground uppercase">
              <BarChart2 className="size-4" />
              <span>
                {viewMode === "all-time" ? "Celá historie spojení" : "Historie spojení v období"}
              </span>
              <span className="ml-auto rounded-sm border border-border bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {filteredSessions.length} / {sessions.length}
              </span>
            </h2>

            {filteredSessions.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-border bg-card py-10 text-center">
                <p className="text-sm text-muted-foreground">Dosud nebyly zaznamenány žádné přepisy.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border-2 border-border bg-card shadow-hard-sm">
                <div className="divide-y-2 divide-border">
                  {paginatedSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3.5 transition-colors hover:bg-muted"
                    >
                      <div className="space-y-0.5">
                        <p className="font-display text-xs font-medium text-muted-foreground">
                          {formatDateTime(session.created_at)}
                        </p>
                        <p className="text-sm font-semibold text-card-foreground">
                          {formatDuration(session.duration_seconds)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-display text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Cena:
                        </span>
                        <p className="text-sm font-semibold text-card-foreground">
                          ${session.cost_usd ? Number(session.cost_usd).toFixed(5) : "0.00000"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t-2 border-border px-3.5 py-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPage((prev: number) => Math.max(prev - 1, 1))}
                      disabled={page === 1}
                      aria-label="Předchozí stránka"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>

                    <span className="font-display text-sm font-bold tracking-tight">
                      Stránka {page} z {totalPages}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPage((prev: number) => Math.min(prev + 1, totalPages))}
                      disabled={page === totalPages}
                      aria-label="Následující stránka"
                    >
                      <ChevronRight className="size-4" />
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
