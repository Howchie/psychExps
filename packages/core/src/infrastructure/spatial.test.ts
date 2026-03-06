import { describe, it, expect } from "vitest";
import { SpatialLayoutManager } from "./spatial";
import { SeededRandom } from "./random";

describe("SpatialLayoutManager", () => {
  const manager = new SpatialLayoutManager();
  const rng = new SeededRandom("test");

  describe("circular template", () => {
    it("should generate slots in a circular arrangement", () => {
      const slots = manager.generateSlots({
        template: "circular",
        count: 4,
        radius: 100,
        centerX: 0,
        centerY: 0,
      });

      expect(slots).toHaveLength(4);
      // Compass points check (roughly)
      expect(slots[0].x).toBeCloseTo(100);
      expect(slots[0].y).toBeCloseTo(0);
      expect(slots[1].x).toBeCloseTo(0);
      expect(slots[1].y).toBeCloseTo(100);
    });
  });

  describe("random layout with overlap prevention", () => {
    it("should generate non-overlapping random slots", () => {
      const area = { width: 400, height: 400 };
      const slotSize = { width: 50, height: 50 };
      const slots = manager.generateSlots({
        template: "random",
        count: 10,
        bounds: area,
        slotSize,
        padding: 10,
        rng,
      });

      expect(slots).toHaveLength(10);

      // Verify no overlaps
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const s1 = slots[i];
          const s2 = slots[j];
          const dx = Math.abs(s1.x - s2.x);
          const dy = Math.abs(s1.y - s2.y);
          // Distance must be > size + padding
          expect(dx >= slotSize.width + 10 || dy >= slotSize.height + 10).toBe(true);
        }
      }
    });

    it("should throw if it cannot place all slots after max attempts", () => {
      const area = { width: 100, height: 100 };
      const slotSize = { width: 60, height: 60 };
      
      expect(() => manager.generateSlots({
        template: "random",
        count: 4, // Impossible to fit 4 60x60 in 100x100 without overlap
        bounds: area,
        slotSize,
        rng,
      })).toThrow(/Failed to place all slots/);
    });
  });
});
