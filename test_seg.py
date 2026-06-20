import fitz, numpy as np
from PIL import Image, ImageOps
from pathlib import Path

doc = fitz.open(r'C:\Users\Ahmed Abdel Samad\Downloads\CamScanner 13-06-2026 18.07.pdf')
page = doc[0]
pixmap = page.get_pixmap(matrix=fitz.Matrix(4.0, 4.0), alpha=False)
img = Image.frombytes('RGB', [pixmap.width, pixmap.height], pixmap.samples)
doc.close()

print(f"Page size: {img.width}x{img.height}")

gray = img.convert('L')
gray = ImageOps.autocontrast(gray, cutoff=1)
arr  = np.array(gray, dtype=np.float32)
H, W = arr.shape

# Darkness scoring on original grayscale — avoids adaptive threshold noise.
# For each pixel darker than INK_LEVEL, accumulate (INK_LEVEL - pixel).
# Real pen strokes are very dark (value 20-80), giving high scores.
# Paper texture is near-white (value 200-240), giving zero score.
INK_LEVEL  = 160
row_dark   = np.maximum(0, INK_LEVEL - arr).sum(axis=1)

p25        = float(np.percentile(row_dark, 25))
p75        = float(np.percentile(row_dark, 75))
# IQR-based robust std estimate — unaffected by extreme outliers (ruled lines)
iqr        = p75 - p25
std_robust = iqr * 0.7413   # = Gaussian sigma from IQR
bg_level   = p25
ink_thresh = bg_level + max(std_robust * 2.0, row_dark.max() * 0.005)
is_text    = row_dark >= ink_thresh

print(f'Row darkness: min={row_dark.min():.0f} max={row_dark.max():.0f} mean={row_dark.mean():.1f}')
print(f'p25={p25:.0f}  p75={p75:.0f}  iqr={iqr:.0f}  std_robust={std_robust:.0f}  thresh={ink_thresh:.1f}')
print(f'Text rows: {is_text.sum()} / {H}')

# Find raw spans
raw_spans, in_line, start = [], False, 0
for i, tr in enumerate(is_text):
    if not in_line and tr:   in_line, start = True, i
    elif in_line and not tr: in_line = False; raw_spans.append((start, i))
if in_line: raw_spans.append((start, H))
print(f'Raw spans: {len(raw_spans)}')

# Merge close spans (broken strokes within same line)
gap_tol = max(5, int(H * 0.003))
print(f'gap_tol={gap_tol}')
merged = []
for span in raw_spans:
    if merged and (span[0] - merged[-1][1]) <= gap_tol:
        merged[-1] = [merged[-1][0], span[1]]
    else:
        merged.append(list(span))

# Filter and pad
MIN_LINE_H = 8
spans = []
for (y0, y1) in merged:
    if (y1 - y0) < MIN_LINE_H: continue
    pad = max(6, (y1 - y0) // 4)
    spans.append((max(0, y0 - pad), min(H, y1 + pad)))

print(f'\nDetected {len(spans)} lines:')
out = Path(r'C:\Users\Ahmed Abdel Samad\Documents\GitHub\Grad_Project\debug_strips')
out.mkdir(exist_ok=True)

rgb = img.convert('RGB')
saved = 0
for idx, (y0, y1) in enumerate(spans):
    strip_h = y1 - y0
    skip = strip_h > H * 0.15
    status = "SKIP" if skip else "OK"
    print(f'  Line {idx:2d}: y={y0:4d}-{y1:4d}  h={strip_h:4d}  {status}')
    if not skip:
        strip = rgb.crop((0, y0, rgb.width, y1))
        strip.save(str(out / f'strip_{idx:03d}.png'))
        saved += 1

print(f'\nSaved {saved} strips to debug_strips/')
