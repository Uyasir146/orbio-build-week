#!/usr/bin/env python3
"""Animated demo GIF: terminal typing effect of npm run demo:mock."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "C:/Users/yasir/orbio-build-week/assets/submission"
W, H = 1280, 800
BG = (13, 17, 23)
GREEN = (63, 185, 80)
CYAN = (88, 166, 255)
YELLOW = (210, 153, 29)
RED = (248, 81, 73)
FG = (201, 209, 217)
MUTED = (139, 148, 158)

mono = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 24)
mono_b = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 26)

LINES = [
    ("$ npm run demo:mock", GREEN, True),
    ("SWISS-ARMY WEB WATCHER — Dry Run Demo", CYAN, True),
    ("Mock mode: no API calls, no keys needed", YELLOW, False),
    ("", FG, False),
    ("WATCHERS (3)", FG, True),
    ("● ORBIO Token (onchain) — scans:3 signals:3", GREEN, False),
    ("● Orbio Build Page (url) — scans:2 signals:1", GREEN, False),
    ("● CoinTelegraph RSS (rss) — scans:2 signals:1", GREEN, False),
    ("", FG, False),
    ("RECENT SIGNALS", FG, True),
    ("▲ ORBIO surged 40.3% to $0.02864", RED, False),
    ("  price +40.3%, vol $1.36M, liq $741K", MUTED, False),
    ("■ Builder count rose from 36 to 42", YELLOW, False),
    ("■ 6 new CoinTelegraph articles incl. ORBIO", YELLOW, False),
    ("", FG, False),
    ("BREAKOUT PATTERN DETECTED: ORBIO", GREEN, True),
    ("Signal: momentum accelerating — +40% in 1 day", GREEN, False),
    ("", FG, False),
    ("AUTO-THREAD: 5 tweets drafted + dashboard live :3456", CYAN, False),
    ("DEM0 COMPLETE — try: npm run watch --init", MUTED, False),
]

def render(nlines):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 52], fill=(22, 27, 34))
    for i, c in enumerate([(248, 81, 73), (210, 153, 29), (63, 185, 80)]):
        d.ellipse([20 + i * 28, 18, 34 + i * 28, 32], fill=c)
    d.text((110, 12), "Terminal — npm run demo:mock", font=mono, fill=MUTED)
    y = 80
    for j in range(min(nlines, len(LINES))):
        txt, col, bold = LINES[j]
        d.text((40, y), txt, font=mono_b if bold else mono, fill=col)
        y += 36
    # cursor
    if nlines <= len(LINES):
        d.text((40, y), "█", font=mono, fill=GREEN)
    return img

frames = []
# progressive reveal: 1 line per 400ms
for n in range(1, len(LINES) + 1):
    frames.append(render(n))
# hold final 2s
for _ in range(5):
    frames.append(render(len(LINES)))

frames[0].save(
    f"{OUT}/00-demo.gif", save_all=True, append_images=frames[1:],
    duration=400, loop=0, optimize=True,
)
sz = os.path.getsize(f"{OUT}/00-demo.gif")
print(f"GIF saved: {sz/1024:.0f}KB, {len(frames)} frames, {W}x{H}")
