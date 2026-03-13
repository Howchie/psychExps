import { describe, expect, test } from 'vitest';
import { ConveyorRenderer } from './renderer_pixi.js';
const makeRenderer = () => new ConveyorRenderer({
    display: {
        canvasWidth: 800,
        canvasHeight: 400,
        brickTextureOverlay: {
            enable: true,
            pattern: 'wood_planks',
        },
    },
    conveyors: {
        nConveyors: 1,
    },
});
describe('brick texture style resolution', () => {
    test('parcel_label resolves to cardboard block pattern', () => {
        const renderer = makeRenderer();
        const cfg = renderer._resolveBrickTextureOverlayConfig({ textureStyle: 'parcel_label' });
        expect(cfg?.pattern).toBe('cardboard_block');
    });
    test('parcel-label alias resolves to cardboard block pattern', () => {
        const renderer = makeRenderer();
        const cfg = renderer._resolveBrickTextureOverlayConfig({ textureStyle: 'parcel-label' });
        expect(cfg?.pattern).toBe('cardboard_block');
    });
    test('checkerboard style resolves to checkerboard pattern', () => {
        const renderer = makeRenderer();
        const cfg = renderer._resolveBrickTextureOverlayConfig({ textureStyle: 'checkerboard' });
        expect(cfg?.pattern).toBe('checkerboard');
    });
});
//# sourceMappingURL=renderer_pixi.texture_styles.test.js.map