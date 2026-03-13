#!/usr/bin/env python3
"""Generate static preview PNGs for bricks task visual styles.

This script is intentionally offline and deterministic:
- does not launch the experiment
- does not capture screenshots
- renders previews directly from style definitions

Usage:
  python tasks/bricks/scripts/generate_texture_previews.py
  python tasks/bricks/scripts/generate_texture_previews.py --out-dir temp/bricks-texture-palettes --only presets
"""

from __future__ import annotations

import argparse
from pathlib import Path
import math
import re

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise SystemExit(
        "Pillow is required. Install with: pip install pillow"
    ) from exc


FLOOR_STYLES = {
    "concrete_checker": {
        "base": "#8f959c", "grout": "#6e757e", "seam": "#4b545f",
        "pattern": "checker", "rivets": 0, "dents": 0, "cracks": 0,
    },
    "cold_blueprint": {
        "base": "#96acbf", "grout": "#72889b", "seam": "#526678",
        "pattern": "checker", "rivets": 0, "dents": 0, "cracks": 0,
    },
    "lab_metal_rivet": {
        "base": "#8ea0ad", "grout": "#617380", "seam": "#465560",
        "pattern": "checker", "rivets": 90, "dents": 8, "cracks": 0,
    },
    "wood_corrugation": {
        "base": "#9a8266", "grout": "#715c47", "seam": "#5a4736",
        "pattern": "staggered", "rivets": 0, "dents": 0, "cracks": 0,
    },
    "damaged_salvage": {
        "base": "#7a838e", "grout": "#545c66", "seam": "#3d434c",
        "pattern": "checker", "rivets": 30, "dents": 16, "cracks": 18,
    },
    "salvage_rivet": {
        "base": "#7f8b97", "grout": "#596572", "seam": "#414b55",
        "pattern": "checker", "rivets": 60, "dents": 10, "cracks": 6,
    },
}

BELT_STYLES = {
    "industrial_ribbed": {
        "base": "#2a323b", "rib": "#4d5863", "groove": "#2b333c",
        "scuffs": 0, "patches": 0,
    },
    "cold_blueprint_belt": {
        "base": "#3a5166", "rib": "#69859e", "groove": "#2b3f51",
        "scuffs": 0, "patches": 0,
    },
    "lab_ribbed": {
        "base": "#3a4c5c", "rib": "#617b90", "groove": "#2a3b49",
        "scuffs": 22, "patches": 0,
    },
    "wood_corrugation_belt": {
        "base": "#4a3929", "rib": "#70583f", "groove": "#3b2d21",
        "scuffs": 8, "patches": 0,
    },
    "damaged_patched_belt": {
        "base": "#38414a", "rib": "#55606b", "groove": "#2a323b",
        "scuffs": 45, "patches": 14,
    },
    "salvage_shredder_belt": {
        "base": "#343d46", "rib": "#515d69", "groove": "#2a333c",
        "scuffs": 20, "patches": 0,
    },
}

BRICK_STYLE_COLOR_OVERRIDES = {
    "crate": ("#8b6f4e", "#3b2f22"),
    "other_crate": ("#7a6044", "#2f261c"),
    "other_steel_case": ("#596677", "#1f2937"),
    "present": ("#ff2d2d", "#ffe14d"),
    "target_teal_present": ("#00a34a", "#ff3b30"),
    "neutral_tote": ("#6b7280", "#374151"),
    "pizza": ("#facc15", "#b91c1c"),
    "target_pizza": ("#fde047", "#b91c1c"),
    "box": ("#8a6b4d", "#8f6b49"),
    "crate_damaged": ("#74583d", "#2a2118"),
    "parcel_label": ("#b4936b", "#9a7651"),
    "parcel-label": ("#b4936b", "#9a7651"),
    "parcel_damaged": ("#7a6a54", "#3f3428"),
    "chest": ("#6d4b31", "#f5d8a6"),
    "checkerboard": ("#7d8794", "#5f6976"),
    "checker_board": ("#7d8794", "#5f6976"),
}

BRICK_STYLE_PATTERNS = {
    "present": "gift_wrap",
    "target_present": "gift_wrap",
    "target_teal_present": "gift_wrap",
    "pizza": "pizza",
    "target_pizza": "pizza",
    "checkerboard": "checkerboard",
    "checker_board": "checkerboard",
    "parcel_label": "cardboard_block",
    "parcel-label": "cardboard_block",
    "box": "cardboard_block",
}

FURNACE_STYLES = ["furnace", "crusher", "shredder", "plasma_recycler"]

PRESETS = {
    "warehouse_concrete_checker": ("concrete_checker", "industrial_ribbed"),
    "industrial_sleek_flat": ("concrete_checker", "industrial_ribbed"),
    "kraft_wood_packaging": ("wood_corrugation", "wood_corrugation_belt"),
    "parcel_sorting_holiday": ("wood_corrugation", "industrial_ribbed"),
    "cold_storage_blueprint": ("cold_blueprint", "cold_blueprint_belt"),
    "nightshift_high_contrast": ("damaged_salvage", "industrial_ribbed"),
    "lab_rivet_sorting_bay": ("lab_metal_rivet", "lab_ribbed"),
    "wood_corrugation_packline": ("wood_corrugation", "wood_corrugation_belt"),
    "damaged_salvage_line": ("damaged_salvage", "damaged_patched_belt"),
    "salvage_shredder_bay": ("salvage_rivet", "salvage_shredder_belt"),
}


def _stable_hash(text: str) -> int:
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _parse_object_keys(source: str, object_name: str) -> list[str]:
    marker = f"const {object_name} ="
    start = source.find(marker)
    if start < 0:
        return []
    brace_start = source.find("{", start)
    if brace_start < 0:
        return []
    i = brace_start
    depth = 0
    end = -1
    while i < len(source):
        ch = source[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
        i += 1
    if end < 0:
        return []
    block = source[brace_start + 1:end]
    keys = []
    for line in block.splitlines():
        m = re.match(r"^\s*(?:'([^']+)'|\"([^\"]+)\"|([A-Za-z0-9_]+))\s*:\s*{", line)
        if m:
            key = m.group(1) or m.group(2) or m.group(3)
            if key:
                keys.append(key)
    return keys


def load_brick_style_ids() -> list[str]:
    renderer_path = Path(__file__).resolve().parents[1] / "src/runtime/renderer_pixi.ts"
    if not renderer_path.exists():
        return sorted(BRICK_STYLE_COLOR_OVERRIDES.keys())
    source = renderer_path.read_text(encoding="utf-8")
    parsed = _parse_object_keys(source, "BUILTIN_BRICK_TEXTURE_STYLES")
    if not parsed:
        return sorted(BRICK_STYLE_COLOR_OVERRIDES.keys())
    return parsed


def brick_colors(name: str) -> tuple[str, str]:
    if name in BRICK_STYLE_COLOR_OVERRIDES:
        return BRICK_STYLE_COLOR_OVERRIDES[name]
    h = _stable_hash(name)
    hue = h % 360
    sat = 45 + ((h >> 8) % 35)
    lig = 42 + ((h >> 16) % 20)
    # HSL -> RGB helper (small and deterministic)
    c = (1 - abs(2 * (lig / 100) - 1)) * (sat / 100)
    x = c * (1 - abs((hue / 60) % 2 - 1))
    m = (lig / 100) - c / 2
    if hue < 60:
        rp, gp, bp = c, x, 0
    elif hue < 120:
        rp, gp, bp = x, c, 0
    elif hue < 180:
        rp, gp, bp = 0, c, x
    elif hue < 240:
        rp, gp, bp = 0, x, c
    elif hue < 300:
        rp, gp, bp = x, 0, c
    else:
        rp, gp, bp = c, 0, x
    r = int((rp + m) * 255)
    g = int((gp + m) * 255)
    b = int((bp + m) * 255)
    base = f"#{r:02x}{g:02x}{b:02x}"
    accent = f"#{max(0, r-45):02x}{max(0, g-45):02x}{max(0, b-45):02x}"
    return base, accent


def rng_factory(seed: int):
    state = seed & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal state
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= (state >> 17)
        state ^= (state << 5) & 0xFFFFFFFF
        return (state & 0xFFFFFFFF) / 0x100000000

    return rnd


def draw_floor_tile(draw: ImageDraw.ImageDraw, w: int, h: int, cfg: dict, seed: int = 1):
    rnd = rng_factory(seed)
    draw.rectangle([0, 0, w, h], fill=cfg["base"])
    cell_w = 74
    cell_h = 74 if cfg["pattern"] != "staggered" else 62

    for row, y in enumerate(range(0, h, cell_h)):
        offset = 0
        if cfg["pattern"] == "staggered" and row % 2 == 1:
            offset = cell_w // 2
        for x in range(-offset, w + cell_w, cell_w):
            if cfg["pattern"] == "checker" and ((row + (x // max(cell_w, 1))) % 2 == 0):
                draw.rectangle([x, y, x + cell_w, y + cell_h], fill=cfg["base"])
            else:
                draw.rectangle([x, y, x + cell_w, y + cell_h], fill=cfg["base"])
            draw.rectangle([x, y, x + cell_w, y + 2], fill=cfg["grout"])
            draw.rectangle([x, y, x + 2, y + cell_h], fill=cfg["grout"])

    for _ in range(100):
        x = int(rnd() * w)
        y = int(rnd() * h)
        draw.rectangle([x, y, x + 2, y + 1], fill=cfg["seam"])

    for _ in range(cfg["rivets"]):
        x = int(rnd() * w)
        y = int(rnd() * h)
        draw.ellipse([x, y, x + 2, y + 2], fill="#dbe8f2")

    for _ in range(cfg["dents"]):
        x = int(rnd() * (w - 10))
        y = int(rnd() * (h - 8))
        draw.ellipse([x, y, x + 8, y + 5], fill="#374151")

    for _ in range(cfg["cracks"]):
        x = int(rnd() * (w - 24))
        y = int(rnd() * (h - 8))
        draw.line([x, y, x + 16, y + 1], fill="#1f2937", width=1)
        draw.line([x + 8, y + 1, x + 13, y - 2], fill="#1f2937", width=1)


def draw_belt_tile(draw: ImageDraw.ImageDraw, w: int, h: int, cfg: dict, seed: int = 2):
    rnd = rng_factory(seed)
    draw.rectangle([0, 0, w, h], fill=cfg["base"])
    draw.rectangle([0, 0, w, 20], fill="#111827")
    draw.rectangle([0, h - 20, w, h], fill="#111827")

    step, rib = 12, 8
    for x in range(0, w, step):
        draw.rectangle([x, 22, x + rib, h - 22], fill=cfg["rib"])
        draw.rectangle([x + rib, 22, x + step, h - 22], fill=cfg["groove"])

    for _ in range(cfg["scuffs"]):
        x = int(rnd() * (w - 20))
        y = int(24 + rnd() * (h - 48))
        draw.rectangle([x, y, x + 14, y + 1], fill="#cbd5e1")

    for _ in range(cfg["patches"]):
        x = int(rnd() * (w - 28))
        y = int(24 + rnd() * (h - 52))
        draw.rectangle([x, y, x + 20, y + 9], fill="#111827")
        draw.rectangle([x + 1, y + 1, x + 19, y + 1], fill="#94a3b8")


def generate_floor_images(out_dir: Path):
    for name, cfg in FLOOR_STYLES.items():
        img = Image.new("RGB", (900, 320), "#ffffff")
        draw = ImageDraw.Draw(img)
        draw_floor_tile(draw, 900, 320, cfg, seed=hash(name) & 0xFFFFFFFF)
        draw.rectangle([8, 8, 300, 34], fill="#ffffff")
        draw.text((14, 14), f"floor: {name}", fill="#111111")
        img.save(out_dir / f"floor_style_{name}.png")


def generate_belt_images(out_dir: Path):
    for name, cfg in BELT_STYLES.items():
        img = Image.new("RGB", (900, 220), "#ffffff")
        draw = ImageDraw.Draw(img)
        draw_belt_tile(draw, 900, 220, cfg, seed=hash(name) & 0xFFFFFFFF)
        draw.rectangle([8, 8, 320, 34], fill="#ffffff")
        draw.text((14, 14), f"conveyor: {name}", fill="#111111")
        img.save(out_dir / f"belt_style_{name}.png")


def draw_brick_preview(draw: ImageDraw.ImageDraw, name: str, x: int, y: int, cell_w: int, cell_h: int):
    draw.rectangle([x, y, x + cell_w, y + cell_h], fill="#e5e7eb", outline="#9ca3af", width=2)
    base, accent = brick_colors(name)
    bx, by = x + 26, y + 44
    bw, bh = 168, 88
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=8, fill=base, outline=accent, width=2)

    pattern = BRICK_STYLE_PATTERNS.get(name, "wood_planks")
    phase = (_stable_hash(name) % 7) / 7.0

    if pattern == "gift_wrap":
        inset = 2
        ribbon_width_ratio = 0.24
        ribbon_w = max(3, round(bw * ribbon_width_ratio))
        ribbon_h = max(3, round(bh * ribbon_width_ratio))
        cx = bx + bw // 2
        cy = by + bh // 2
        ribbon_x = round((bw - ribbon_w) * 0.5) + bx
        ribbon_y = round((bh - ribbon_h) * 0.5) + by

        # paper pattern dots (closer to runtime gift_wrap defaults)
        paper_dot_step = 11
        for py in range(by + inset + 2, by + bh - inset - 1, paper_dot_step):
            row = (py - (by + inset + 2)) // paper_dot_step
            offset = 2 if (row % 2 == 1) else 0
            for px in range(bx + inset + 2, bx + bw - inset - 1, paper_dot_step):
                draw.ellipse([px + offset, py, px + offset + 1, py + 1], fill="#ffffff")

        # ribbon cross
        draw.rectangle([ribbon_x, by + inset, ribbon_x + ribbon_w, by + bh - inset], fill=accent)
        draw.rectangle([bx + inset, ribbon_y, bx + bw - inset, ribbon_y + ribbon_h], fill=accent)

        # bow body
        bow_size = max(3, round(min(bw, bh) * 0.18))
        left_center = (round(cx - bow_size), cy)
        right_center = (round(cx + bow_size), cy)
        knot_r = max(1, round(bow_size * 0.58))
        draw.ellipse([left_center[0] - bow_size, left_center[1] - bow_size,
                      left_center[0] + bow_size, left_center[1] + bow_size], fill=accent)
        draw.ellipse([right_center[0] - bow_size, right_center[1] - bow_size,
                      right_center[0] + bow_size, right_center[1] + bow_size], fill=accent)
        draw.ellipse([cx - knot_r, cy - knot_r, cx + knot_r, cy + knot_r], fill=accent)
        left_tail = [
            (round(cx - bow_size * 0.2), round(cy + bow_size * 0.6)),
            (round(cx - bow_size * 0.95), round(cy + bow_size * 1.75)),
            (round(cx - bow_size * 0.15), round(cy + bow_size * 1.2)),
        ]
        right_tail = [
            (round(cx + bow_size * 0.2), round(cy + bow_size * 0.6)),
            (round(cx + bow_size * 0.95), round(cy + bow_size * 1.75)),
            (round(cx + bow_size * 0.15), round(cy + bow_size * 1.2)),
        ]
        draw.polygon(left_tail, fill=accent)
        draw.polygon(right_tail, fill=accent)

        # bow border (mirrors runtime bow border support)
        bow_border = "#111827"
        border_w = 2
        draw.ellipse([left_center[0] - bow_size, left_center[1] - bow_size,
                      left_center[0] + bow_size, left_center[1] + bow_size], outline=bow_border, width=border_w)
        draw.ellipse([right_center[0] - bow_size, right_center[1] - bow_size,
                      right_center[0] + bow_size, right_center[1] + bow_size], outline=bow_border, width=border_w)
        draw.ellipse([cx - knot_r, cy - knot_r, cx + knot_r, cy + knot_r], outline=bow_border, width=max(1, border_w - 1))
        draw.line(left_tail + [left_tail[0]], fill=bow_border, width=border_w)
        draw.line(right_tail + [right_tail[0]], fill=bow_border, width=border_w)
    elif pattern == "pizza":
        cx, cy = bx + bw // 2, by + bh // 2
        r0 = min(bw, bh) // 2 - 5
        draw.ellipse([cx - r0, cy - r0, cx + r0, cy + r0], outline=accent, width=3)
        slices = 6 if name == "pizza" else 8
        for k in range(slices):
            a = 2 * math.pi * k / slices
            draw.line([cx, cy, cx + math.cos(a) * (r0 - 3), cy + math.sin(a) * (r0 - 3)], fill="#7c2d12", width=2)
    elif pattern == "checkerboard":
        cell = 12
        for py in range(by + 2, by + bh - 2, cell):
            row = (py - (by + 2)) // cell
            for px in range(bx + 2, bx + bw - 2, cell):
                col = (px - (bx + 2)) // cell
                fill = "#a9b4c2" if ((row + col) % 2 == 0) else "#5f6976"
                draw.rectangle(
                    [px, py, min(px + cell, bx + bw - 2), min(py + cell, by + bh - 2)],
                    fill=fill,
                )
    elif pattern == "cardboard_block":
        if name not in ("parcel_label", "parcel-label"):
            for px in range(bx + 4, bx + bw - 4, 6):
                draw.line([px, by + 4, px, by + bh - 4], fill="#9a7651", width=1)
            rnd = rng_factory(_stable_hash(name))
            for _ in range(24):
                sx = bx + 4 + int(rnd() * (bw - 8))
                sy = by + 4 + int(rnd() * (bh - 8))
                draw.rectangle([sx, sy, sx + 1, sy + 1], fill="#7e5f40")
            draw.rectangle([bx + 3, by + 3, bx + bw - 3, by + max(4, int(bh * 0.16))], fill="#f1e5d5")
    else:
        inset = 3
        plank_count = 2 if name in ("box", "neutral_tote") else (4 if name == "other_steel_case" else 3)
        seam_w = 1

        # top sheen (runtime-like)
        draw.rounded_rectangle(
            [bx + inset, by + inset, bx + bw - inset, by + max(inset + 2, int(bh * 0.2))],
            radius=4,
            fill="#f3f4f6",
        )

        # horizontal seams (runtime plank separators)
        for i in range(1, plank_count):
            yy = round(by + (bh * i) / plank_count)
            draw.rectangle([bx + inset, yy - seam_w // 2, bx + bw - inset, yy + seam_w // 2], fill=accent)

        # grain streaks
        grain_count = 1 if name == "other_steel_case" else (2 if name in ("neutral_tote", "box") else 5)
        for i in range(grain_count):
            yy = round(by + inset + ((bh - inset * 2) * ((i + phase) % max(1, grain_count))) / max(1, grain_count))
            streak_w = max(10, round(bw * (0.28 + ((i + int(phase * 3)) % 3) * 0.11)))
            x_seed = (i * 13 + int(phase * 17))
            xx = bx + inset + (x_seed % max(1, (bw - inset * 2 - streak_w)))
            draw.line([xx, yy, xx + streak_w, yy], fill="#f8fafc", width=1)

        # corner nails
        nail_r = 1
        nxo = max(inset + nail_r + 1, int(bw * 0.13))
        nyo = max(inset + nail_r + 1, int(bh * 0.2))
        for nx, ny in [
            (bx + nxo, by + nyo),
            (bx + bw - nxo, by + nyo),
            (bx + nxo, by + bh - nyo),
            (bx + bw - nxo, by + bh - nyo),
        ]:
            draw.ellipse([nx - nail_r, ny - nail_r, nx + nail_r, ny + nail_r], fill=accent)

        if name == "chest":
            band = max(2, round(bw * 0.12))
            draw.rectangle([bx + inset, by + inset, bx + inset + band, by + bh - inset], fill="#f1f5f9")
            draw.rectangle([bx + bw - inset - band, by + inset, bx + bw - inset, by + bh - inset], fill="#f1f5f9")
            plate_w = max(4, round(bw * 0.14))
            plate_h = max(4, round(bh * 0.22))
            px = bx + (bw - plate_w) // 2
            py = by + (bh - plate_h) // 2
            draw.rounded_rectangle([px, py, px + plate_w, py + plate_h], radius=2, fill="#fef3c7")

    # parcel_label should stay plain solid cardboard in previews (matching runtime intent).

    draw.text((x + 8, y + 8), name, fill="#111")


def generate_brick_images(out_dir: Path, names: list[str], include_sheet: bool = True):
    cell_w, cell_h = 220, 160

    # Remove stale per-style files so deleted runtime styles disappear from outputs.
    for stale in out_dir.glob("brick_style_*.png"):
        stale.unlink(missing_ok=True)

    for name in names:
        img = Image.new("RGB", (cell_w + 32, cell_h + 52), "#f5f5f5")
        draw = ImageDraw.Draw(img)
        draw_brick_preview(draw, name, 16, 26, cell_w, cell_h)
        img.save(out_dir / f"brick_style_{name}.png")

    if include_sheet:
        cols = 7
        rows = math.ceil(len(names) / cols)
        img = Image.new("RGB", (16 + cols * (cell_w + 8), 42 + rows * (cell_h + 8)), "#f5f5f5")
        draw = ImageDraw.Draw(img)
        draw.text((16, 12), "Brick Texture Styles (preview)", fill="#111")
        for i, name in enumerate(names):
            r, c = divmod(i, cols)
            x = 16 + c * (cell_w + 8)
            y = 42 + r * (cell_h + 8)
            draw_brick_preview(draw, name, x, y, cell_w, cell_h)
        img.save(out_dir / "brick_texture_styles.png")


def generate_furnace_sheet(out_dir: Path):
    cell_w = 220
    img = Image.new("RGB", (20 + len(FURNACE_STYLES) * (cell_w + 12), 300), "#f5f5f5")
    draw = ImageDraw.Draw(img)
    draw.text((16, 12), "End-Furnace Style Variants (preview)", fill="#111")

    for i, name in enumerate(FURNACE_STYLES):
        x = 20 + i * (cell_w + 12)
        y = 44
        draw.rectangle([x, y, x + cell_w, 260], fill="#e5e7eb", outline="#9ca3af", width=2)
        draw.text((x + 8, y + 8), name, fill="#111")
        bx, by = x + 70, 120
        draw.rectangle([bx, by, bx + 92, by + 80], fill="#4b5563", outline="#1f2937", width=2)
        draw.rectangle([bx + 2, by + 28, bx + 36, by + 54], fill="#0f172a")
        if name == "furnace":
            draw.rectangle([bx + 5, by + 31, bx + 33, by + 51], fill="#f97316")
            draw.rectangle([bx + 9, by + 35, bx + 29, by + 47], fill="#fbbf24")
        elif name == "crusher":
            draw.rectangle([bx + 5, by + 31, bx + 33, by + 36], fill="#f3f4f6")
            draw.rectangle([bx + 5, by + 46, bx + 33, by + 51], fill="#f3f4f6")
            for yy in range(by + 26, by + 56, 4):
                color = "#f59e0b" if ((yy // 4) % 2 == 0) else "#111827"
                draw.rectangle([bx - 6, yy, bx - 2, yy + 3], fill=color)
        elif name == "shredder":
            cx, cy = bx + 19, by + 41
            draw.line([cx - 8, cy, cx + 8, cy], fill="#cbd5e1", width=2)
            draw.line([cx, cy - 8, cx, cy + 8], fill="#cbd5e1", width=2)
            draw.line([cx - 6, cy - 6, cx + 6, cy + 6], fill="#cbd5e1", width=2)
            draw.line([cx - 6, cy + 6, cx + 6, cy - 6], fill="#cbd5e1", width=2)
        else:
            draw.rectangle([bx + 5, by + 31, bx + 33, by + 51], fill="#a78bfa")
            draw.ellipse([bx - 4, by + 24, bx + 42, by + 58], outline="#a78bfa", width=3)

    img.save(out_dir / "end_furnace_styles.png")


def generate_preset_cards(out_dir: Path):
    for preset_name, (floor_id, belt_id) in PRESETS.items():
        floor_cfg = FLOOR_STYLES[floor_id]
        belt_cfg = BELT_STYLES[belt_id]

        img = Image.new("RGB", (980, 360), "#f8fafc")
        draw = ImageDraw.Draw(img)
        draw.text((16, 12), f"Preset: {preset_name}", fill="#111")

        # floor panel
        floor_box = (16, 46, 964, 224)
        floor_img = Image.new("RGB", (floor_box[2] - floor_box[0], floor_box[3] - floor_box[1]), "#fff")
        floor_draw = ImageDraw.Draw(floor_img)
        draw_floor_tile(floor_draw, floor_img.width, floor_img.height, floor_cfg, seed=hash((preset_name, "floor")) & 0xFFFFFFFF)
        img.paste(floor_img, (floor_box[0], floor_box[1]))
        draw.rectangle(floor_box, outline="#334155", width=2)

        # belt panel
        belt_box = (16, 238, 964, 306)
        belt_img = Image.new("RGB", (belt_box[2] - belt_box[0], belt_box[3] - belt_box[1]), "#fff")
        belt_draw = ImageDraw.Draw(belt_img)
        draw_belt_tile(belt_draw, belt_img.width, belt_img.height, belt_cfg, seed=hash((preset_name, "belt")) & 0xFFFFFFFF)
        img.paste(belt_img, (belt_box[0], belt_box[1]))
        draw.rectangle(belt_box, outline="#0f172a", width=2)

        # brick chips
        chips = [
            ("target", "#1e40ff", "#ffe14d"),
            ("other", "#7a6b56", "#403628"),
            ("neutral", "#687687", "#3c4f60"),
        ]
        cx = 20
        for label, base, accent in chips:
            draw.rounded_rectangle([cx, 318, cx + 86, 346], radius=6, fill=base, outline=accent, width=2)
            if label == "target":
                draw.rectangle([cx + 40, 320, cx + 46, 344], fill=accent)
                draw.rectangle([cx + 3, 330, cx + 83, 336], fill=accent)
            draw.text((cx + 6, 348), label, fill="#111")
            cx += 104

        img.save(out_dir / f"preset_{preset_name}.png")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate bricks visual style preview PNGs.")
    parser.add_argument(
        "--out-dir",
        default="temp/bricks-texture-palettes",
        help="Output directory for PNGs (default: temp/bricks-texture-palettes)",
    )
    parser.add_argument(
        "--only",
        choices=["all", "floor", "belt", "bricks", "furnace", "presets"],
        default="all",
        help="Generate only one group (default: all)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    brick_style_ids = load_brick_style_ids()

    if args.only in ("all", "floor"):
        generate_floor_images(out_dir)
    if args.only in ("all", "belt"):
        generate_belt_images(out_dir)
    if args.only in ("all", "bricks"):
        generate_brick_images(out_dir, names=brick_style_ids, include_sheet=True)
    if args.only in ("all", "furnace"):
        generate_furnace_sheet(out_dir)
    if args.only in ("all", "presets"):
        generate_preset_cards(out_dir)

    print(f"Generated previews in: {out_dir.resolve()}")


if __name__ == "__main__":
    main()
