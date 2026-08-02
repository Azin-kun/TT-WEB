// Hero logo calibration (measured 2026-07-16 against sketch-poster.webp, the
// final frame of the original stitched draw-in + 3D-extrusion video — the
// extruded form, bbox x 747–1170 / y 333–774 of 1920×1080). The video is gone
// (2026-08, replaced by the code-drawn SketchIntro) but these numbers stay the
// single source of truth for logo placement: SketchIntro sizes its SVG from
// them exactly as LogoEngine sizes the mesh, so the crossfade is invisible.
// Spec §7.
export const CALIB = {
  HEIGHT_FRAC: 0.408, // logo bbox height as fraction of frame height
  // HEIGHT_FRAC is height-only — on a narrow portrait phone the logo's WIDTH
  // (height * aspect * viewport h/w) ends up ~100%+ of screen width. This is
  // a separate, easily-tunable knob for <640px viewports only (2026-07-14
  // revision — owner approved the screenshot).
  MOBILE_HEIGHT_FRAC: 0.24,
  CENTER_Y: 0.513, // logo center, fraction from top (slightly below middle)
  CENTER_X: 0.5, // horizontally centered
  CAMERA_FOV: 35,
  CAMERA_Z: 2.4,
}

/** Visible world height at the z=0 plane for the calibrated camera. */
export function visibleHeight(distance = CALIB.CAMERA_Z, fovDeg = CALIB.CAMERA_FOV): number {
  return 2 * Math.tan((fovDeg * Math.PI) / 180 / 2) * distance
}
