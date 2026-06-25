#!/usr/bin/env python3
"""Gera ícones e splash do app mobile a partir dos SVGs da marca Gás do Povo."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOBILE_ASSETS = ROOT / "apps" / "mobile" / "assets"
BRAND = {
    "laranja": (0xFB, 0x5E, 0x13),
    "brasa": (0xE8, 0x4B, 0x0B),
    "carvao": (0x1C, 0x14, 0x0C),
    "areia": (0xF4, 0xEE, 0xE8),
    "white": (0xFF, 0xFF, 0xFF),
}


def write_png(path: Path, width: int, height: int, rgba_fn) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(rgba_fn(x, y))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def rounded_rect(x: float, y: float, w: float, h: float, r: float, px: int, py: int) -> bool:
    if px < x or py > y + h or py < y or px > x + w:
        return False
    if px >= x + r and px <= x + w - r:
        return y <= py <= y + h
    if py >= y + r and py <= y + h - r:
        return x <= px <= x + w
    corners = (
        (x + r, y + r),
        (x + w - r, y + r),
        (x + r, y + h - r),
        (x + w - r, y + h - r),
    )
    for cx, cy in corners:
        if (px - cx) ** 2 + (py - cy) ** 2 <= r * r:
            return True
    return False


def flame(px: int, py: int, cx: float, cy: float, scale: float) -> bool:
  x = (px - cx) / scale
  y = (py - cy) / scale
  if y < -2.2 or y > 3.2:
      return False
  width = 1.35 + max(0.0, 1.8 - abs(y - 0.4) * 0.55)
  if abs(x) > width:
      return False
  tip = 1.0 - (abs(x) / width) * 0.35
  return y <= tip + math.sin(x * 1.4) * 0.15


def draw_cylinder(px: int, py: int, size: int, body: tuple[int, int, int], flame_color: tuple[int, int, int]) -> tuple[int, int, int, int] | None:
    s = size / 1024.0
    cap_x, cap_y, cap_w, cap_h, cap_r = 362 * s, 190 * s, 300 * s, 110 * s, 55 * s
    body_x, body_y, body_w, body_h, body_r = 362 * s, 280 * s, 300 * s, 520 * s, 150 * s
    cx, cy = (body_x + body_w / 2), (body_y + body_h / 2 + 20 * s)
    flame_scale = 95 * s

    in_cap = rounded_rect(cap_x, cap_y, cap_w, cap_h, cap_r, px, py)
    in_body = rounded_rect(body_x, body_y, body_w, body_h, body_r, px, py)
    if not (in_cap or in_body):
        return None
    if flame(px, py, cx, cy, flame_scale):
        return (*flame_color, 255)
    return (*body, 255)


def app_icon_rgba(x: int, y: int, size: int) -> tuple[int, int, int, int]:
    margin = size * 0.08
    radius = size * 0.22
    if not rounded_rect(margin, margin, size - 2 * margin, size - 2 * margin, radius, x, y):
        return (0, 0, 0, 0)
    cyl = draw_cylinder(x, y, size, BRAND["white"], BRAND["laranja"])
    if cyl:
        return cyl
    return (*BRAND["laranja"], 255)


def splash_rgba(x: int, y: int, width: int, height: int) -> tuple[int, int, int, int]:
    icon_size = int(min(width, height) * 0.34)
    ox = (width - icon_size) // 2
    oy = int(height * 0.28)
    local_x, local_y = x - ox, y - oy
    if 0 <= local_x < icon_size and 0 <= local_y < icon_size:
        icon_px = app_icon_rgba(local_x, local_y, icon_size)
        if icon_px[3] > 0:
            return icon_px
    return (*BRAND["carvao"], 255)


def main() -> None:
    write_png(MOBILE_ASSETS / "icon.png", 1024, 1024, lambda x, y: app_icon_rgba(x, y, 1024))
    write_png(MOBILE_ASSETS / "adaptive-icon.png", 1024, 1024, lambda x, y: app_icon_rgba(x, y, 1024))
    write_png(MOBILE_ASSETS / "favicon.png", 48, 48, lambda x, y: app_icon_rgba(x, y, 48))
    write_png(MOBILE_ASSETS / "splash.png", 1284, 2778, lambda x, y: splash_rgba(x, y, 1284, 2778))
    print("Generated mobile brand assets in", MOBILE_ASSETS)


if __name__ == "__main__":
    main()
