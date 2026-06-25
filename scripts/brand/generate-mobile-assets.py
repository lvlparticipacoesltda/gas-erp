#!/usr/bin/env python3
"""Rasteriza SVGs da marca para PNGs do app mobile (via resvg)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BRAND_DIR = Path(__file__).resolve().parent
MOBILE_ASSETS = ROOT / "apps" / "mobile" / "assets"
WEB_PUBLIC = ROOT / "apps/web/public"

EXPORTS: list[tuple[Path, Path, int | None]] = [
    (BRAND_DIR / "app-icon.svg", MOBILE_ASSETS / "icon.png", 1024),
    (BRAND_DIR / "app-icon.svg", MOBILE_ASSETS / "adaptive-icon.png", 1024),
    (BRAND_DIR / "app-icon.svg", MOBILE_ASSETS / "favicon.png", 48),
    (BRAND_DIR / "logo-login-dark.svg", MOBILE_ASSETS / "logo-login.png", 960),
    (BRAND_DIR / "app-icon.svg", WEB_PUBLIC / "icon.png", 512),
]


def resvg_bin() -> list[str]:
    if shutil.which("resvg"):
        return ["resvg"]
    return ["npx", "--yes", "@resvg/resvg-js-cli"]


def render(svg: Path, out: Path, width: int) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [*resvg_bin(), "--fit-width", str(width), str(svg), str(out)]
    subprocess.run(cmd, check=True, cwd=ROOT)


def splash_from_icon() -> None:
    render(BRAND_DIR / "splash.svg", MOBILE_ASSETS / "splash.png", 1284)


def main() -> None:
    for svg, out, width in EXPORTS:
        render(svg, out, width)
        print(f"  {out.relative_to(ROOT)}")
    splash_from_icon()
    print(f"  {MOBILE_ASSETS.relative_to(ROOT)}/splash.png")
    print("OK — assets da marca gerados.")


if __name__ == "__main__":
    main()
