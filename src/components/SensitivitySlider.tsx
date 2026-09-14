import { Slider } from "@/components/ui/slider";
import {
  dbToMeterPercent,
  noiseGateAmountToThresholdDb,
} from "../audio/constants";

interface SensitivitySliderProps {
  /** Current gate amount, 0 (off) .. 1 (aggressive). */
  amount: number;
  onAmountChange: (amount: number) => void;
  /** Live smoothed mic input level (dBFS), from the AudioWorklet envelope follower. */
  micLevelDb: number;
}

/**
 * Compact "sensitivity" control, placed in the footer next to the record
 * button on mobile (see .clinerules — this reduces audio picked up from
 * quieter background sources like a TV, independent from Soniox/
 * diarization). Left = gate off (today's default behavior), right =
 * aggressive gating.
 *
 * Shows a live mic-level meter (with a marker for the currently selected
 * threshold) above the slider, plus the actual dB threshold value (not
 * just a raw percentage) next to it, so the value is meaningful and the
 * user can calibrate it against their real mic/environment.
 */
export default function SensitivitySlider({
  amount,
  onAmountChange,
  micLevelDb,
}: SensitivitySliderProps) {
  const isOff = amount <= 0;
  const thresholdDb = noiseGateAmountToThresholdDb(amount);
  const levelPercent = dbToMeterPercent(micLevelDb);
  const thresholdPercent = isOff ? null : dbToMeterPercent(thresholdDb);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {/* Live mic level meter, with a marker showing the current gate threshold. */}
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
          style={{ width: `${levelPercent}%` }}
        />
        {thresholdPercent !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-rose-500"
            style={{ left: `${thresholdPercent}%` }}
          />
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Slider
          value={[amount * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={(next) => {
            const value = Array.isArray(next) ? next[0] : next;
            onAmountChange(value / 100);
          }}
          className="flex-1"
          aria-label="Citlivost mikrofonu — potlačení tišších zvuků v okolí"
        />
        <span className="w-9 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {isOff ? "Vyp" : `${Math.round(thresholdDb)}dB`}
        </span>
      </div>
    </div>
  );
}
