import type { SceneStimulus, SceneItem } from "./scene";
import type { Point } from "../infrastructure/spatial";
import { loadImageIfLikelyVisualStimulus } from "../stimuli/stimulus";

export class SceneRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  /**
   * Renders the scene into the provided slots.
   */
  render(scene: SceneStimulus, slots: Point[], options: { clear?: boolean } = {}): void {
    if (options.clear !== false) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    for (let i = 0; i < scene.items.length; i++) {
      const item = scene.items[i];
      const slot = slots[i];
      if (!slot) continue;

      this.renderItem(item, slot);
    }
  }

  private renderItem(item: SceneItem, pos: Point): void {
    if (item.category === "shape") {
      this.renderShape(item, pos);
    } else if (item.features && ("src" in item.features || "url" in item.features || "image" in item.features)) {
      this.renderImage(item, pos);
    }
  }

  private renderImage(item: SceneItem, pos: Point): void {
    const features = item.features as {
      src?: string | HTMLImageElement;
      url?: string | HTMLImageElement;
      image?: string | HTMLImageElement;
      width?: number;
      height?: number;
      size?: number;
    };

    const source = features.image ?? features.src ?? features.url;
    if (!source) return;

    const width = features.width ?? features.size ?? 50;
    const height = features.height ?? features.size ?? 50;

    if (source instanceof HTMLImageElement) {
      if (source.complete && source.naturalWidth > 0) {
        this.ctx.drawImage(source, pos.x - width / 2, pos.y - height / 2, width, height);
      }
      return;
    }

    if (typeof source === "string") {
      loadImageIfLikelyVisualStimulus(source).then((img) => {
        if (img && img.complete && img.naturalWidth > 0) {
          this.ctx.drawImage(img, pos.x - width / 2, pos.y - height / 2, width, height);
        }
      }).catch(() => {
        // Ignore load errors silently
      });
    }
  }

  private renderShape(item: SceneItem, pos: Point): void {
    const { type, color = "black", size = 10 } = item.features as {
      type: string;
      color?: string;
      size?: number;
    };

    this.ctx.fillStyle = color;
    this.ctx.beginPath();

    if (type === "circle") {
      this.ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2);
    } else if (type === "square") {
      this.ctx.rect(pos.x - size / 2, pos.y - size / 2, size, size);
    }

    this.ctx.fill();
  }
}
