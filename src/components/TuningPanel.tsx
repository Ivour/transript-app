import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "../lib/cn";
import {
  CHUNK_OPTIONS_MS,
  ENDPOINT_DELAY_MAX_MS,
  ENDPOINT_DELAY_MIN_MS,
  type TuningSettings,
} from "../lib/tuning";

interface TuningPanelProps {
  tuning: TuningSettings;
  onChange: (next: TuningSettings) => void;
  /** True while a session is starting/active: settings are baked in at start. */
  locked: boolean;
  /** Native mic sample rate (Hz) while recording, for diagnostics. */
  nativeSampleRate: number | null;
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {label}
          {value && (
            <span className="ml-1.5 font-normal tabular-nums text-slate-500 dark:text-slate-400">
              {value}
            </span>
          )}
        </span>
        {children}
      </div>
      <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        {hint}
      </p>
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
    <div className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-slate-300 dark:ring-slate-600">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-2 py-1 text-[11px] font-medium transition disabled:opacity-50",
            option.value === value
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "bg-transparent text-slate-600 dark:text-slate-300",
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
 * Test-build only control panel for finding the best transcription
 * settings by trying them (see `lib/tuning.ts`). Presentational: owns only
 * its open/closed state; the values live in the page.
 */
export default function TuningPanel({
  tuning,
  onChange,
  locked,
  nativeSampleRate,
}: TuningPanelProps) {
  const [open, setOpen] = useState(false);
  const update = (patch: Partial<TuningSettings>) =>
    onChange({ ...tuning, ...patch });

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

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-red-300 dark:bg-slate-900 dark:ring-red-900">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <SlidersHorizontal className="size-3.5" />
          Ladění (test)
        </span>
        {open ? (
          <ChevronDown className="size-4 text-slate-500" />
        ) : (
          <ChevronUp className="size-4 text-slate-500" />
        )}
      </button>
      <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
        {summary}
      </p>

      {open && (
        <div className="flex max-h-[45dvh] flex-col gap-3.5 overflow-y-auto border-t border-slate-200 pt-3 dark:border-slate-700">
          {locked && (
            <p className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Nastavení jde měnit jen před spuštěním přepisu. Zastav přepis,
              změň, a spusť znovu. Po obnovení stránky se vše vrátí na výchozí.
            </p>
          )}

          <Row
            label="Detekce konce promluvy"
            hint="Soniox sám pozná, že věta skončila, a text rychleji „zčerná“ (stane se finálním). Cena: hůř drží mluvčí, jeden člověk může v další větě dostat nového mluvčího. Vypnuto = pomalejší zčernání, ale lepší rozlišení mluvčích."
          >
            <Switch
              checked={tuning.endpointDetection}
              onCheckedChange={(checked) => update({ endpointDetection: checked })}
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
              className="w-32"
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
              className="w-32"
              aria-label="Citlivost konce věty"
            />
          </Row>

          <Row
            label="Potlačení ozvěny"
            hint="iPhone odfiltruje zvuk, který sám přehrává. Při přepisu rozhovoru ho nepotřebuješ. Zapnuté může změnit zabarvení hlasu a zhoršit rozlišení mluvčích."
          >
            <Switch
              checked={tuning.echoCancellation}
              onCheckedChange={(checked) => update({ echoCancellation: checked })}
              disabled={locked}
            />
          </Row>

          <Row
            label="Potlačení šumu"
            hint="iPhone ztlumí hluk okolí. Pomáhá v hlučné místnosti, ale může potlačit tišší hlasy a slít podobné hlasy dohromady."
          >
            <Switch
              checked={tuning.noiseSuppression}
              onCheckedChange={(checked) => update({ noiseSuppression: checked })}
              disabled={locked}
            />
          </Row>

          <Row
            label="Automatická hlasitost"
            hint="Zesiluje tichý hlas a zeslabuje hlasitý. „Výchozí“ nechá rozhodnutí na iPhonu (obvykle zapnuto). Může způsobit, že hlasitost mezi větami kolísá."
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

          <Row
            label="Velikost kousků zvuku"
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

          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Diagnostika: v každé bublině je u mluvčího malé „id“, tedy označení
            přímo ze Sonioxu. Pokud dva lidé mají stejné id, sloučil je Soniox,
            ne aplikace. Vzorkování mikrofonu (v souhrnu nahoře) je rychlost, jakou
            iPhone mikrofon čte; vestavěný mívá 48 kHz.
          </p>
        </div>
      )}
    </div>
  );
}
