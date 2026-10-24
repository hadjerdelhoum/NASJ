#!/usr/bin/env python3
"""
Stage 2 of the asset pipeline: cuts the sharper, higher-quality sheets in assets/reference/hires/
and OVERRIDES the blurrier crops made from the original boards (build_assets.py runs this last).

Sheets (flat light-blue background):
  A  logo + family busts + landscape collage (forest / inventors / letters complete;
     numbers / stories are cut off by the sheet edge, so those two keep the board crops)
  B  six outfits + family full-body
  C  yarn balls + classic mascot + nine expression busts
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_assets import ROOT, cutout, save_rgba  # noqa: E402

HI = os.path.join(ROOT, "assets", "reference", "hires")
SHEETS = {
    "A": "sheet-A-logo-family-worlds.png",
    "B": "sheet-B-variants-family.png",
    "C": "sheet-C-yarn-expressions.png",
}


def load(k):
    return cv2.cvtColor(cv2.imread(os.path.join(HI, SHEETS[k])), cv2.COLOR_BGR2RGB)


def pad(b, p=6, size=None):
    x, y, w, h = b
    x0, y0, x1, y1 = max(0, x - p), max(0, y - p), x + w + p, y + h + p
    if size:
        x1, y1 = min(size[1], x1), min(size[0], y1)
    return (x0, y0, x1, y1)


# boxes (x, y, w, h) found by connected-component detection on each sheet
A_BALL_LOGO, A_ARABIC, A_NASJ_TXT = (2, 12, 176, 166), (186, 52, 250, 108), (321, 129, 116, 53)
A_PAPA = (706, 185, 191, 255)
B_BOX = {
    "adventure": (8, 0, 256, 425), "classic": (325, 16, 273, 407), "creative": (644, 19, 273, 407),
    "explorer": (944, 22, 282, 410), "sporty": (1261, 16, 248, 415), "winter": (1598, 12, 240, 416),
    "brother": (17, 442, 249, 379), "maman": (344, 441, 259, 392), "nasj": (686, 431, 251, 403),
    "reading": (1047, 459, 265, 375), "sister": (1428, 449, 272, 378),
}
C_BALLS = [(3, 19, 276, 281), (286, 17, 281, 284), (575, 19, 273, 280)]
C_MASCOT = (860, 1, 204, 358)
# expression name -> box on sheet C (chosen by what each face shows)
C_EXPR = {
    "focused": (1153, 26, 257, 256),      # wink, raised fist
    "curious": (1420, 29, 248, 254),      # light bulb
    "encouraging": (0, 358, 238, 260),    # heart + wave
    "thinking": (298, 369, 242, 248),     # eyes closed, hands on cheeks
    "happy": (575, 365, 250, 254),        # open smile, hands on cheeks
    "oops": (853, 370, 220, 251),         # wink + heart ("disappointed but positive")
    "sleepy": (1144, 360, 249, 246),      # on the pillow
    "celebrating": (1423, 365, 249, 255), # star
    "surprised": (3, 647, 241, 248),      # cheering with sparkles
}

LANDSCAPES = {  # name -> (x0, y0, x1, y1) on sheet A
    "forest": (0, 447, 597, 726),
    "letters": (1168, 447, 1774, 714),
    "inventors": (602, 447, 1160, 792),
}


def remove_seam(img, y0, y1):
    """Paint out the thin white panel border that runs through the lower part of a tile."""
    sub = img[y0:y1]
    mask = (sub.min(axis=2) > 236).astype(np.uint8)
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    full = np.zeros(img.shape[:2], np.uint8)
    full[y0:y1] = mask
    return cv2.inpaint(img, full, 4, cv2.INPAINT_TELEA)


def run(out):
    if not all(os.path.exists(os.path.join(HI, f)) for f in SHEETS.values()):
        print("hires sheets not found: keeping board crops")
        return
    A, B, C = load("A"), load("B"), load("C")

    # --- logos
    ux0 = A_BALL_LOGO[0]
    ux1 = A_ARABIC[0] + A_ARABIC[2]
    uy0 = min(A_BALL_LOGO[1], A_ARABIC[1])
    uy1 = max(A_BALL_LOGO[1] + A_BALL_LOGO[3], A_NASJ_TXT[1] + A_NASJ_TXT[3])
    horiz = cutout(A, (max(0, ux0 - 6), max(0, uy0 - 6), ux1 + 6, uy1 + 6), keep_all=True, min_comp=0.0002)
    save_rgba(horiz, os.path.join(out, "logo", "logo-horizontal.png"), scale=1)

    ball = cutout(C, pad(C_BALLS[0], 6, C.shape), keep_all=False)
    save_rgba(ball, os.path.join(out, "logo", "yarn-ball.png"), scale=1)

    # stacked logo: ball above the Arabic + Latin wordmark
    wx0, wy0 = A_ARABIC[0], A_ARABIC[1]
    wx1 = max(A_ARABIC[0] + A_ARABIC[2], A_NASJ_TXT[0] + A_NASJ_TXT[2])
    wy1 = A_NASJ_TXT[1] + A_NASJ_TXT[3]
    word = cutout(A, (wx0 - 6, wy0 - 6, wx1 + 6, wy1 + 6), keep_all=True, min_comp=0.0002)
    wim = Image.fromarray(word, "RGBA")
    bim = Image.fromarray(ball, "RGBA")
    bw = int(wim.width * 0.66)
    bim = bim.resize((bw, int(bim.height * bw / bim.width)), Image.LANCZOS)
    wim = wim.resize((int(wim.width * 1.4), int(wim.height * 1.4)), Image.LANCZOS)
    bw = int(wim.width * 0.62)
    bim = bim.resize((bw, int(bim.height * bw / bim.width)), Image.LANCZOS)
    gap = 14
    canvas = Image.new("RGBA", (wim.width + 20, bim.height + gap + wim.height + 8), (0, 0, 0, 0))
    canvas.alpha_composite(bim, ((canvas.width - bim.width) // 2, 0))
    canvas.alpha_composite(wim, ((canvas.width - wim.width) // 2, bim.height + gap))
    os.makedirs(os.path.join(out, "logo"), exist_ok=True)
    canvas.save(os.path.join(out, "logo", "logo-stacked.png"), optimize=True)

    # --- mascot
    save_rgba(cutout(C, pad(C_MASCOT, 6, C.shape)), os.path.join(out, "mascot", "classic.png"), scale=1)
    for name, b in C_EXPR.items():
        save_rgba(cutout(C, pad(b, 5, C.shape), keep_all=True), os.path.join(out, "mascot", f"expr-{name}.png"), scale=1)

    # --- outfits + family
    for name in ("adventure", "classic", "creative", "explorer", "sporty", "winter", "reading"):
        save_rgba(cutout(B, pad(B_BOX[name], 5, B.shape), keep_all=True), os.path.join(out, "mascot", f"variant-{name}.png"), scale=1)
    for name in ("brother", "maman", "nasj", "sister"):
        save_rgba(cutout(B, pad(B_BOX[name], 5, B.shape)), os.path.join(out, "family", f"{name}.png"), scale=1)
    save_rgba(cutout(A, pad(A_PAPA, 5, (440, A.shape[1]))), os.path.join(out, "family", "papa.png"), scale=1)

    # --- landscapes that are complete in the new collage
    for name, (x0, y0, x1, y1) in LANDSCAPES.items():
        tile = A[y0:y1, x0:x1].copy()
        if name == "inventors":
            tile = remove_seam(tile, 275, 295)
        Image.fromarray(tile).save(os.path.join(out, "worlds", f"{name}.webp"), "WEBP", quality=92, method=6)
    print("hires assets written")


def run_sheet_d(out):
    """Title-free numbers (top) + stories (bottom) landscapes, stacked in one 1536x1024 sheet (sheet F).
    Wide crop = the whole scene (universe header); panel crop = the island with a little sky (home panels)."""
    from pathlib import Path
    from PIL import Image
    ref = Path(__file__).resolve().parents[1] / "reference" / "hires" / "sheet-F-numbers-stories-clean.png"
    im = Image.open(ref).convert("RGB")
    spec = {
        "numbers": ((0, 0, 1536, 555), (280, 0, 1340, 555)),
        "stories": ((0, 564, 1536, 1024), (310, 564, 1290, 1024)),
    }
    for name, (wide, panel) in spec.items():
        im.crop(panel).save(Path(out) / "worlds" / f"{name}.webp", quality=90, method=6)
        im.crop(wide).save(Path(out) / "worlds" / f"{name}-wide.webp", quality=88, method=6)
    return {k: (v[1][2] - v[1][0], v[1][3] - v[1][1]) for k, v in spec.items()}
