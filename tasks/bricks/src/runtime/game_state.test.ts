import { describe, expect, it } from 'vitest';
import { GameState } from './game_state.js';
import { getBrickVisibleWidth } from './brick_logic.js';

const buildConfig = () => ({
  display: {
    canvasWidth: 1200,
    canvasHeight: 760,
    beltHeight: 56,
    beltGap: 50,
    brickWidth: 80,
    brickHeight: 36,
    brickColor: '#fbbf24',
    brickBorderColor: '#111827'
  },
  conveyors: {
    nConveyors: 1,
    lengthPx: { type: 'fixed', value: 1000 },
    speedPxPerSec: { type: 'fixed', value: 30 }
  },
  bricks: {
    completionMode: 'hover_to_clear',
    completionParams: {},
    initialBricks: { type: 'fixed', value: 0 },
    forcedSet: [
      {
        conveyorIndex: 0,
        x: 100,
        width: 100
      }
    ],
    spawn: {
      ratePerSec: { type: 'fixed', value: 0 },
      interSpawnDist: null,
      minSpacingPx: 0,
      byConveyor: true,
      maxActivePerConveyor: 1
    },
    maxBricksPerTrial: 1
  },
  trial: {
    mode: 'max_bricks'
  }
});

describe('GameState hover_to_clear dynamics', () => {
  it('keeps the visible right edge fixed while hovered at matched process rate', () => {
    const gameState: any = new GameState(buildConfig(), { seed: 1 });
    const brick: any = Array.from(gameState.bricks.values())[0];
    expect(brick).toBeTruthy();

    const initialVisibleWidth = getBrickVisibleWidth(brick, 'hover_to_clear');
    const initialRightEdge = brick.x + initialVisibleWidth;

    brick.isHovered = true;
    gameState.step(1000);

    const updated: any = gameState.bricks.get(brick.id);
    expect(updated).toBeTruthy();
    const nextVisibleWidth = getBrickVisibleWidth(updated, 'hover_to_clear');
    const nextRightEdge = updated.x + nextVisibleWidth;

    expect(updated.x).toBeCloseTo(130, 6);
    expect(updated.clearProgress).toBeCloseTo(0.3, 6);
    expect(nextRightEdge).toBeCloseTo(initialRightEdge, 6);
  });
});
