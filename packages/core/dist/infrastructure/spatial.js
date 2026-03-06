export class SpatialLayoutManager {
    /**
     * Generates a set of slot positions based on a template.
     */
    generateSlots(args) {
        switch (args.template) {
            case "circular":
                return this.generateCircularSlots(args);
            case "grid":
                return this.generateGridSlots(args);
            case "random":
                return this.generateRandomSlots(args);
            default:
                throw new Error(`Unknown spatial template: ${args.template}`);
        }
    }
    generateCircularSlots(args) {
        const { count, radius = 100, centerX = 0, centerY = 0, startAngle = 0 } = args;
        const slots = [];
        const step = (2 * Math.PI) / count;
        for (let i = 0; i < count; i++) {
            const angle = startAngle + i * step;
            slots.push({
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
            });
        }
        return slots;
    }
    generateGridSlots(args) {
        const { count, cols = Math.ceil(Math.sqrt(count)), spacingX = 50, spacingY = 50, centerX = 0, centerY = 0 } = args;
        const slots = [];
        const rows = Math.ceil(count / cols);
        const totalWidth = (cols - 1) * spacingX;
        const totalHeight = (rows - 1) * spacingY;
        const startX = centerX - totalWidth / 2;
        const startY = centerY - totalHeight / 2;
        for (let i = 0; i < count; i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;
            slots.push({
                x: startX + c * spacingX,
                y: startY + r * spacingY,
            });
        }
        return slots;
    }
    generateRandomSlots(args) {
        const { count, bounds = { width: 100, height: 100 }, slotSize = { width: 10, height: 10 }, padding = 0, maxAttempts = 1000, rng } = args;
        if (!rng)
            throw new Error("RNG is required for random layout");
        const slots = [];
        const minDistanceX = slotSize.width + padding;
        const minDistanceY = slotSize.height + padding;
        for (let i = 0; i < count; i++) {
            let placed = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const x = rng.next() * (bounds.width - slotSize.width);
                const y = rng.next() * (bounds.height - slotSize.height);
                const overlaps = slots.some((s) => {
                    return Math.abs(s.x - x) < minDistanceX && Math.abs(s.y - y) < minDistanceY;
                });
                if (!overlaps) {
                    slots.push({ x, y });
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                throw new Error(`Failed to place all slots after ${maxAttempts} attempts.`);
            }
        }
        return slots;
    }
}
//# sourceMappingURL=spatial.js.map