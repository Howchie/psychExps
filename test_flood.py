from PIL import Image, ImageDraw

def flood_fill_transparency(path, target_path):
    img = img = Image.open(path).convert("RGBA")
    width, height = img.size
    
    # We'll flood fill from the corners
    # Assuming the background is roughly the same color
    bg_color = img.getpixel((0, 0))
    
    # Create a mask for the flood fill
    # We use a tolerance because background might not be perfectly uniform
    # But for now let's try exact match
    
    # Pixels to check: all 4 corners
    seeds = [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]
    
    # We'll use a copy to perform the fill
    # Actually, ImageDraw.floodfill is what we want
    for seed in seeds:
        ImageDraw.floodfill(img, seed, (0, 0, 0, 0), thresh=10)
        
    img.save(target_path)

if __name__ == "__main__":
    flood_fill_transparency("apps/web/public/assets/evander-bricks/sprite/idle/s1_r0c0.png", "test_out.png")
