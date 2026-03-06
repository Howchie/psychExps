export class SceneRenderer {
    canvas;
    ctx;
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }
    /**
     * Renders the scene into the provided slots.
     */
    render(scene, slots, options = {}) {
        if (options.clear !== false) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        for (let i = 0; i < scene.items.length; i++) {
            const item = scene.items[i];
            const slot = slots[i];
            if (!slot)
                continue;
            this.renderItem(item, slot);
        }
    }
    renderItem(item, pos) {
        if (item.category === "shape") {
            this.renderShape(item, pos);
        }
        // TODO: Support image rendering if item has image features
    }
    renderShape(item, pos) {
        const { type, color = "black", size = 10 } = item.features;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        if (type === "circle") {
            this.ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2);
        }
        else if (type === "square") {
            this.ctx.rect(pos.x - size / 2, pos.y - size / 2, size, size);
        }
        this.ctx.fill();
    }
}
//# sourceMappingURL=sceneRenderer.js.map