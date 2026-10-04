#!/usr/bin/env python3
"""SWATCH logo: 3 variants — radar-eye mark + wordmark, dark/light/icon."""
from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = "C:/Users/yasir/orbio-build-week/assets/brand"
os.makedirs(OUT, exist_ok=True)

ACC = (22, 163, 74)       # swatch green
DARK = (13, 17, 23)
LIGHT = (255, 255, 255)
MUT_D = (139, 148, 158)
MUT_L = (107, 114, 128)

sans_b = "C:/Windows/Fonts/segoeuib.ttf" if os.path.exists("C:/Windows/Fonts/segoeuib.ttf") else "C:/Windows/Fonts/segoeui.ttf"
sans = "C:/Windows/Fonts/segoeui.ttf"

def radar_mark(size, bg, ring=(48, 54, 61)):
    """Radar-eye: concentric rings + sweep + center dot."""
    S = size
    img = Image.new("RGB", (S, S), bg)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = S // 2
    R = S * 0.42
    # rings
    for f, w in [(1.0, 3), (0.68, 2), (0.38, 2)]:
        r = R * f
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ring, width=max(2, int(S / 170 * w)))
    # crosshair ticks
    for ang in (0, 90, 180, 270):
        a = math.radians(ang)
        x1, y1 = cx + math.cos(a) * R * 1.02, cy + math.sin(a) * R * 1.02
        x2, y2 = cx + math.cos(a) * R * 1.12, cy + math.sin(a) * R * 1.12
        d.line([x1, y1, x2, y2], fill=ring, width=max(2, int(S / 200)))
    # sweep (45° wedge, translucent green)
    d.pieslice([cx - R, cy - R, cx + R, cy + R], start=-90, end=-45, fill=ACC + (90,))
    d.line([cx, cy, cx + R * math.cos(math.radians(-45)), cy + R * math.sin(math.radians(-45))],
           fill=ACC, width=max(3, int(S / 130)))
    # blips
    for ang, frac in [(200, 0.8), (140, 0.52), (250, 0.3)]:
        a = math.radians(ang)
        bx, by = cx + math.cos(a) * R * frac, cy + math.sin(a) * R * frac
        br = max(3, int(S / 90))
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=ACC)
    # center dot
    cr = max(6, int(S / 45))
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=ACC)
    d.ellipse([cx - cr // 2, cy - cr // 2, cx + cr // 2, cy + cr // 2], fill=bg)
    return img

def lockup(mark_size, bg, fg_name, fg_sub, pad=48, gap=28):
    mark = radar_mark(mark_size, bg)
    f_main = ImageFont.truetype(sans_b, int(mark_size * 0.42))
    f_sub = ImageFont.truetype(sans, int(mark_size * 0.16))
    # measure
    tmp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    w1 = tmp.textlength("swatch", font=f_main)
    w2 = tmp.textlength("swiss-army watcher", font=f_sub)
    tw = int(max(w1, w2))
    W = pad * 2 + mark_size + gap + tw + 20
    H = mark_size + pad * 2
    img = Image.new("RGB", (W, H), bg)
    img.paste(mark, (pad, pad))
    d = ImageDraw.Draw(img)
    tx = pad + mark_size + gap
    ty = pad + int(mark_size * 0.14)
    d.text((tx, ty), "swatch", font=f_main, fill=fg_name)
    # green dot on the A? keep simple: underline accent bar
    d.rectangle([tx, ty + int(mark_size * 0.46), tx + int(mark_size * 0.5), ty + int(mark_size * 0.46) + 5], fill=ACC)
    d.text((tx, ty + int(mark_size * 0.56)), "swiss-army watcher", font=f_sub, fill=fg_sub)
    return img

# 1. icon dark (launchpad image, 512)
radar_mark(512, DARK).save(f"{OUT}/swatch-icon-dark-512.png")
# 2. icon light
radar_mark(512, LIGHT, ring=(209, 213, 219)).save(f"{OUT}/swatch-icon-light-512.png")
# 3. lockup dark (README / site header)
lockup(300, DARK, LIGHT, MUT_D).save(f"{OUT}/swatch-logo-dark.png")
# 4. lockup light
lockup(300, LIGHT, DARK, MUT_L).save(f"{OUT}/swatch-logo-light.png")
# 5. favicon-ish small icon
radar_mark(64, DARK).save(f"{OUT}/swatch-icon-64.png")

print(sorted(os.listdir(OUT)))
for f in sorted(os.listdir(OUT)):
    im = Image.open(f"{OUT}/{f}")
    print(f, im.size, os.path.getsize(f"{OUT}/{f}") // 1024, "KB")
