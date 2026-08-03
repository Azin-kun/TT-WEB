"""
Cuts the hero's pencil artwork out of the original video's own frames.

The video is a photograph of a real graphite drawing, so its frames ARE the
artwork — the construction lines, the doubled strokes where the hand went over
an edge twice and the faint eraser smudges all live in the pixels. Rebuilding
those procedurally would only ever approximate them.

Each layer is stored as a MULTIPLY layer: RGB = frame / clean-paper, so white
means "no graphite here". Composited over the same paper photo with
mix-blend-mode: multiply, paper * ratio reproduces the original frame exactly,
and the reveal animation is just alpha on top of that.

Outputs (to TT-WEB/public/media/):
  paper-hero-full.webp   clean sheet, before a single mark
  sketch-outline.webp    the drawn outline, ~1.9s
  sketch-red.webp        red-pencil areas only, ~3.92s
  sketch-graphite.webp   graphite areas only, ~3.92s
  sketch-guides.webp     construction ticks + smudge, which stay on the sheet
"""

import numpy as np
from PIL import Image

# Frames are extracted from the clip first, e.g.
#   git show 31c4a57:public/media/sketch-draw-16x9.mp4 > /tmp/hero.mp4
#   for t in 0.10 1.90 3.92; do ffmpeg -ss $t -i /tmp/hero.mp4 -frames:v 1 /tmp/src-$t.png; done
# then: python scripts/make-sketch-assets.py <frame-dir>
import sys, os
SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'media')

paper = np.asarray(Image.open(f'{SRC}/src-0.10.png').convert('RGB')).astype(np.float32)
outline = np.asarray(Image.open(f'{SRC}/src-1.90.png').convert('RGB')).astype(np.float32)
final = np.asarray(Image.open(f'{SRC}/src-3.92.png').convert('RGB')).astype(np.float32)
H, W, _ = paper.shape

# The camera is static but exposure drifts across the clip. Rescale the paper
# reference per frame using strips well clear of the mark (it sits ~x700-1260).
def gain(frame):
    m = np.zeros((H, W), bool)
    m[:, :420] = True
    m[:, 1520:] = True
    return np.median(frame[m]) / np.median(paper[m])

def ratio_layer(frame):
    bg = np.clip(paper * gain(frame), 1.0, None)
    return np.clip(frame / bg, 0.0, 1.0)

r_out = ratio_layer(outline)
r_fin = ratio_layer(final)

# Ink density = how far below the paper a pixel sits.
dens_fin = 1.0 - r_fin.min(axis=2)
dens_out = 1.0 - r_out.min(axis=2)

# Split the finished drawing by what the pencil actually was, not by the vector
# paths — the drawing is freehand and does not follow them exactly.
red_ness = r_fin[:, :, 0] - r_fin[:, :, 2]  # red pencil keeps R while B drops
is_ink = dens_fin > 0.12
is_red = is_ink & (red_ness > 0.06)
is_graph = is_ink & ~is_red

print(f'ink px {is_ink.sum():,}  red {is_red.sum():,}  graphite {is_graph.sum():,}')

# Crop to the drawing plus margin, so the layers stay small and share one box.
ys, xs = np.where(dens_fin > 0.18)
pad = 70
x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
print(f'drawn bbox x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}  crop {x1-x0}x{y1-y0}')

def save_ratio(ratio, mask, name, soft=True):
    """White (=no-op under multiply) everywhere the mask is off."""
    out = np.ones_like(ratio)
    if soft:
        # feather the class boundary so the split does not leave hard vector-like
        # edges through the middle of a pencil stroke
        a = mask.astype(np.float32)
        a = np.stack([a, a, a], axis=2)
        out = ratio * a + (1.0 - a)
    else:
        out[mask] = ratio[mask]
    img = Image.fromarray((np.clip(out[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8))
    img.save(f'{DST}/{name}', quality=92, method=6)
    print(f'  {name}  {img.size[0]}x{img.size[1]}')

# The construction lines, guide rules and eraser smudge stay on the sheet for
# the whole clip — they are still visible under the extruded logo at 7.5s. Split
# them out so they can persist past the handoff instead of fading with the mark.
# "The mark" = strongly inked pixels, dilated, so its own outline goes with it.
from PIL import ImageFilter  # noqa: E402

def dilate(mask, size):
    im = Image.fromarray((mask * 255).astype(np.uint8), 'L')
    return np.asarray(im.filter(ImageFilter.MaxFilter(size))) > 127

mark_core = dens_fin > 0.30
mark_area = dilate(mark_core, 13)
is_guide = (dens_fin > 0.05) & ~mark_area
print(f'mark area px {mark_area.sum():,}  guide ink {is_guide.sum():,}')

save_ratio(r_fin, is_red & mark_area, 'sketch-red.webp')
save_ratio(r_fin, is_graph & mark_area, 'sketch-graphite.webp')
save_ratio(r_out, (dens_out > 0.06) & mark_area, 'sketch-outline.webp')
save_ratio(r_fin, is_guide, 'sketch-guides.webp')

# Clean sheet for the hero background — full frame, it has to tile the viewport.
Image.fromarray(paper.astype(np.uint8)).save(f'{DST}/paper-hero-full.webp', quality=88, method=6)
print('  paper-hero-full.webp  %dx%d' % (W, H))

# Record the crop so the component can place the layers against CALIB.
print('CROP', {'x0': int(x0), 'y0': int(y0), 'x1': int(x1), 'y1': int(y1),
               'inkX0': int(xs.min()), 'inkY0': int(ys.min()),
               'inkX1': int(xs.max()), 'inkY1': int(ys.max()),
               'frameW': W, 'frameH': H})
