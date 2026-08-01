import { Slider } from "@/components/ui/slider";
import {
  dbToMeterPercent,
  noiseGateAmountToThresholdDb,
} from "../audio/constants";
import { cn } from "../lib/cn";

interface SensitivitySliderProps {
  /** Current gate amount, 0 (off) .. 1 (aggressive). */
  amount: number;
  onAmountChange: (amount: number) => void;
  /** Live smoothed mic input level (dBFS), from the AudioWorklet envelope follower. */
  micLevelDb: number;
}

const METER_SEGMENT_COUNT = 12;

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
 *
 * Rendered as a discrete-segment VU meter (vintage tape-deck style) rather
 * than a smooth gradient bar.
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
  const litSegments = Math.round((levelPercent / 100) * METER_SEGMENT_COUNT);
  const thresholdSegment =
    thresholdPercent !== null
      ? Math.round((thresholdPercent / 100) * METER_SEGMENT_COUNT)
      : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {/* Live mic level meter: discrete VU segments, red marker at gate threshold. */}
      <div className="flex h-2 w-full items-center gap-0.5">
        {Array.from({ length: METER_SEGMENT_COUNT }, (_, i) => {
          const isLit = i < litSegments;
          const isHot = i >= METER_SEGMENT_COUNT - 3;
          const isThresholdMarker = thresholdSegment === i;
          return (
            <div
              key={i}
              className={cn(
                "relative h-full flex-1 rounded-[1px] border border-border/60",
                isLit
                  ? isHot
                    ? "bg-rec"
                    : "bg-[oklch(0.55_0.1_130)]"
                  : "bg-muted",
              )}
            >
              {isThresholdMarker && (
                <div className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-rec" />
              )}
            </div>
          );
        })}
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
        <span className="w-9 shrink-0 text-right font-display text-[10px] font-bold tabular-nums text-muted-foreground">
          {isOff ? "VYP" : `${Math.round(thresholdDb)}dB`}
        </span>
      </div>
    </div>
  );
}
