export type AudioCaptureStatus =
  | "idle"
  | "starting"
  | "recording"
  | "suspended"
  | "error";

export interface AudioCaptureError {
  message: string;
  /** True when caused by the user denying mic permission. */
  isPermissionDenied: boolean;
}
