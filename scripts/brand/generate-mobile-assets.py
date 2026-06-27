#!/usr/bin/env python3
"""Gera PNGs da marca a partir dos arquivos-fonte em scripts/brand/."""

from __future__ import annotations

import shutil
import subprocess
from sys import exit
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BRAND_DIR = Path(__file__).resolve().parent
MOBILE_ASSETS = ROOT / "apps" / "mobile" / "assets"
WEB_PUBLIC = ROOT / "apps" / "web" / "public"
WEB_BRAND = WEB_PUBLIC / "brand"

# (arquivo-fonte, destino, maior lado em px; None = copiar sem redimensionar)
EXPORTS: list[tuple[str, Path, int | None]] = [
    ("app-icon.png", MOBILE_ASSETS / "icon.png", 1024),
    ("app-icon.png", MOBILE_ASSETS / "adaptive-icon.png", 1024),
    ("app-icon.png", MOBILE_ASSETS / "favicon.png", 48),
    ("app-icon.png", WEB_PUBLIC / "icon.png", 512),
    ("app-icon.png", ROOT / "apps" / "web" / "src" / "app" / "icon.png", 512),
    ("app-icon.png", WEB_BRAND / "app-icon.png", 512),
    ("logo-login-dark.png", MOBILE_ASSETS / "logo-login.png", 960),
    ("logo-login-dark.png", WEB_BRAND / "logo-login-dark.png", 960),
    ("splash.png", MOBILE_ASSETS / "splash.png", 1284),
    ("gas-cylinder-mark.png", WEB_BRAND / "gas-cylinder-mark.png", 512),
    ("logo-gas-do-povo.png", WEB_BRAND / "logo-wordmark.png", 960),
]

SOURCE_FILES = sorted({name for name, _, _ in EXPORTS})


def resize_png(src: Path, dest: Path, max_side: int | None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if max_side is None:
        shutil.copy2(src, dest)
        return
    subprocess.run(
        ["sips", "-Z", str(max_side), str(src), "--out", str(dest)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    missing = [name for name in SOURCE_FILES if not (BRAND_DIR / name).is_file()]
    if missing:
        exit(f"Arquivos-fonte ausentes em scripts/brand/: {', '.join(missing)}")

    for filename, dest, max_side in EXPORTS:
        resize_png(BRAND_DIR / filename, dest, max_side)
        print(f"  {dest.relative_to(ROOT)}")

    print("OK — assets da marca gerados a partir dos PNGs.")


if __name__ == "__main__":
    main()
