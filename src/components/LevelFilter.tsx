import type { CSSProperties } from "react";
import { ListFilter } from "lucide-react";
import {
  dbToNoiseGateAmount,
  noiseGateAmountToThresholdDb,
} from "../audio/constants";

interface LevelFilterProps {
  /** Current gate amount, 0 (off) .. 1 (aggressive). */
  amount: number;
  onAmountChange: (amount: number) => void;
  /** Live smoothed mic input level (dBFS), from the AudioWorklet envelope follower. */
  micLevelDb: number;
}

/**
 * "Sensitivity" (noise gate) slider drawn directly over the live mic level
 * meter. Left = gate off (default), right = aggressive gating; reduces
 * quieter background sources like a TV, independent from Soniox.
 *
 * The level bar uses the gate's own dB scale (`dbToNoiseGateAmount`, the
 * inverse of the slider mapping), so the thumb sits exactly at the
 * threshold: whatever part of the bar stays left of the thumb (hatched)
 * is what the gate mutes. Levels below the gentlest threshold read as 0.
 * The value label shows the real dB threshold so it can be calibrated
 * against a real mic/room.
 */
export default function LevelFilter({
  amount,
  onAmountChange,
  micLevelDb,
}: LevelFilterProps) {
  const isOff = amount <= 0;
  const thresholdDb = noiseGateAmountToThresholdDb(amount);
  const meterStyle = {
    "--p": `${amount * 100}%`,
    "--lvl": `${dbToNoiseGateAmount(micLevelDb) * 100}%`,
  } as CSSProperties;

  return (
    <div className="flex h-12 items-center gap-3 rounded-full bg-glass-strong px-4 text-ink">
      <ListFilter className="size-5.5 flex-none" />
      <div className="ll-meter" style={meterStyle}>
        <span className="ll-meter-level" />
        <input
          type="range"
          className="ll-range focus-ring"
          min={0}
          max={100}
          step={1}
          value={Math.round(amount * 100)}
          onChange={(event) => onAmountChange(Number(event.target.value) / 100)}
          aria-label="Citlivost mikrofonu — potlačení tišších zvuků v okolí"
          aria-valuetext={isOff ? "Vypnuto" : `${Math.round(thresholdDb)} dB`}
        />
      </div>
      <span className="min-w-11.5 text-right text-footnote text-ink-muted tabular-nums">
        {isOff ? "Vyp" : `${Math.round(thresholdDb)} dB`}
      </span>
    </div>
  );
}
