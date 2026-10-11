import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
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

/** 44px icon button inside a glass header pill (same as AppHeader). */
const headerIconClassName =
  "grid size-11 place-items-center rounded-full text-ink focus-ring disabled:opacity-50";

/** 40px round stepper button (month / page switching). */
const stepButtonClassName =
  "grid size-10 flex-none place-items-center rounded-full bg-glass-strong text-ink focus-ring disabled:opacity-35";

const sectionLabelClassName =
  "text-caption font-semibold uppercase tracking-wider text-ink-muted";

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
    // Same shell as TranscribePage: ambient glow background, floating glass
    // header, content scrolling under its fade (`ll-feed` mask).
    <div className="ll-app fixed inset-0 overflow-hidden text-ink">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-(--safe-top) pb-3">
        <div className="ll-header-fade" />
        <div className="glass flex h-11 items-center gap-1 rounded-full pr-4 pl-0.5">
          <Link
            to="/"
            aria-label="Zpět na přepis"
            title="Zpět na přepis"
            className={headerIconClassName}
          >
            <ArrowLeft className="size-5.5" strokeWidth={2.4} />
          </Link>
          <span className="font-rounded text-title text-ink">
            Využití
          </span>
        </div>
        <div className="glass flex h-11 items-center rounded-full px-0.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading || isRefetching}
            aria-label="Obnovit"
            title="Obnovit"
            className={headerIconClassName}
          >
            <RefreshCw
              className={cn("size-5.5", isRefetching && "animate-spin")}
            />
          </button>
        </div>
      </header>

      <main className="ll-feed h-full overflow-y-auto px-4 pt-[calc(var(--safe-top)+--spacing(22))] pb-[calc(var(--safe-bottom)+--spacing(6))]">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          {/* Period: monthly / all-time switch + month stepper */}
          <section className="glass flex flex-col gap-3 rounded-lg p-4">
            <div
              className="grid grid-cols-2 rounded-full bg-glass-strong p-1"
              role="group"
              aria-label="Období"
            >
              {(
                [
                  ["monthly", "Měsíčně"],
                  ["all-time", "Celkově"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setViewMode(mode);
                    setPage(1);
                  }}
                  aria-pressed={viewMode === mode}
                  className={cn(
                    "h-9 rounded-full text-callout transition-colors",
                    viewMode === mode
                      ? "bg-brand text-on-brand"
                      : "text-ink-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {viewMode === "monthly" && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    handlePrevMonth();
                    setPage(1);
                  }}
                  disabled={isPrevDisabled}
                  aria-label="Předchozí měsíc"
                  className={stepButtonClassName}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <span className="font-rounded text-title font-semibold text-ink">
                  {formatMonthLabel(selectedMonthKey)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleNextMonth();
                    setPage(1);
                  }}
                  disabled={isNextDisabled}
                  aria-label="Následující měsíc"
                  className={stepButtonClassName}
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
            )}
          </section>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-3">
            <section className="glass flex flex-col gap-1 rounded-lg p-4">
              <span className={sectionLabelClassName}>Čas</span>
              <div className="flex items-baseline gap-1">
                <span className="font-rounded text-stat tracking-tight text-ink tabular-nums">
                  {stats.activeMinutes.toFixed(1).replace(".", ",")}
                </span>
                <span className="text-footnote text-ink-muted">min</span>
              </div>
              {viewMode !== "all-time" && sessions.length > 0 && (
                <span className="text-caption text-ink-muted tabular-nums">
                  celkem {stats.totalMinutes.toFixed(1).replace(".", ",")} min
                </span>
              )}
            </section>

            <section className="glass flex flex-col gap-1 rounded-lg p-4">
              <span className={sectionLabelClassName}>Cena (odhad)</span>
              <div className="flex items-baseline gap-1">
                <span className="text-footnote text-ink-muted">$</span>
                <span className="font-rounded text-stat tracking-tight text-ink tabular-nums">
                  {stats.activeCost.toFixed(3)}
                </span>
              </div>
              {viewMode !== "all-time" && sessions.length > 0 && (
                <span className="text-caption text-ink-muted tabular-nums">
                  celkem ${stats.totalCost.toFixed(3)}
                </span>
              )}
            </section>
          </div>

          {isLoading && (
            <div className="flex justify-center py-8">
              <RefreshCw className="size-6 animate-spin text-ink-muted" />
            </div>
          )}

          {error && (
            <div className="glass flex items-center gap-2 rounded-lg p-4 text-callout text-live">
              <AlertCircle className="size-5 shrink-0" />
              <span>
                {(error as Error).message ||
                  "Nepodařilo se načíst statistiky využití."}
              </span>
            </div>
          )}

          {/* Session log */}
          {!isLoading && !error && (
            <section className="flex flex-col gap-2">
              <h2 className="mt-2 flex items-center justify-between px-2">
                <span className={sectionLabelClassName}>Spojení</span>
                <span className="text-footnote text-ink-muted tabular-nums">
                  {filteredSessions.length}
                  {viewMode === "monthly" && ` z ${sessions.length}`}
                </span>
              </h2>

              {filteredSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-hairline py-10 text-center text-callout text-ink-muted">
                  Žádné přepisy v tomto období.
                </div>
              ) : (
                <div className="glass overflow-hidden rounded-lg">
                  <ul className="divide-y divide-hairline">
                    {paginatedSessions.map((session) => (
                      <li
                        key={session.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex flex-col">
                          <span className="text-callout font-semibold text-ink tabular-nums">
                            {formatDuration(session.duration_seconds)}
                          </span>
                          <span className="text-footnote text-ink-muted tabular-nums">
                            {formatDateTime(session.created_at)}
                          </span>
                        </div>
                        <span className="text-callout text-ink-partial tabular-nums">
                          $
                          {session.cost_usd
                            ? Number(session.cost_usd).toFixed(4)
                            : "0.0000"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-hairline px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                        disabled={page === 1}
                        aria-label="Předchozí stránka"
                        className={stepButtonClassName}
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <span className="text-footnote text-ink-muted tabular-nums">
                        Stránka {page} z {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPage((prev) => Math.min(prev + 1, totalPages))
                        }
                        disabled={page === totalPages}
                        aria-label="Následující stránka"
                        className={stepButtonClassName}
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <p className="mt-2 text-center text-caption text-ink-muted">
            {user?.email}
          </p>
        </div>
      </main>
    </div>
  );
}
