import { CALIB } from '../../lib/three/calibration'

/**
 * Placement for the pencil-sketch layers cut out of the original clip.
 *
 * All of them share one crop, so one set of numbers positions the lot. DRAWN is
 * the ink bounding box of the logo inside that crop, measured at an ink
 * threshold high enough to exclude the guide rules that run off past it — it is
 * what gets matched to CALIB so the mesh can take over without a jump.
 *
 * Regenerate the assets with scripts/make-sketch-assets.py; if the crop
 * changes, these change with it.
 */
export const SKETCH = {
  cropW: 781,
  cropH: 621,
  drawn: { x: 77, y: 71, w: 440, h: 420 },
}

const cx = SKETCH.drawn.x + SKETCH.drawn.w / 2
const cy = SKETCH.drawn.y + SKETCH.drawn.h / 2

/**
 * CSS for an anchor element at the logo's centre plus the layer box inside it.
 * `--si-u` is one crop pixel in screen px: the drawn box has to end up
 * HEIGHT_FRAC of the viewport tall, which is the rule LogoEngine scales the
 * mesh by.
 */
export const sketchLayerCss = (anchorSel: string, layerSel: string) => `
  ${anchorSel} {
    position: absolute;
    left: ${CALIB.CENTER_X * 100}%;
    top: ${CALIB.CENTER_Y * 100}%;
    --si-hf: ${CALIB.HEIGHT_FRAC};
    --si-u: calc(var(--si-hf) * 100svh / ${SKETCH.drawn.h});
    width: 0;
    height: 0;
  }
  @media (max-width: 639px) {
    ${anchorSel} { --si-hf: ${CALIB.MOBILE_HEIGHT_FRAC}; }
  }
  ${layerSel} {
    position: absolute;
    /* Tailwind preflight sets img { max-width: 100% }, and the anchor is a
       zero-size positioning origin — without this the layers collapse to
       nothing while still reporting the right height. */
    max-width: none;
    left: calc(${-cx} * var(--si-u));
    top: calc(${-cy} * var(--si-u));
    width: calc(${SKETCH.cropW} * var(--si-u));
    height: calc(${SKETCH.cropH} * var(--si-u));
    /* the layers are frame ÷ paper, so they belong on the sheet as ink */
    mix-blend-mode: multiply;
  }
`
