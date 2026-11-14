#!/usr/bin/env python3
"""Decode icons/icons.b64.json into PNG files beside it. Text-only in git; PNGs are generated in CI."""
import base64, json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
src = root / 'icons' / 'icons.b64.json'
dest = root / 'icons'
data = json.loads(src.read_text())
for name, b64 in data.items():
    if not name.endswith('.png'):
        raise SystemExit(f'refusing unexpected icon name: {name}')
    path = dest / name
    raw = base64.b64decode(b64)
    path.write_bytes(raw)
    print(f'wrote {path} ({len(raw)} bytes)')
