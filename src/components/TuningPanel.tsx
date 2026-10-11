import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "../lib/cn";
import {
  CHUNK_OPTIONS_MS,
  ENDPOINT_DELAY_MAX_MS,
  ENDPOINT_DELAY_MIN_MS,
  DEFAULT_TUNING,
  type TuningSettings,
} from "../lib/tuning";
import type { LatencySnapshot, LatencySummary } from "../lib/latencyStats";

interface TuningPanelProps {
  tuning: TuningSettings;
  onChange: (next: TuningSettings) => void;
  /** True while a session is starting/active: settings are baked in at start. */
  locked: boolean;
  /** Native mic sample rate (Hz) while recording, for diagnostics. */
  nativeSampleRate: number | null;
  /** Measured delays of the current/last session, see `lib/latencyStats.ts`. */
  latency: LatencySnapshot | null;
}

/** 380 -> "380 ms", 2400 -> "2,4 s". */
function formatMs(ms: number) {
  return ms < 1000
    ? `${Math.round(ms)} ms`
    : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function formatDetail(summary: LatencySummary | null) {
  return summary
    ? `p90 ${formatMs(summary.p90)} · n ${summary.count}`
    : "zatím bez měření";
}

function Row({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value?: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-footnote font-semibold text-ink">
          {label}
          {value && (
            <span className="ml-1.5 font-normal tabular-nums text-ink-muted">
              {value}
            </span>
          )}
        </span>
        {children}
      </div>
      <p className="text-caption text-ink-muted">{hint}</p>
    </div>
  );
}

/** Titled group of rows (iOS-settings style inset list). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-3.5 text-caption font-semibold tracking-wider text-ink-muted uppercase">
        {title}
      </h3>
      <div className="divide-y divide-hairline rounded-sm bg-glass-strong">
        {children}
      </div>
    </section>
  );
}

/** One number of the always-visible metrics strip. */
function Metric({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center leading-none">
      <span
        className={cn(
          "text-callout font-semibold tabular-nums",
          warn ? "text-warn-ink" : "text-ink",
        )}
      >
        {value}
      </span>
      <span className="mt-1 truncate text-caption2 text-ink-muted">{label}</span>
    </div>
  );
}

/** Bigger tile with the detail line, for the open panel. */
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm bg-glass-strong px-3.5 py-2.5">
      <span className="text-caption text-ink-muted">{label}</span>
      <span className="font-rounded text-title text-ink tabular-nums">
        {value}
      </span>
      <span className="text-caption2 text-ink-muted tabular-nums">{detail}</span>
    </div>
  );
}

function Choice<T extends string | number | boolean | null>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex shrink-0 rounded-full bg-glass-strong p-0.5 ring-1 ring-hairline">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-2.5 py-1 text-caption font-semibold transition-colors disabled:opacity-50",
            option.value === value
              ? "bg-brand text-on-brand"
              : "bg-transparent text-ink-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function onOff(value: boolean | null) {
  return value === null ? "výchozí" : value ? "zap" : "vyp";
}

/**
 * Control panel (all builds for now) for finding the best transcription
 * settings by trying them (see `lib/tuning.ts`). Presentational: owns only
 * its open/closed state; the values live in the page.
 *
 * Closed it is a single dock row: the toggle button plus the three numbers
 * that matter while testing (word -> text, word -> final, stalls), so they
 * stay visible during a session. Open, the details and settings expand
 * ABOVE that row (the dock is bottom-anchored and grows upwards), so the
 * toggle doesn't move under the finger.
 */
export default function TuningPanel({
  tuning,
  onChange,
  locked,
  nativeSampleRate,
  latency,
}: TuningPanelProps) {
  const [open, setOpen] = useState(false);
  const update = (patch: Partial<TuningSettings>) =>
    onChange({ ...tuning, ...patch });

  const isModified = (Object.keys(DEFAULT_TUNING) as (keyof TuningSettings)[])
    .some((key) => tuning[key] !== DEFAULT_TUNING[key]);

  const summary = [
    `konec promluvy ${tuning.endpointDetection ? "zap" : "vyp"}`,
    `ozvěna ${onOff(tuning.echoCancellation)}`,
    `šum ${onOff(tuning.noiseSuppression)}`,
    `hlasitost ${onOff(tuning.autoGainControl)}`,
    `chunk ${tuning.chunkMs} ms`,
    nativeSampleRate !== null ? `mikrofon ${nativeSampleRate / 1000} kHz` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const wordToText = latency?.wordToTextMs ?? null;
  const wordToFinal = latency?.wordToFinalMs ?? null;
  const stalls = latency?.stalls ?? null;

  return (
    <div className="flex w-full flex-col gap-2.5">
      {open && (
        <div className="flex max-h-[52dvh] flex-col gap-4 overflow-y-auto rounded-(--dock-inner-radius) bg-glass-strong p-3 scrollbar-none">
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <Stat
                label="slovo → text"
                value={wordToText ? formatMs(wordToText.median) : "–"}
                detail={formatDetail(wordToText)}
              />
              <Stat
                label="slovo → finál"
                value={wordToFinal ? formatMs(wordToFinal.median) : "–"}
                detail={formatDetail(wordToFinal)}
              />
              <Stat
                label="spojení"
                value={
                  latency?.connectMs != null ? formatMs(latency.connectMs) : "–"
                }
                detail={`Soniox zaostává ${
                  latency?.serverLagMs != null
                    ? formatMs(latency.serverLagMs)
                    : "–"
                }`}
              />
              <Stat
                label="záseky"
                value={stalls !== null ? String(stalls) : "–"}
                detail={`nejdelší mezera ${
                  latency ? formatMs(latency.maxChunkGapMs) : "–"
                }`}
              />
            </div>
            <p className="px-1 text-caption2 text-ink-muted">
              {summary}
            </p>
          </div>

          {locked && (
            <p className="rounded-sm bg-warn/15 px-3.5 py-2.5 text-caption text-warn-ink">
              Nastavení jde měnit jen před spuštěním přepisu. Zastav přepis,
              změň, a spusť znovu. Po obnovení stránky se vše vrátí na výchozí.
            </p>
          )}

          <Section title="Konec promluvy (Soniox)">
            <Row
              label="Detekce konce promluvy"
              hint="Soniox sám pozná, že věta skončila, a text rychleji „zčerná“ (stane se finálním). Cena: hůř drží mluvčí, jeden člověk může v další větě dostat nového mluvčího. Vypnuto = pomalejší zčernání, ale lepší rozlišení mluvčích."
            >
              <Switch
                checked={tuning.endpointDetection}
                onCheckedChange={(checked) =>
                  update({ endpointDetection: checked })
                }
                disabled={locked}
              />
            </Row>

            <Row
              label="Čekání na konec věty"
              value={`${tuning.endpointDelayMs} ms`}
              hint="Jak dlouho po konci řeči Soniox čeká, než větu uzavře. Menší = rychlejší zčernání, ale věta se může uzavřít uprostřed (při nádechu, odmlce). Platí jen při zapnuté detekci."
            >
              <Slider
                value={[tuning.endpointDelayMs]}
                min={ENDPOINT_DELAY_MIN_MS}
                max={ENDPOINT_DELAY_MAX_MS}
                step={250}
                disabled={locked || !tuning.endpointDetection}
                onValueChange={(next) => {
                  const value = Array.isArray(next) ? next[0] : next;
                  update({ endpointDelayMs: value });
                }}
                className="w-28"
                aria-label="Čekání na konec věty (ms)"
              />
            </Row>

            <Row
              label="Citlivost konce věty"
              value={tuning.endpointSensitivity.toFixed(1)}
              hint="Záporná = Soniox věty uzavírá nerad (pomalejší, přesnější). Kladná = uzavírá ochotně (rychlejší, víc chyb v rozdělení věty a mluvčích). Platí jen při zapnuté detekci."
            >
              <Slider
                value={[tuning.endpointSensitivity * 10]}
                min={-10}
                max={10}
                step={1}
                disabled={locked || !tuning.endpointDetection}
                onValueChange={(next) => {
                  const value = Array.isArray(next) ? next[0] : next;
                  update({ endpointSensitivity: value / 10 });
                }}
                className="w-28"
                aria-label="Citlivost konce věty"
              />
            </Row>
          </Section>

          <Section title="Mikrofon (iPhone)">
            <Row
              label="Potlačení ozvěny"
              hint="iPhone odfiltruje zvuk, který sám přehrává. Při přepisu rozhovoru ho nepotřebuješ. Zapnuté může změnit zabarvení hlasu a zhoršit rozlišení mluvčích."
            >
              <Switch
                checked={tuning.echoCancellation}
                onCheckedChange={(checked) =>
                  update({ echoCancellation: checked })
                }
                disabled={locked}
              />
            </Row>

            <Row
              label="Potlačení šumu"
              hint="iPhone ztlumí hluk okolí. Pomáhá v hlučné místnosti, ale může potlačit tišší hlasy a slít podobné hlasy dohromady."
            >
              <Switch
                checked={tuning.noiseSuppression}
                onCheckedChange={(checked) =>
                  update({ noiseSuppression: checked })
                }
                disabled={locked}
              />
            </Row>

            <Row
              label="Automatická hlasitost"
              hint="Zesiluje tichý hlas a zeslabuje hlasitý. Standardně vypnuto: v pauzách by zesílila hluk a lidi od vedlejšího stolu. „Výchozí“ nechá rozhodnutí na iPhonu (obvykle zapnuto)."
            >
              <Choice
                options={[
                  { value: null, label: "výchozí" },
                  { value: false, label: "vyp" },
                  { value: true, label: "zap" },
                ]}
                value={tuning.autoGainControl}
                onChange={(next) => update({ autoGainControl: next })}
                disabled={locked}
              />
            </Row>
          </Section>

          <Section title="Přenos">
            <Row
              label="Velikost kousků zvuku"
              value="ms"
              hint="Po kolika milisekundách se zvuk posílá do Sonioxu. Menší = text se objeví o chvilku dřív, ale víc přenosů (víc baterie a dat). Větší = méně přenosů, text o chvilku později."
            >
              <Choice
                options={CHUNK_OPTIONS_MS.map((ms) => ({
                  value: ms as number,
                  label: `${ms}`,
                }))}
                value={tuning.chunkMs}
                onChange={(next) => update({ chunkMs: next })}
                disabled={locked}
              />
            </Row>
          </Section>

          <div className="flex flex-col gap-2 px-1 text-caption text-ink-muted">
            <p>
              Diagnostika: v každé bublině je u mluvčího malé „id“, tedy
              označení přímo ze Sonioxu. Pokud dva lidé mají stejné id, sloučil
              je Soniox, ne aplikace. Vzorkování mikrofonu (v souhrnu nahoře) je
              rychlost, jakou iPhone mikrofon čte; vestavěný mívá 48 kHz.
            </p>
            <p>
              Zpoždění (medián z posledních 40 měření; p90 = tak špatné je
              každé desáté): „slovo → text“ je čas od vyslovení slova po jeho
              první zobrazení, „slovo → finál“ po zčernání. „Soniox zaostává“
              je kolik zvuku ještě nezpracoval (velké číslo = problém sítě, ne
              modelu). „Záseky“ jsou chvíle, kdy se zvuk z mikrofonu zdržel v
              aplikaci. „Spojení“ je čas od tapu na Start po navázání spojení.
              Čísla zůstávají po Stopu.
            </p>
          </div>
        </div>
      )}

      <div className="flex h-12 items-center gap-1 rounded-full bg-glass-strong p-1 pr-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={open ? "Zavřít ladění" : "Otevřít ladění"}
          className={cn(
            "relative grid size-10 flex-none place-items-center rounded-full transition-colors focus-ring",
            open ? "bg-live text-on-live" : "bg-live/15 text-live",
          )}
        >
          {open ? (
            <X className="size-5" />
          ) : (
            <SlidersHorizontal className="size-5" />
          )}
          {/* Settings differ from the defaults: easy to forget between
              measurements. */}
          {isModified && !open && (
            <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-warn ring-2 ring-surface-solid" />
          )}
        </button>
        <Metric
          label="slovo → text"
          value={wordToText ? formatMs(wordToText.median) : "–"}
        />
        <span className="h-6 w-px bg-hairline" />
        <Metric
          label="slovo → finál"
          value={wordToFinal ? formatMs(wordToFinal.median) : "–"}
        />
        <span className="h-6 w-px bg-hairline" />
        <Metric
          label="záseky"
          value={stalls !== null ? String(stalls) : "–"}
          warn={stalls !== null && stalls > 0}
        />
      </div>
    </div>
  );
}
