#!/usr/bin/env python3
"""
Rebuilds NASJ raster assets from the supplied reference boards.

  python3 assets/tools/build_assets.py [--out frontend/public/img]

The boards are the ONLY source: nothing is redrawn. This script only crops,
removes the flat cream background (cutouts), and inpaints the baked-in
French/Arabic caption text out of the landscape illustrations (the app renders
that text as real, selectable, translatable HTML instead).

If the original, high-resolution illustration exports are supplied later, drop
them into frontend/public/img with the same file names and skip this script.
"""
import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REF = os.path.join(ROOT, "assets", "reference")

B1 = "01-five-universes.png"      # Five_Whimsical_Worlds_to_Explore.png  (PRIMARY reference)
B2 = "02-style-guide.png"         # NASJ_Yarn_World_Style_Guide.png
B3 = "03-app-screens.png"         # NASJ__Woven_Worlds_of_Learning.png


def load(name):
    return cv2.cvtColor(cv2.imread(os.path.join(REF, name)), cv2.COLOR_BGR2RGB)


def cutout(img, box, min_comp=0.004, keep_all=False, fg_thresh=46, bg_thresh=14):
    """Remove the flat cream card background around a subject -> RGBA array."""
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1].copy()
    h, w = crop.shape[:2]
    lab = cv2.cvtColor(crop, cv2.COLOR_RGB2LAB).astype(np.float32)
    border = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(lab - bg, axis=2)

    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    mask[dist < bg_thresh] = cv2.GC_PR_BGD
    mask[dist > fg_thresh] = cv2.GC_FGD
    mask[:2, :] = mask[-2:, :] = cv2.GC_BGD
    mask[:, :2] = mask[:, -2:] = cv2.GC_BGD
    bgm = np.zeros((1, 65), np.float64)
    fgm = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(crop, mask, None, bgm, fgm, 4, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        pass
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)

    # keep the main subject (+ sizeable satellites such as hearts/stars)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        biggest = 1 + int(np.argmax(areas))
        keep = np.zeros_like(fg)
        for i in range(1, n):
            if i == biggest or (keep_all and stats[i, cv2.CC_STAT_AREA] > min_comp * h * w):
                keep[labels == i] = 1
        fg = keep
    # fill holes
    inv = 1 - fg
    n, labels, stats, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n):
        x, y, ww, hh, a = stats[i]
        if x > 0 and y > 0 and x + ww < w and y + hh < h:
            fg[labels == i] = 1
    alpha = cv2.erode(fg, np.ones((3, 3), np.uint8)) * 255
    alpha = cv2.GaussianBlur(alpha.astype(np.uint8), (0, 0), 1.0)
    # trim to bbox
    ys, xs = np.where(alpha > 8)
    if len(xs) == 0:
        return np.dstack([crop, np.full((h, w), 255, np.uint8)])
    rgba = np.dstack([crop, alpha])
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def save_rgba(arr, path, scale=2.0, max_side=None):
    im = Image.fromarray(arr, "RGBA")
    if scale != 1:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    if max_side and max(im.size) > max_side:
        r = max_side / max(im.size)
        im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def inpaint_text(crop, boxes, thresh=170):
    """Erase dark caption glyphs inside the given boxes (pastel clouds behind them)."""
    out = crop.copy()
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
    mask = np.zeros(gray.shape, np.uint8)
    for (x0, y0, x1, y1) in boxes:
        sub = gray[y0:y1, x0:x1]
        m = (sub < thresh).astype(np.uint8) * 255
        mask[y0:y1, x0:x1] = m
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2)
    return cv2.inpaint(out, mask, 5, cv2.INPAINT_TELEA)


def save_rgb(arr, path, scale=2.0, quality=88):
    im = Image.fromarray(arr, "RGB")
    if scale != 1:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.4, percent=45, threshold=2))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)


def main():
    sys.path.insert(0, HERE)
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "frontend", "public", "img"))
    a = ap.parse_args()
    out = a.out
    b1, b2 = load(B1), load(B2)

    # ------------------------------------------------------------ landscapes (board 1)
    # (panel origin x,y) + art crop inside the panel + caption boxes (panel coords) to erase
    panels = {
        "letters":   dict(o=(18, 203),   art=(0, 76, 494, 290),   text=[(14, 80, 270, 160)]),
        "numbers":   dict(o=(530, 203),  art=(0, 76, 488, 290),   text=[(12, 80, 205, 168)]),
        "forest":    dict(o=(1036, 203), art=(0, 76, 486, 290),   text=[(12, 80, 215, 168)]),
        # wide panels: the island sits right of the caption/banner, so crop it alone
        "stories":   dict(o=(20, 640),   art=(340, 10, 630, 238),  text=[(22, 86, 245, 174)]),
        "inventors": dict(o=(870, 640),  art=(345, 10, 630, 238),  text=[(12, 86, 265, 174)]),
    }
    for wid, p in panels.items():
        ox, oy = p["o"]
        pw = 645 if wid in ("stories", "inventors") else 494
        ph = 422 if wid not in ("stories", "inventors") else 365
        panel = b1[oy:oy + ph, ox:ox + pw]
        panel = inpaint_text(panel, p["text"])
        x0, y0, x1, y1 = p["art"]
        art = panel[y0:min(y1, ph), x0:min(x1, pw)]
        save_rgb(art, os.path.join(out, "worlds", f"{wid}.webp"), scale=2.0)

    # ------------------------------------------------------------ activity icons (board 1)
    # centres of the 4 example-icon tiles in each panel (panel coords), square half-size 26
    icon_centres = {
        "letters":   [(80, 351), (192, 348), (303, 346), (416, 346)],
        "numbers":   [(57, 346), (174, 346), (281, 346), (407, 348)],
        "forest":    [(77, 350), (178, 350), (287, 351), (394, 350)],
        "stories":   [(105, 290), (240, 289), (396, 289), (542, 289)],
        "inventors": [(98, 287), (240, 287), (385, 287), (545, 287)],
    }
    os.makedirs(os.path.join(out, "icons"), exist_ok=True)
    for wid, centres in icon_centres.items():
        ox, oy = panels[wid]["o"]
        for i, (cx, cy) in enumerate(centres, 1):
            s = 32
            tile = b1[oy + cy - s: oy + cy + s, ox + cx - s: ox + cx + s]
            im = Image.fromarray(tile).resize((tile.shape[1] * 3, tile.shape[0] * 3), Image.LANCZOS)
            im.save(os.path.join(out, "icons", f"{wid}-{i}.png"), optimize=True)

    # ------------------------------------------------------------ logo (board 2 + board 1)
    save_rgba(cutout(b2, (40, 34, 258, 270), keep_all=True, min_comp=0.0006), os.path.join(out, "logo", "logo-stacked.png"), scale=2)
    save_rgba(cutout(b2, (92, 36, 214, 152)), os.path.join(out, "logo", "yarn-ball.png"), scale=2)
    save_rgba(cutout(b1, (592, 4, 912, 132), keep_all=True, min_comp=0.0006), os.path.join(out, "logo", "logo-horizontal.png"), scale=2)

    # ------------------------------------------------------------ mascot + expressions (board 2)
    save_rgba(cutout(b2, (308, 38, 488, 346), keep_all=True), os.path.join(out, "mascot", "classic.png"), scale=2)
    cols = [(610, 702), (712, 804), (812, 906)]
    rows = [(46, 134), (160, 250), (274, 366)]
    names = [
        ["happy", "curious", "thinking"],
        ["encouraging", "celebrating", "focused"],
        ["oops", "surprised", "sleepy"],
    ]
    for r, (y0, y1) in enumerate(rows):
        for c, (x0, x1) in enumerate(cols):
            save_rgba(cutout(b2, (x0, y0, x1, y1), keep_all=True), os.path.join(out, "mascot", f"expr-{names[r][c]}.png"), scale=2, max_side=360)

    variants = {
        "adventure": (936, 66, 1032, 194), "winter": (1036, 52, 1134, 194), "explorer": (1132, 40, 1230, 194),
        "creative": (936, 216, 1032, 360), "sporty": (1036, 222, 1134, 362), "classic": (1132, 222, 1228, 362),
    }
    for k, bx in variants.items():
        save_rgba(cutout(b2, bx, keep_all=True), os.path.join(out, "mascot", f"variant-{k}.png"), scale=2, max_side=420)

    family = {
        "papa": (1283, 48, 1392, 198), "maman": (1396, 54, 1503, 198),
        "sister": (1266, 224, 1346, 354), "brother": (1422, 228, 1514, 354),
    }
    for k, bx in family.items():
        save_rgba(cutout(b2, bx), os.path.join(out, "family", f"{k}.png"), scale=2, max_side=420)

    # ------------------------------------------------------------ graphic elements (board 2, mid row starts y=395)
    mid = 395
    yarns = [975, 1020, 1065, 1108, 1153, 1197]
    for i, cx in enumerate(yarns, 1):
        save_rgba(cutout(b2, (cx - 24, mid + 34, cx + 24, mid + 82)), os.path.join(out, "ui", f"yarn-{i}.png"), scale=3)
    patches = [990, 1053, 1118, 1181]
    for i, cx in enumerate(patches, 1):
        save_rgba(cutout(b2, (cx - 30, mid + 104, cx + 30, mid + 162)), os.path.join(out, "ui", f"patch-{i}.png"), scale=3)
    buttons = [989, 1053, 1118, 1182]
    for i, cx in enumerate(buttons, 1):
        save_rgba(cutout(b2, (cx - 28, mid + 180, cx + 28, mid + 234)), os.path.join(out, "ui", f"button-{i}.png"), scale=3)
    save_rgba(cutout(b2, (1102, mid + 252, 1134, mid + 284)), os.path.join(out, "ui", "reward-star.png"), scale=4)
    save_rgba(cutout(b2, (1140, mid + 252, 1174, mid + 286)), os.path.join(out, "ui", "reward-medal.png"), scale=4)
    save_rgba(cutout(b2, (1178, mid + 252, 1220, mid + 286)), os.path.join(out, "ui", "reward-crown.png"), scale=4)
    save_rgba(cutout(b2, (1323, mid + 255, 1448, mid + 290)), os.path.join(out, "ui", "thread-knot.png"), scale=3)
    # stage 2: sharper hi-res sheets override the board crops where available
    try:
        import build_assets_hires
        build_assets_hires.run(out); build_assets_hires.run_sheet_d(out)
    except ImportError:
        pass
    print("assets written to", out)


if __name__ == "__main__":
    sys.exit(main())
