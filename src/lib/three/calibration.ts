// Hero logo calibration (measured 2026-07-13 against sketch-poster.webp, the
// video's final frame). Lets the 3D mesh take over the video at the same
// on-screen size/position so the crossfade is invisible. Spec §7.
export const CALIB = {
  HEIGHT_FRAC: 0.453, // logo bbox height as fraction of frame height
  CENTER_Y: 0.534, // logo center, fraction from top (slightly below middle)
  CENTER_X: 0.5, // horizontally centered
  CAMERA_FOV: 35,
  CAMERA_Z: 2.4,
}

/** Visible world height at the z=0 plane for the calibrated camera. */
export function visibleHeight(distance = CALIB.CAMERA_Z, fovDeg = CALIB.CAMERA_FOV): number {
  return 2 * Math.tan((fovDeg * Math.PI) / 180 / 2) * distance
}
