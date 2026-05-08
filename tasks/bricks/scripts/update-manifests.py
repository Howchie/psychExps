#!/usr/bin/env python3
import os
import json
from pathlib import Path

def update_manifests(target_dir):
    target = Path(target_dir)
    for folder in target.iterdir():
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        
        pngs = sorted([p.name for p in folder.glob("*.png")])
        manifest_path = folder / "manifest.json"
        
        with open(manifest_path, "w") as f:
            json.dump(pngs, f, indent=2)
        
        print(f"Updated {manifest_path} with {len(pngs)} frames.")

if __name__ == "__main__":
    update_manifests("apps/web/public/assets/evander-bricks/sprite")
