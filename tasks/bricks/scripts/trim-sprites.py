#!/usr/bin/env python3
"""
Advanced sprite processor.
1. Flood fills to remove background.
2. Uses Connected Component Analysis to remove isolated "floaty specs".
3. Resizes all frames to a UNIFORM size based on the largest content detected.
4. Aligns characters to the BOTTOM-CENTER of the new frame.
"""
import sys
import os
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label

def get_content_bbox(img: Image.Image) -> tuple[int,int,int,int] | None:
    arr = np.array(img)
    if arr.shape[2] < 4: return None
    alpha = arr[:, :, 3]
    rows = np.where(alpha > 0)[0]
    cols = np.where(alpha > 0)[1]
    if len(rows) == 0 or len(cols) == 0: return None
    return (int(np.min(cols)), int(np.min(rows)), int(np.max(cols)) + 1, int(np.max(rows)) + 1)

def clean_isolated_pixels(img: Image.Image) -> Image.Image:
    """Removes 'floaty specs' by keeping only the largest connected component of non-transparent pixels."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    
    # Threshold alpha to get binary mask of content
    mask = (alpha > 0).astype(int)
    
    # Label connected components
    labeled, num_features = label(mask)
    
    if num_features <= 1:
        return img
        
    # Find sizes of components
    counts = np.bincount(labeled.flat)
    # Ignore background (index 0)
    counts[0] = 0
    
    largest_label = counts.argmax()
    
    # Zero out alpha for anything that isn't the largest component
    arr[labeled != largest_label, 3] = 0
    
    return Image.fromarray(arr)

def main():
    root = Path(__file__).resolve().parents[3]
    target = root / "apps/web/public/assets/evander-bricks/sprite"

    args = sys.argv[1:]
    padding = 6
    
    # Default threshold
    thresh = 35
    if "--thresh" in args:
        thresh = int(args[args.index("--thresh") + 1])
    
    dry_run = "--dry-run" in args

    print(f"Processing sprites in: {target}")
    
    frames_data = []
    max_w, max_h = 0, 0

    folders = sorted([d for d in target.iterdir() if d.is_dir() and not d.name.startswith(".")])
    for folder in folders:
        pngs = sorted(folder.glob("*.png"))
        for p in pngs:
            img = Image.open(p).convert("RGBA")
            width, height = img.size
            
            # Flood fill background from corners
            seeds = [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]
            for seed in seeds:
                ImageDraw.floodfill(img, seed, (0, 0, 0, 0), thresh=thresh)
            
            # Remove floaty specs
            img = clean_isolated_pixels(img)
            
            bbox = get_content_bbox(img)
            if bbox:
                content = img.crop(bbox)
                cw, ch = content.size
                max_w = max(max_w, cw)
                max_h = max(max_h, ch)
                frames_data.append({'path': p, 'content': content, 'bbox': bbox})
            else:
                print(f"  WARNING: No content in {p}")

    if not frames_data:
        print("No content found.")
        return

    # Target size with padding
    final_w = max_w + padding * 2
    final_h = max_h + padding * 2
    
    print(f"Uniform size determined: {final_w}x{final_h} (max content {max_w}x{max_h})")

    if dry_run:
        print("Dry run, skipping save.")
        return

    for item in frames_data:
        # Create new transparent canvas
        new_img = Image.new("RGBA", (final_w, final_h), (0, 0, 0, 0))
        
        cw, ch = item['content'].size
        # Align BOTTOM-CENTER
        x = (final_w - cw) // 2
        y = (final_h - ch) # Stick to bottom
        
        new_img.paste(item['content'], (x, y))
        new_img.save(item['path'])
        
    print(f"Processed {len(frames_data)} frames.")

if __name__ == "__main__":
    main()
