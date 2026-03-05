// @ts-nocheck
import * as PIXI from 'pixi.js';
import { brickProgressTint, getBrickVisibleWidth } from './brick_logic.js';
import { buildHUDLines } from './hud.js';
import { getOrCreateProceduralTexture, loadCachedImageTexture, makeMaterialKey } from './material_cache.js';

// Helper to convert CSS color strings or numeric values into Pixi-compatible numbers
const toPixiColor = (value) => PIXI.Color.shared.setValue(value ?? 0xffffff).toNumber();
const normalizeBrickShape = (rawShape) => {
  if (typeof rawShape !== 'string') {
    return 'rounded_rect';
  }
  const normalized = rawShape.trim().toLowerCase();
  if (!normalized) {
    return 'rounded_rect';
  }
  const aliases = {
    square: 'rect',
    rectangle: 'rect',
    rounded: 'rounded_rect',
    rounded_rectangle: 'rounded_rect'
  };
  return aliases[normalized] ?? normalized;
};

const normalizeTextureStyleId = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const BUILTIN_BRICK_TEXTURE_STYLES = {
  crate: {
    pattern: 'wood_planks',
    baseFillColor: '#8b6f4e',
    baseFillAlpha: 1,
    alpha: 0.95,
    plankCount: 3,
    grainCount: 5,
    seamColor: '#3b2f22',
    highlightColor: '#f5e9d8',
  },
  other_crate: {
    pattern: 'wood_planks',
    baseFillColor: '#7a6044',
    baseFillAlpha: 1,
    alpha: 0.96,
    plankCount: 3,
    seamWidthPx: 1,
    grainCount: 5,
    nailRadiusPx: 1.1,
    insetPx: 2,
    topSheenAlpha: 0.16,
    seamColor: '#2f261c',
    highlightColor: '#eadcc8',
  },
  other_steel_case: {
    pattern: 'wood_planks',
    baseFillColor: '#596677',
    baseFillAlpha: 1,
    alpha: 0.9,
    plankCount: 4,
    seamWidthPx: 1,
    grainCount: 1,
    nailRadiusPx: 0.7,
    insetPx: 2,
    topSheenAlpha: 0.2,
    seamColor: '#1f2937',
    highlightColor: '#dbe7f5',
  },
  present: {
    pattern: 'gift_wrap',
    baseFillColor: '#ff2d2d',
    baseFillAlpha: 1,
    alpha: 1,
    ribbonColor: '#ffe14d',
    ribbonAlpha: 1,
    ribbonWidthRatio: 0.2,
    ribbonInsetPx: 2,
    topSheenAlpha: 0.08,
    paperPatternColor: '#ffffff',
    paperPatternAlpha: 0.2,
  },
  target_present: {
    pattern: 'gift_wrap',
    baseFillColor: '#1e40ff',
    baseFillAlpha: 1,
    alpha: 1,
    ribbonColor: '#ffe14d',
    ribbonAlpha: 1,
    ribbonWidthRatio: 0.21,
    ribbonInsetPx: 2,
    topSheenAlpha: 0.1,
    paperPatternColor: '#ffffff',
    paperPatternAlpha: 0.2,
  },
  target_teal_present: {
    pattern: 'gift_wrap',
    baseFillColor: '#00a34a',
    baseFillAlpha: 1,
    alpha: 1,
    ribbonColor: '#ff3b30',
    ribbonAlpha: 0.96,
    ribbonWidthRatio: 0.2,
    ribbonInsetPx: 2,
    topSheenAlpha: 0.1,
    paperPatternColor: '#ffffff',
    paperPatternAlpha: 0.2,
  },
  neutral_tote: {
    pattern: 'wood_planks',
    baseFillColor: '#6b7280',
    baseFillAlpha: 0.86,
    alpha: 0.5,
    plankCount: 2,
    seamWidthPx: 1,
    grainCount: 2,
    nailRadiusPx: 0.8,
    insetPx: 3,
    topSheenAlpha: 0.26,
    seamColor: '#374151',
    highlightColor: '#e5e7eb',
  },
  pizza: {
    pattern: 'pizza',
    baseFillColor: '#e2b07b',
    baseFillAlpha: 1,
    alpha: 1,
    sliceCount: 6,
    toppingCount: 7,
    crustColor: '#a16207',
    sauceColor: '#b91c1c',
    cheeseColor: '#facc15',
    toppingColor: '#7f1d1d',
    sliceLineColor: '#7c2d12',
  },
  target_pizza: {
    pattern: 'pizza',
    baseFillColor: '#e2b07b',
    baseFillAlpha: 1,
    alpha: 1,
    sliceCount: 8,
    toppingCount: 9,
    crustColor: '#92400e',
    sauceColor: '#b91c1c',
    cheeseColor: '#fde047',
    toppingColor: '#7f1d1d',
    sliceLineColor: '#7c2d12',
  },
  box: {
    pattern: 'wood_planks',
    baseFillColor: '#8a6b4d',
    baseFillAlpha: 1,
    alpha: 0.95,
    plankCount: 2,
    seamWidthPx: 1,
    grainCount: 4,
    nailRadiusPx: 1,
    insetPx: 2,
    topSheenAlpha: 0.2,
    seamColor: '#382b1f',
    highlightColor: '#ecddc8',
  },
  crate_damaged: {
    pattern: 'wood_planks',
    baseFillColor: '#74583d',
    baseFillAlpha: 1,
    alpha: 0.96,
    plankCount: 3,
    seamWidthPx: 2,
    grainCount: 7,
    nailRadiusPx: 1.2,
    insetPx: 2,
    topSheenAlpha: 0.12,
    seamColor: '#2a2118',
    highlightColor: '#dbcab2',
  },
  parcel_label: {
    pattern: 'wood_planks',
    baseFillColor: '#8a7a63',
    baseFillAlpha: 1,
    alpha: 0.92,
    plankCount: 2,
    seamWidthPx: 1,
    grainCount: 3,
    nailRadiusPx: 0.9,
    insetPx: 2,
    topSheenAlpha: 0.2,
    seamColor: '#4b3f30',
    highlightColor: '#f0e8dc',
    labelPatch: true,
    labelPatchColor: '#f8fafc',
    labelPatchAlpha: 0.82,
    labelPatchBorderColor: '#334155',
    labelBarcodeColor: '#111827',
  },
  parcel_damaged: {
    pattern: 'wood_planks',
    baseFillColor: '#7a6a54',
    baseFillAlpha: 1,
    alpha: 0.94,
    plankCount: 3,
    seamWidthPx: 1,
    grainCount: 6,
    nailRadiusPx: 1.1,
    insetPx: 2,
    topSheenAlpha: 0.1,
    seamColor: '#3f3428',
    highlightColor: '#e2d5c4',
  },
  chest: {
    pattern: 'wood_planks',
    baseFillColor: '#6d4b31',
    baseFillAlpha: 1,
    alpha: 0.98,
    plankCount: 3,
    seamWidthPx: 1,
    grainCount: 5,
    nailRadiusPx: 1.25,
    insetPx: 2,
    topSheenAlpha: 0.22,
    seamColor: '#2b1e14',
    highlightColor: '#f5d8a6',
    bandColor: '#f1f5f9',
    bandAlpha: 0.3,
    lockPlateColor: '#fef3c7',
    lockPlateAlpha: 0.7,
  },
};

const BUILTIN_END_FURNACE_STYLES = {
  furnace: {},
  crusher: {
    wallColor: '#6b7280',
    wallShadeColor: '#434a55',
    rimColor: '#f3f4f6',
    mouthColor: '#111827',
    emberColor: '#ef4444',
    bodyPanelLines: true,
    hazardStripes: true,
    sideRivets: true,
  },
  shredder: {
    wallColor: '#475569',
    wallShadeColor: '#334155',
    rimColor: '#cbd5e1',
    mouthColor: '#020617',
    emberColor: '#60a5fa',
    bodyPanelLines: true,
    hazardStripes: false,
    sideRivets: true,
  },
  plasma_recycler: {
    wallColor: '#0f172a',
    wallShadeColor: '#1e293b',
    rimColor: '#94a3b8',
    mouthColor: '#020617',
    emberColor: '#a78bfa',
    bodyPanelLines: false,
    hazardStripes: false,
    sideRivets: true,
  },
};

/**
 * ConveyorRenderer
 * -----------------
 * Responsible for all drawing and pointer interactions using PixiJS.
 * - Draws belts, animated bricks, optional visual DRT indicator, and HUD text.
 * - Exposes onBrickClick callback so higher-level logic controls game state.
 *
 * Notes on PixiJS v7 API:
 * - In v7 the Application constructor accepts options directly. We keep the init
 *   routine synchronous to avoid compatibility issues with older sub-versions.
 * - The canvas element can live on `app.view` or `app.canvas`, so we handle both
 *   cases before appending to the DOM.
 */

/**
 * PixiJS renderer responsible for drawing conveyors, bricks, HUD, and optional
 * visual DRT stimuli. Audio DRT is handled by the jsPsych plugin directly.
 */
export class ConveyorRenderer {
  constructor(config, { onBrickClick, onBrickHold, onBrickHover, onPointerDebug, runtimeLengths, seed } = {}) {
    this.config = config;
    this.onBrickClick = typeof onBrickClick === 'function' ? onBrickClick : () => {};
    this.onBrickHold = typeof onBrickHold === 'function' ? onBrickHold : () => {};
    this.onBrickHover = typeof onBrickHover === 'function' ? onBrickHover : () => {};
    this.onPointerDebug = typeof onPointerDebug === 'function' ? onPointerDebug : () => {};
    this.runtimeLengths = Array.isArray(runtimeLengths) ? runtimeLengths.slice() : null;
    this.app = null;
    this.root = null;
    this.brickSprites = new Map();
    this.hudElements = {};
    this.hudBackground = null;
    this.drtGraphics = null;
    this.backgroundTexture = null;
    this.backgroundTextureOwned = false;
    this.backgroundVisual = null;
    this.beltTexture = null;
    this.beltTextureOwned = false;
    this.beltVisuals = [];
    this.interactionLayer = null;
    this.conveyorZones = new Map();
    this.bricksByConveyor = new Map();
    this.conveyorHoldStart = new Map();
    this.conveyorHovered = new Set();
    this.conveyorHoverTarget = new Map();
    this.conveyorPointerPos = new Map();
    this.effectVisuals = [];
    this.dueMarkerAnchors = new Map();
    this.furnaceAnchors = new Map();
    this.furnaceVisuals = new Map();
    this.furnaceFlickerTimeMs = 0;
    this.spotlightGraphics = null;
    this.spotlightRing = null;
    this.activeBrickId = null;
    this.brickHoldStart = new Map();
    this.pointerDebugEnabled = Boolean(config?.debug?.pointerOverlay || config?.debug?.pointerConsole);
    this.pointerDebugLines = [];
    this.pointerDebugText = null;
    this.pointerDebugSeq = 0;
    this.seed = Number.isFinite(Number(seed)) ? (Number(seed) >>> 0) : 0x9e3779b9;
    this._rngState = this.seed || 0x9e3779b9;
  }

  _nextRand() {
    // xorshift32 PRNG for deterministic renderer-side procedural visuals.
    let x = this._rngState >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this._rngState = x >>> 0;
    return (this._rngState >>> 0) / 0x100000000;
  }

  async init(container) {
    if (!container) {
      throw new Error('Renderer requires a DOM container.');
    }
    this.root = container;
    const perfCfg = this.config?.display?.performance || {};
    const configuredMaxDpr = Number(perfCfg.maxDevicePixelRatio ?? 2);
    const maxDpr = Number.isFinite(configuredMaxDpr) ? Math.max(1, configuredMaxDpr) : 2;
    const resolution = Math.max(1, Math.min(window.devicePixelRatio || 1, maxDpr));
    // Initialize Pixi Application (v7 pattern)
    this.app = new PIXI.Application({
      width: this.config.display.canvasWidth,
      height: this.config.display.canvasHeight,
      backgroundColor: toPixiColor(this.config.display.backgroundColor),
      antialias: true,
      autoDensity: true,
      resolution,
    });
    container.innerHTML = '';
    const view = this.app.view || this.app.canvas || null;
    if (view) {
      container.appendChild(view);
    }

    this.beltLayer = new PIXI.Container();
    this.interactionLayer = new PIXI.Container();
    this.backgroundLayer = new PIXI.Container();
    this.brickLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();
    this.spotlightLayer = new PIXI.Container();
    this.hudLayer = new PIXI.Container();
    this.drtLayer = new PIXI.Container();

    this.app.stage.addChild(this.backgroundLayer);
    this.app.stage.addChild(this.beltLayer);
    this.app.stage.addChild(this.interactionLayer);
    this.app.stage.addChild(this.brickLayer);
    this.app.stage.addChild(this.effectLayer);
    this.app.stage.addChild(this.spotlightLayer);
    this.app.stage.addChild(this.drtLayer);
    this.app.stage.addChild(this.hudLayer);

    await this._prepareBackgroundTexture();
    await this._prepareBeltTexture();
    this._drawBackground();
    this._drawBelts();
    this._setupHUD();
    this._setupPointerDebug();
  }

  _setupPointerDebug() {
    if (!this.pointerDebugEnabled || !this.app || !this.app.stage) {
      return;
    }
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = new PIXI.Rectangle(0, 0, this.config.display.canvasWidth, this.config.display.canvasHeight);

    stage.on('pointerdown', (e) => this._emitPointerDebug('stage_pointerdown', null, e));
    stage.on('pointerup', (e) => this._emitPointerDebug('stage_pointerup', null, e));
    stage.on('pointerupoutside', (e) => this._emitPointerDebug('stage_pointerupoutside', null, e));

    if (this.config?.debug?.pointerOverlay) {
      const text = new PIXI.Text('', {
        fill: 0x111827,
        fontSize: 12,
        fontFamily: 'monospace',
        align: 'left'
      });
      text.x = 8;
      text.y = Math.max(40, this.config.display.canvasHeight - 150);
      text.alpha = 0.92;
      text.zIndex = 9999;
      this.hudLayer.addChild(text);
      this.pointerDebugText = text;
      this._updatePointerDebugOverlay();
    }
  }

  _emitPointerDebug(type, brickId, e, extra = {}) {
    if (!this.pointerDebugEnabled) {
      return;
    }
    const x = (e && (e.globalX ?? (e.global && e.global.x))) ?? null;
    const y = (e && (e.globalY ?? (e.global && e.global.y))) ?? null;
    const payload = {
      seq: ++this.pointerDebugSeq,
      type,
      brick_id: brickId ?? null,
      x,
      y,
      ...extra
    };
    this.onPointerDebug(payload);
    const line = `${String(payload.seq).padStart(3, '0')} ${type} b=${payload.brick_id ?? '-'} x=${x ?? '-'} y=${y ?? '-'}`;
    this.pointerDebugLines.push(line);
    if (this.pointerDebugLines.length > 8) {
      this.pointerDebugLines.shift();
    }
    this._updatePointerDebugOverlay();
  }

  _updatePointerDebugOverlay() {
    if (!this.pointerDebugText) {
      return;
    }
    const lines = this.pointerDebugLines.length > 0
      ? this.pointerDebugLines
      : ['pointer debug armed; waiting for events...'];
    this.pointerDebugText.text = `POINTER DEBUG\n${lines.join('\n')}`;
  }

  async _prepareBeltTexture() {
    try {
      const texCfg = this.config?.display?.beltTexture || {};
      if (!texCfg.enable) {
        this.beltTexture = null;
        this.beltTextureOwned = false;
        return;
      }
      const renderMode = String(texCfg.renderMode ?? 'image').toLowerCase();
      if (renderMode === 'procedural_topdown') {
        const key = makeMaterialKey(
          'belt:procedural_topdown',
          texCfg.proceduralTopdown || {},
          (this.seed ^ 0x7f4a7c15) >>> 0
        );
        this.beltTexture = getOrCreateProceduralTexture(this.app?.renderer, key, () =>
          this._buildProceduralTopdownBeltTexture(texCfg.proceduralTopdown || {})
        );
        this.beltTextureOwned = false;
        return;
      }
      const src = texCfg.src || 'assets/belt-texture.png';
      this.beltTexture = await loadCachedImageTexture(src);
      this.beltTextureOwned = false;
    } catch (error) {
      console.warn('Failed to load belt texture; falling back to solid fill.', error);
      this.beltTexture = null;
      this.beltTextureOwned = false;
    }
  }

  _buildProceduralTopdownBeltTexture(styleCfg = {}) {
    if (!this.app?.renderer) {
      return null;
    }
    const tileSize = Math.max(48, Number(styleCfg.tileSizePx ?? 120));
    const ribStep = Math.max(6, Number(styleCfg.ribStepPx ?? 12));
    const ribWidth = Math.max(2, Math.min(ribStep - 1, Number(styleCfg.ribWidthPx ?? 8)));
    const sideBand = Math.max(4, Number(styleCfg.sideBandPx ?? Math.round(tileSize * 0.16)));
    const sideCleatStep = Math.max(8, Number(styleCfg.sideCleatStepPx ?? 16));
    const sideCleatLen = Math.max(4, Number(styleCfg.sideCleatLengthPx ?? Math.round(sideCleatStep * 0.75)));
    const shadeAlpha = Math.max(0, Math.min(1, Number(styleCfg.shadeAlpha ?? 0.55)));
    const g = new PIXI.Graphics();
    const beltBase = toPixiColor(styleCfg.baseColor ?? '#2a323b');
    const beltShade = toPixiColor(styleCfg.shadeColor ?? '#202730');
    const ribColor = toPixiColor(styleCfg.ribColor ?? '#4d5863');
    const grooveColor = toPixiColor(styleCfg.grooveColor ?? '#2b333c');
    const sideLineDark = toPixiColor(styleCfg.sideLineDarkColor ?? '#111827');
    const sideLineLight = toPixiColor(styleCfg.sideLineLightColor ?? '#9ca3af');
    const cleatColor = toPixiColor(styleCfg.sideCleatColor ?? '#6b7280');
    const scuffColor = toPixiColor(styleCfg.scuffColor ?? '#cbd5e1');
    const patchColor = toPixiColor(styleCfg.patchColor ?? '#111827');
    const scuffCount = Math.max(0, Math.floor(Number(styleCfg.scuffCount ?? 0)));
    const patchCount = Math.max(0, Math.floor(Number(styleCfg.patchCount ?? 0)));

    g.beginFill(beltBase, 1);
    g.drawRect(0, 0, tileSize, tileSize);
    g.endFill();

    if (shadeAlpha > 0) {
      g.beginFill(beltShade, shadeAlpha);
      g.drawRect(0, Math.floor(tileSize * 0.5), tileSize, Math.ceil(tileSize * 0.5));
      g.endFill();
    }

    for (let x = 0; x < tileSize; x += ribStep) {
      g.beginFill(ribColor, 0.9);
      g.drawRect(x, sideBand + 2, ribWidth, tileSize - sideBand * 2 - 4);
      g.endFill();

      g.beginFill(grooveColor, 0.92);
      g.drawRect(x + ribWidth, sideBand + 2, Math.max(1, ribStep - ribWidth), tileSize - sideBand * 2 - 4);
      g.endFill();
    }

    for (let x = 0; x < tileSize; x += sideCleatStep) {
      g.beginFill(cleatColor, 0.7);
      g.drawRoundedRect(x, Math.max(1, sideBand - 8), sideCleatLen, 6, 1);
      g.drawRoundedRect(x, Math.min(tileSize - 7, tileSize - sideBand + 2), sideCleatLen, 6, 1);
      g.endFill();
    }

    g.beginFill(sideLineDark, 0.65);
    g.drawRect(0, sideBand - 2, tileSize, 2);
    g.drawRect(0, tileSize - sideBand, tileSize, 2);
    g.endFill();

    g.beginFill(sideLineLight, 0.2);
    g.drawRect(0, sideBand, tileSize, 2);
    g.drawRect(0, tileSize - sideBand - 2, tileSize, 2);
    g.endFill();

    for (let i = 0; i < scuffCount; i += 1) {
      const x = Math.floor(this._nextRand() * tileSize);
      const y = Math.floor(this._nextRand() * tileSize);
      const w = Math.max(4, Math.floor(6 + this._nextRand() * 16));
      const h = Math.max(1, Math.floor(1 + this._nextRand() * 2));
      g.beginFill(scuffColor, 0.08 + this._nextRand() * 0.18);
      g.drawRoundedRect(x, y, w, h, 1);
      g.endFill();
    }

    for (let i = 0; i < patchCount; i += 1) {
      const x = Math.floor(this._nextRand() * Math.max(1, tileSize - 18));
      const y = Math.floor(this._nextRand() * Math.max(1, tileSize - 12));
      const w = Math.max(10, Math.floor(10 + this._nextRand() * 16));
      const h = Math.max(5, Math.floor(5 + this._nextRand() * 6));
      g.beginFill(patchColor, 0.14 + this._nextRand() * 0.22);
      g.drawRect(x, y, w, h);
      g.endFill();
      g.beginFill(sideLineLight, 0.18);
      g.drawRect(x + 1, y + 1, Math.max(1, w - 2), 1);
      g.endFill();
    }

    const texture = this.app.renderer.generateTexture(g, {
      region: new PIXI.Rectangle(0, 0, tileSize, tileSize),
      resolution: 1
    });
    g.destroy();
    return texture;
  }

  _buildProceduralWarehouseTexture(styleCfg = {}) {
    if (!this.app?.renderer) {
      return null;
    }
    const tileSize = Math.max(120, Number(styleCfg.tileSizePx ?? 240));
    const paverW = Math.max(36, Number(styleCfg.paverWidthPx ?? 80));
    const paverH = Math.max(36, Number(styleCfg.paverHeightPx ?? 80));
    const grout = Math.max(1, Number(styleCfg.groutPx ?? 3));
    const layout = String(styleCfg.layout ?? 'grid').toLowerCase();
    const useStagger = layout === 'staggered';
    const rowOffsetPx = Number.isFinite(Number(styleCfg.rowOffsetPx))
      ? Math.max(0, Number(styleCfg.rowOffsetPx))
      : Math.floor(paverW * 0.5);
    const variance = Math.max(0, Math.min(1, Number(styleCfg.variation ?? 0.16)));
    const alternatingPattern = String(styleCfg.pattern ?? 'none').toLowerCase() === 'checker_alternating';
    const alternationStrength = Math.max(0, Math.min(1, Number(styleCfg.alternationStrength ?? 0.08)));
    const noiseCount = Math.max(0, Number(styleCfg.noiseCount ?? 28));
    const seamDashCount = Math.max(0, Number(styleCfg.seamDashCount ?? 10));
    const rivetCount = Math.max(0, Number(styleCfg.rivetCount ?? 0));
    const dentCount = Math.max(0, Number(styleCfg.dentCount ?? 0));
    const crackCount = Math.max(0, Number(styleCfg.crackCount ?? 0));

    const baseColor = PIXI.Color.shared.setValue(styleCfg.baseColor ?? '#8e949b').toRgbArray();
    const groutColor = toPixiColor(styleCfg.groutColor ?? '#6f757d');
    const seamDark = toPixiColor(styleCfg.seamDarkColor ?? '#4e5660');
    const seamLight = toPixiColor(styleCfg.seamLightColor ?? '#b0b6bc');
    const scratchColor = toPixiColor(styleCfg.scratchColor ?? '#5f6670');
    const rivetColor = toPixiColor(styleCfg.rivetColor ?? '#d1d5db');
    const edgeShadingAlpha = Math.max(0, Math.min(1, Number(styleCfg.edgeShadingAlpha ?? 0)));

    const toHexRgb = (r, g, b) => ((r << 16) | (g << 8) | b);
    const varyColor = (rgb, amp, bias = 0) => {
      const jitter = ((this._nextRand() * 2) - 1) * amp * 255;
      const delta = jitter + (bias * 255);
      const r = Math.max(0, Math.min(255, Math.round(rgb[0] * 255 + delta)));
      const g = Math.max(0, Math.min(255, Math.round(rgb[1] * 255 + delta)));
      const b = Math.max(0, Math.min(255, Math.round(rgb[2] * 255 + delta)));
      return toHexRgb(r, g, b);
    };

    // Checkerboard tiling must span an even number of cells per texture repeat.
    // Otherwise parity flips at wrap boundaries and creates duplicate bands.
    const colsRaw = Math.max(2, Math.floor(tileSize / paverW));
    const rowsRaw = Math.max(2, Math.floor(tileSize / paverH));
    const cols = colsRaw % 2 === 0 ? colsRaw : colsRaw + 1;
    const rows = rowsRaw % 2 === 0 ? rowsRaw : rowsRaw + 1;
    const texW = cols * paverW;
    const texH = rows * paverH;

    const g = new PIXI.Graphics();
    g.beginFill(varyColor(baseColor, variance * 0.35), 1);
    g.drawRect(0, 0, texW, texH);
    g.endFill();

    for (let y = 0; y < texH; y += paverH) {
      const rowIndex = Math.floor(y / paverH);
      const rowOffset = useStagger && (rowIndex % 2 !== 0) ? rowOffsetPx : 0;
      const startX = useStagger ? -rowOffset : 0;
      for (let xBase = startX; xBase < texW + (useStagger ? paverW : 0); xBase += paverW) {
        const x = Math.max(0, xBase);
        const w = Math.min(paverW, texW - x);
        const h = Math.min(paverH, texH - y);
        if (w <= 0 || h <= 0) {
          continue;
        }
        const colIndex = Math.floor((xBase - startX) / paverW);
        const parity = (rowIndex + colIndex) % 2 === 0 ? 1 : -1;
        const patternBias = alternatingPattern ? (parity * alternationStrength) : 0;
        g.beginFill(varyColor(baseColor, variance, patternBias), 1);
        g.drawRect(x, y, w, h);
        g.endFill();

        if (edgeShadingAlpha > 0) {
          g.beginFill(seamLight, edgeShadingAlpha * (0.6 + this._nextRand() * 0.4));
          g.drawRect(x + 1, y + 1, Math.max(1, w - 2), 1);
          g.endFill();
          g.beginFill(seamDark, edgeShadingAlpha * (0.65 + this._nextRand() * 0.35));
          g.drawRect(x + 1, y + h - 2, Math.max(1, w - 2), 1);
          g.endFill();
        }
      }
    }

    g.beginFill(groutColor, 0.75);
    if (!useStagger) {
      // Strict checkerboard/grid mode: no half-tiles, fully regular grout.
      for (let x = 0; x <= texW; x += paverW) {
        g.drawRect(x, 0, grout, texH);
      }
      for (let y = 0; y <= texH; y += paverH) {
        g.drawRect(0, y, texW, grout);
      }
    } else {
      // Staggered mode keeps per-row shifted grout.
      for (let y = 0; y < texH; y += paverH) {
        const rowIndex = Math.floor(y / paverH);
        const rowOffset = (rowIndex % 2 === 0) ? 0 : rowOffsetPx;
        const yLine = Math.max(0, y);
        g.drawRect(0, yLine, texW, grout);
        for (let x = -rowOffset; x < texW + paverW; x += paverW) {
          const xLine = Math.max(0, x);
          if (xLine < texW) {
            g.drawRect(xLine, yLine, grout, Math.min(paverH + grout, texH - yLine));
          }
        }
      }
    }
    g.endFill();

    // Small seam dashes / wear marks.
    for (let i = 0; i < seamDashCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const w = Math.max(6, Math.floor(this._nextRand() * 18));
      const h = 2;
      g.beginFill(seamDark, 0.18 + this._nextRand() * 0.2);
      g.drawRoundedRect(x, y, w, h, 1);
      g.endFill();
    }

    // Speckle noise / tiny scratches.
    for (let i = 0; i < noiseCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const w = Math.max(1, Math.floor(this._nextRand() * 4));
      const h = Math.max(1, Math.floor(this._nextRand() * 3));
      g.beginFill(scratchColor, 0.07 + this._nextRand() * 0.14);
      g.drawRect(x, y, w, h);
      g.endFill();
    }

    for (let i = 0; i < rivetCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const r = 1 + Math.floor(this._nextRand() * 2);
      g.beginFill(rivetColor, 0.28 + this._nextRand() * 0.26);
      g.drawCircle(x, y, r);
      g.endFill();
      g.beginFill(seamDark, 0.16);
      g.drawCircle(x + 0.5, y + 0.5, Math.max(1, r - 1));
      g.endFill();
    }

    for (let i = 0; i < dentCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const rx = Math.max(3, Math.floor(4 + this._nextRand() * 7));
      const ry = Math.max(2, Math.floor(3 + this._nextRand() * 5));
      g.beginFill(seamDark, 0.06 + this._nextRand() * 0.1);
      g.drawEllipse(x, y, rx, ry);
      g.endFill();
      g.beginFill(seamLight, 0.04 + this._nextRand() * 0.08);
      g.drawEllipse(x - 1, y - 1, Math.max(1, rx - 2), Math.max(1, ry - 2));
      g.endFill();
    }

    for (let i = 0; i < crackCount; i += 1) {
      const x = Math.floor(this._nextRand() * texW);
      const y = Math.floor(this._nextRand() * texH);
      const len = Math.max(8, Math.floor(12 + this._nextRand() * 24));
      const dy = Math.floor((this._nextRand() - 0.5) * 8);
      g.beginFill(seamDark, 0.2 + this._nextRand() * 0.16);
      g.drawRect(x, y, len, 1);
      g.drawRect(x + Math.floor(len * 0.45), y + dy, Math.max(2, Math.floor(len * 0.28)), 1);
      g.endFill();
    }

    const texture = this.app.renderer.generateTexture(g, {
      region: new PIXI.Rectangle(0, 0, texW, texH),
      resolution: 1
    });
    g.destroy();
    return texture;
  }

  _drawBelts() {
    const { beltColor, beltHeight, beltGap, canvasHeight } = this.config.display;
    const n = this.config.conveyors.nConveyors;
    const totalHeight = n * beltHeight + (n - 1) * beltGap;
    const topOffset = (canvasHeight - totalHeight) / 2;
    const runtimeLengths = Array.isArray(this.runtimeLengths)
      ? this.runtimeLengths
      : Array.isArray(this.config.conveyors.runtimeLengths)
        ? this.config.conveyors.runtimeLengths
      : null;
    const fallbackLength = (() => {
      const spec = this.config.conveyors.lengthPx;
      if (typeof spec === 'number') {
        return spec;
      }
      if (spec && typeof spec === 'object') {
        const value = Number(spec.value);
        if (Number.isFinite(value)) {
          return value;
        }
      }
      return this.config.display.canvasWidth;
    })();
    this.beltLayer.removeChildren();
    this.interactionLayer?.removeChildren?.();
    this.conveyorZones.clear();
    this.beltVisuals = [];
    this.dueMarkerAnchors.clear();
    this.furnaceAnchors.clear();
    this.furnaceVisuals.clear();
    const useTexture = !!this.beltTexture && (this.config?.display?.beltTexture?.enable === true);
    const alpha = Number(this.config?.display?.beltTexture?.alpha ?? 1);
    const scaleX = Number(this.config?.display?.beltTexture?.scaleX ?? this.config?.display?.beltTexture?.scale ?? 1);
    const scaleY = Number(this.config?.display?.beltTexture?.scaleY ?? this.config?.display?.beltTexture?.scale ?? 1);
    const pixelSnap = this.config?.display?.beltTexture?.pixelSnap !== false;
    const tint = this.config?.display?.beltTexture?.tint ?? null;
    for (let i = 0; i < n; i += 1) {
      const y = topOffset + i * (beltHeight + beltGap);
      const sampledLength =
        runtimeLengths && Number.isFinite(runtimeLengths[i])
          ? runtimeLengths[i]
          : fallbackLength;
      const length = Math.max(0, sampledLength);
      if (useTexture) {
        let sprite;
        try {
          sprite = new PIXI.TilingSprite({ texture: this.beltTexture, width: length, height: beltHeight });
        } catch (_) {
          sprite = new PIXI.TilingSprite(this.beltTexture, length, beltHeight);
        }
        sprite.x = 0;
        sprite.y = y;
        sprite.roundPixels = pixelSnap;
        sprite.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
        if (tint) {
          sprite.tint = toPixiColor(tint);
        }
        // Control density of pattern.
        try {
          // Auto-scale texture to fit belt height, preserving aspect ratio.
          const baseScale = beltHeight / sprite.texture.height;
          sprite.tileScale.set(baseScale * scaleX, baseScale * scaleY);
        } catch (_) {
          // Older Pixi versions may use different APIs; ignore.
        }
        try {
          // Reset tile origin so scrolling starts aligned.
          sprite.tilePosition.set(0, 0);
        } catch (_) {
          // ignore
        }
        this.beltLayer.addChild(sprite);
        this.beltVisuals.push({ type: 'tiling', node: sprite, offsetX: 0, pixelSnap });
      } else {
        const g = new PIXI.Graphics();
        g.beginFill(toPixiColor(beltColor));
        g.drawRoundedRect(0, y, length, beltHeight, 12);
        g.endFill();
        this.beltLayer.addChild(g);
      this.beltVisuals.push({ type: 'solid', node: g, offsetX: 0, pixelSnap: false });
      }
      const markerCfg = this.config.display?.dueDateMarker || {};
      if (markerCfg.enable === true) {
        const marker = new PIXI.Graphics();
        const markerColor = toPixiColor(markerCfg.color ?? '#f5f6fa');
        const markerWidth = Math.max(1, Number(markerCfg.widthPx ?? 3));
        const markerHeight = Math.max(10, Number(markerCfg.heightPx ?? Math.floor(beltHeight * 0.5)));
        const markerY = y + (beltHeight - markerHeight) / 2;
        const markerAlpha = Math.max(0.1, Math.min(1, Number(markerCfg.alpha ?? 0.95)));
        marker.beginFill(markerColor, markerAlpha);
        marker.drawRoundedRect(length - markerWidth / 2, markerY, markerWidth, markerHeight, Math.min(3, markerWidth / 2));
        marker.endFill();
        this.beltLayer.addChild(marker);
        this.dueMarkerAnchors.set(`c${i}`, {
          x: length,
          y: markerY + markerHeight / 2,
          width: markerWidth,
          height: markerHeight
        });
      }
      this._drawEndFurnace(`c${i}`, y, beltHeight, length);
      this._drawConveyorZone(`c${i}`, y, length, beltHeight);
    }
  }

  _isConveyorHitAreaEnabled() {
    const interactionCfg = this.config?.bricks?.interaction || {};
    const setting = interactionCfg.conveyorWideHitArea;
    if (typeof setting === 'boolean') {
      return setting;
    }
    if (setting && typeof setting === 'object') {
      return setting.enable === true;
    }
    return false;
  }

  _extractPointerPosition(e) {
    return {
      x: (e && (e.globalX ?? (e.global && e.global.x))) ?? null,
      y: (e && (e.globalY ?? (e.global && e.global.y))) ?? null
    };
  }

  _getConveyorTargetBrickId(conveyorId) {
    const entries = this.bricksByConveyor.get(String(conveyorId)) || [];
    return entries.length ? entries[0].id : null;
  }

  _drawConveyorZone(conveyorId, beltY, beltLength, beltHeight) {
    if (!this.interactionLayer || !this._isConveyorHitAreaEnabled()) {
      return;
    }
    const zone = new PIXI.Graphics();
    // Near-transparent interaction surface covering full lane width.
    zone.beginFill(0xffffff, 0.001);
    zone.drawRect(0, beltY, Math.max(1, Number(beltLength) || 1), Math.max(1, Number(beltHeight) || 1));
    zone.endFill();
    zone.eventMode = 'dynamic';
    zone.cursor = 'pointer';
    zone.conveyorId = String(conveyorId);

    const endConveyorHold = (e) => {
      const cid = zone.conveyorId;
      const mode = this.config?.bricks?.completionMode;
      const holdState = this.conveyorHoldStart.get(cid);
      if (mode !== 'hold_duration' || !holdState) {
        return;
      }
      this.conveyorHoldStart.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      const holdDurationMs = Math.max(0, performance.now() - holdState.t);
      this._emitPointerDebug('conveyor_hold_end', holdState.brickId, e, { conveyor_id: cid, hold_ms: Math.round(holdDurationMs) });
      this.onBrickHold(holdState.brickId, holdDurationMs, pos.x, pos.y);
    };

    zone.on('pointerdown', (e) => {
      const cid = zone.conveyorId;
      const mode = this.config?.bricks?.completionMode;
      const targetBrickId = this._getConveyorTargetBrickId(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (!targetBrickId) {
        this._emitPointerDebug('conveyor_pointerdown_no_target', null, e, { conveyor_id: cid });
        return;
      }
      if (mode === 'hold_duration') {
        this.conveyorHoldStart.set(cid, {
          brickId: targetBrickId,
          t: performance.now()
        });
        this._emitPointerDebug('conveyor_hold_begin', targetBrickId, e, { conveyor_id: cid });
      } else {
        this._emitPointerDebug('conveyor_click', targetBrickId, e, { conveyor_id: cid });
        this.onBrickClick(targetBrickId, pos.x, pos.y);
      }
    });
    zone.on('pointerup', endConveyorHold);
    zone.on('pointerupoutside', endConveyorHold);
    zone.on('pointerout', (e) => {
      const cid = zone.conveyorId;
      endConveyorHold(e);
      if (this.config?.bricks?.completionMode !== 'hover_to_clear') {
        return;
      }
      this.conveyorHovered.delete(cid);
      const prev = this.conveyorHoverTarget.get(cid);
      this.conveyorHoverTarget.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (prev) {
        this._emitPointerDebug('conveyor_hover_end', prev, e, { conveyor_id: cid });
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
    });
    zone.on('pointerleave', (e) => {
      const cid = zone.conveyorId;
      this.conveyorHovered.delete(cid);
      const prev = this.conveyorHoverTarget.get(cid);
      this.conveyorHoverTarget.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (prev && this.config?.bricks?.completionMode === 'hover_to_clear') {
        this._emitPointerDebug('conveyor_hover_end', prev, e, { conveyor_id: cid });
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
      endConveyorHold(e);
    });
    zone.on('pointercancel', (e) => {
      const cid = zone.conveyorId;
      this.conveyorHovered.delete(cid);
      const prev = this.conveyorHoverTarget.get(cid);
      this.conveyorHoverTarget.delete(cid);
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      if (prev && this.config?.bricks?.completionMode === 'hover_to_clear') {
        this._emitPointerDebug('conveyor_hover_end', prev, e, { conveyor_id: cid });
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
      endConveyorHold(e);
    });
    zone.on('pointerover', (e) => {
      if (this.config?.bricks?.completionMode !== 'hover_to_clear') {
        return;
      }
      const cid = zone.conveyorId;
      const pos = this._extractPointerPosition(e);
      this.conveyorPointerPos.set(cid, pos);
      this.conveyorHovered.add(cid);
      const next = this._getConveyorTargetBrickId(cid);
      if (!next) {
        return;
      }
      const prev = this.conveyorHoverTarget.get(cid);
      if (prev === next) {
        return;
      }
      if (prev) {
        this.onBrickHover(prev, false, pos.x, pos.y);
      }
      this.conveyorHoverTarget.set(cid, next);
      this._emitPointerDebug('conveyor_hover_begin', next, e, { conveyor_id: cid });
      this.onBrickHover(next, true, pos.x, pos.y);
    });

    this.interactionLayer.addChild(zone);
    this.conveyorZones.set(String(conveyorId), zone);
  }

  _drawEndFurnace(conveyorId, beltY, beltHeight, beltLength) {
    const cfgRaw = this.config?.display?.endFurnace || {};
    const rawStyleId = normalizeTextureStyleId(cfgRaw?.style ?? '');
    const styleId = rawStyleId === 'incinerator' ? 'furnace' : rawStyleId;
    const styleCfg = BUILTIN_END_FURNACE_STYLES[styleId] || {};
    const cfg = { ...styleCfg, ...cfgRaw, style: styleId || cfgRaw?.style };
    if (cfg.enable === false) {
      return;
    }
    const bodyWidth = Math.max(20, Number(cfg.widthPx ?? Math.round(beltHeight * 0.8)));
    const bodyHeight = Math.max(18, Number(cfg.heightPx ?? Math.round(beltHeight * 0.9)));
    const bodyX = Number(beltLength) + Number(cfg.offsetX ?? 6);
    const bodyY = Number(beltY) + (beltHeight - bodyHeight) / 2;

    const wallColor = toPixiColor(cfg.wallColor ?? '#334155');
    const wallShadeColor = toPixiColor(cfg.wallShadeColor ?? '#1e293b');
    const rimColor = toPixiColor(cfg.rimColor ?? '#94a3b8');
    const mouthColor = toPixiColor(cfg.mouthColor ?? '#0f172a');
    const emberColor = toPixiColor(cfg.emberColor ?? '#f97316');
    const style = normalizeTextureStyleId(cfg.style ?? '');
    const showPanelLines = cfg.bodyPanelLines !== false;
    const showHazardStripes = cfg.hazardStripes === true;
    const showSideRivets = cfg.sideRivets === true;

    const mouthWidth = Math.max(8, Math.floor(bodyWidth * 0.38));
    const mouthHeight = Math.max(8, Math.floor(bodyHeight * 0.42));
    // Belts move left->right; place intake on the belt-facing (left) side.
    const mouthX = bodyX + 3;
    const mouthY = bodyY + (bodyHeight - mouthHeight) / 2;

    const g = new PIXI.Graphics();
    // Pixel-like furnace body.
    g.beginFill(wallColor, 1);
    g.drawRect(bodyX, bodyY, bodyWidth, bodyHeight);
    g.endFill();
    g.beginFill(wallShadeColor, 1);
    g.drawRect(bodyX, bodyY + bodyHeight - 5, bodyWidth, 5);
    g.endFill();

    if (showPanelLines) {
      g.beginFill(wallShadeColor, 0.6);
      g.drawRect(bodyX + Math.floor(bodyWidth * 0.32), bodyY + 3, 1, Math.max(2, bodyHeight - 6));
      g.drawRect(bodyX + Math.floor(bodyWidth * 0.62), bodyY + 3, 1, Math.max(2, bodyHeight - 6));
      g.endFill();
    }

    g.beginFill(rimColor, 1);
    g.drawRect(bodyX, bodyY, bodyWidth, 3);
    g.drawRect(bodyX + 2, bodyY + 4, 3, 3);
    g.drawRect(bodyX + 2, bodyY + bodyHeight - 8, 3, 3);
    g.endFill();

    if (showSideRivets) {
      g.beginFill(rimColor, 0.85);
      for (let i = 0; i < 3; i += 1) {
        const ry = bodyY + 6 + i * Math.max(6, Math.floor((bodyHeight - 12) / 2));
        g.drawCircle(bodyX + bodyWidth - 4, ry, 1.1);
      }
      g.endFill();
    }

    // Intake lip so the opening reads as the belt endpoint target.
    g.beginFill(rimColor, 0.95);
    g.drawRect(bodyX - 2, mouthY - 1, 3, mouthHeight + 2);
    g.endFill();

    if (showHazardStripes) {
      const hazardA = toPixiColor(cfg.hazardColorA ?? '#f59e0b');
      const hazardB = toPixiColor(cfg.hazardColorB ?? '#111827');
      const stripeH = 2;
      for (let sy = mouthY - 2; sy < mouthY + mouthHeight + 2; sy += stripeH) {
        const isAlt = Math.floor((sy - mouthY) / stripeH) % 2 !== 0;
        g.beginFill(isAlt ? hazardB : hazardA, 0.85);
        g.drawRect(bodyX - 4, sy, 2, stripeH);
        g.endFill();
      }
    }

    // Mouth.
    g.beginFill(mouthColor, 1);
    g.drawRect(mouthX, mouthY, mouthWidth, mouthHeight);
    g.endFill();
    this.beltLayer.addChild(g);

    // Keep hot-core/glow as separate nodes so they can flicker over time.
    const ember = new PIXI.Graphics();
    ember.beginFill(emberColor, 0.95);
    ember.drawRect(mouthX + 2, mouthY + 2, Math.max(2, mouthWidth - 4), Math.max(2, mouthHeight - 4));
    ember.endFill();
    this.beltLayer.addChild(ember);

    const core = new PIXI.Graphics();
    const coreColor = style === 'plasma_recycler' ? 0x93c5fd : 0xfbbf24;
    core.beginFill(coreColor, 0.75);
    core.drawRect(mouthX + 3, mouthY + 3, Math.max(1, mouthWidth - 8), Math.max(1, mouthHeight - 8));
    core.endFill();
    this.beltLayer.addChild(core);

    const intakeGlow = new PIXI.Graphics();
    intakeGlow.beginFill(emberColor, 0.28);
    intakeGlow.drawRect(mouthX - 3, mouthY + 2, 3, Math.max(2, mouthHeight - 4));
    intakeGlow.endFill();
    this.beltLayer.addChild(intakeGlow);

    let jawTop = null;
    let jawBottom = null;
    let rotor = null;
    let halo = null;
    const mouthCx = mouthX + mouthWidth * 0.5;
    const mouthCy = mouthY + mouthHeight * 0.5;

    if (style === 'crusher') {
      jawTop = new PIXI.Graphics();
      jawTop.beginFill(rimColor, 0.9);
      jawTop.drawRect(mouthX + 1, mouthY + 1, Math.max(2, mouthWidth - 2), 2);
      jawTop.endFill();
      this.beltLayer.addChild(jawTop);

      jawBottom = new PIXI.Graphics();
      jawBottom.beginFill(rimColor, 0.9);
      jawBottom.drawRect(mouthX + 1, mouthY + mouthHeight - 3, Math.max(2, mouthWidth - 2), 2);
      jawBottom.endFill();
      this.beltLayer.addChild(jawBottom);
    } else if (style === 'shredder') {
      rotor = new PIXI.Graphics();
      rotor.lineStyle(1.4, rimColor, 0.92);
      rotor.moveTo(-4, 0);
      rotor.lineTo(4, 0);
      rotor.moveTo(0, -4);
      rotor.lineTo(0, 4);
      rotor.moveTo(-3, -3);
      rotor.lineTo(3, 3);
      rotor.moveTo(-3, 3);
      rotor.lineTo(3, -3);
      rotor.x = mouthCx;
      rotor.y = mouthCy;
      this.beltLayer.addChild(rotor);
    } else if (style === 'plasma_recycler') {
      halo = new PIXI.Graphics();
      halo.lineStyle(2, emberColor, 0.5);
      halo.drawEllipse(0, 0, Math.max(5, mouthWidth * 0.7), Math.max(4, mouthHeight * 0.7));
      halo.x = mouthCx;
      halo.y = mouthCy;
      this.beltLayer.addChild(halo);
    }

    this.furnaceAnchors.set(String(conveyorId), {
      mouthX,
      mouthY,
      mouthWidth,
      mouthHeight
    });
    this.furnaceVisuals.set(String(conveyorId), {
      style,
      ember,
      core,
      intakeGlow,
      jawTop,
      jawBottom,
      rotor,
      halo,
      mouthX,
      mouthY,
      mouthWidth,
      mouthHeight,
      mouthCx,
      mouthCy
    });
  }

  /**
   * Scrolls belt textures to suggest motion matching each conveyor's speed.
   * Expects the same ordering as created in _drawBelts.
   */
  updateBelts(conveyors, dtMs) {
    if (!this.beltVisuals || !this.beltVisuals.length) {
      return;
    }
    const useTexture = !!this.beltTexture && (this.config?.display?.beltTexture?.enable === true);
    if (!useTexture) {
      return;
    }
    const factor = Number(this.config?.display?.beltTexture?.scrollFactor ?? 1);
    const dirRaw = this.config?.display?.beltTexture?.scrollDirection;
    const scrollDirection = (() => {
      if (typeof dirRaw === 'number' && Number.isFinite(dirRaw)) {
        return dirRaw < 0 ? -1 : 1;
      }
      const text = String(dirRaw ?? 'right').trim().toLowerCase();
      return (text === 'left' || text === 'rtl' || text === 'reverse' || text === 'backward') ? -1 : 1;
    })();
    const dt = Math.max(0, Number(dtMs) || 0) / 1000;
    for (let i = 0; i < Math.min(this.beltVisuals.length, conveyors.length); i += 1) {
      const vis = this.beltVisuals[i];
      if (vis.type !== 'tiling' || !vis.node) {
        continue;
      }
      const speed = Number(conveyors[i]?.speed) || 0;
      const shift = speed * dt * factor * scrollDirection;
      try {
        vis.offsetX = Number(vis.offsetX ?? 0) + shift;
        vis.node.tilePosition.x = vis.pixelSnap ? Math.round(vis.offsetX) : vis.offsetX;
      } catch (_) {
        // ignore
      }
    }
  }

  updateFurnaces(dtMs) {
    if (!this.furnaceVisuals.size) {
      return;
    }
    const cfg = this.config?.display?.endFurnace || {};
    if (cfg.enable === false) {
      return;
    }
    const flicker = cfg.flicker || {};
    if (flicker.enable === false) {
      return;
    }
    const dt = Math.max(0, Number(dtMs) || 0);
    this.furnaceFlickerTimeMs += dt;
    const t = this.furnaceFlickerTimeMs / 1000;
    const speedHz = Math.max(0.1, Number(flicker.speedHz ?? 8));
    const baseIntensity = Math.max(0.15, Math.min(1, Number(flicker.baseIntensity ?? 0.78)));
    const alphaAmplitude = Math.max(0, Math.min(0.85, Number(flicker.alphaAmplitude ?? 0.22)));

    let laneIndex = 0;
    this.furnaceVisuals.forEach((vis) => {
      const phase = laneIndex * 0.9;
      laneIndex += 1;
      const waveA = 0.5 + 0.5 * Math.sin((t * speedHz + phase) * Math.PI * 2);
      const waveB = 0.5 + 0.5 * Math.sin((t * speedHz * 0.57 + phase * 1.7) * Math.PI * 2);
      const jitter = Math.sin((t * 23 + phase * 3.1) * Math.PI * 2) * 0.03;
      const blend = waveA * 0.7 + waveB * 0.3;
      const intensity = Math.max(
        0.05,
        Math.min(1, baseIntensity + (blend - 0.5) * 2 * alphaAmplitude + jitter)
      );

      const styleId = normalizeTextureStyleId(vis?.style ?? 'furnace');
      const isFireStyle = styleId === 'furnace';

      if (vis.ember) {
        vis.ember.alpha = isFireStyle
          ? Math.max(0.15, Math.min(1, 0.45 + intensity * 0.55))
          : Math.max(0.2, Math.min(0.85, 0.25 + intensity * 0.35));
      }
      if (vis.core) {
        vis.core.alpha = isFireStyle
          ? Math.max(0.15, Math.min(1, 0.35 + intensity * 0.65))
          : Math.max(0.2, Math.min(0.85, 0.22 + intensity * 0.33));
      }
      if (vis.intakeGlow) {
        vis.intakeGlow.alpha = isFireStyle
          ? Math.max(0.05, Math.min(0.7, 0.08 + intensity * 0.35))
          : Math.max(0.04, Math.min(0.3, 0.04 + intensity * 0.16));
      }

      if (styleId === 'crusher' && vis.jawTop && vis.jawBottom) {
        const gapWave = 0.5 + 0.5 * Math.sin((t * speedHz * 0.9 + phase * 0.7) * Math.PI * 2);
        const maxTravel = Math.max(1, Math.floor((Number(vis.mouthHeight) || 8) * 0.2));
        const travel = Math.round(gapWave * maxTravel);
        vis.jawTop.y = (Number(vis.mouthY) || 0) + 1 + travel;
        vis.jawBottom.y = (Number(vis.mouthY) || 0) + (Number(vis.mouthHeight) || 0) - 3 - travel;
        const jawAlpha = Math.max(0.45, Math.min(1, 0.6 + intensity * 0.28));
        vis.jawTop.alpha = jawAlpha;
        vis.jawBottom.alpha = jawAlpha;
      }

      if (styleId === 'shredder' && vis.rotor) {
        vis.rotor.x = Number(vis.mouthCx) || 0;
        vis.rotor.y = Number(vis.mouthCy) || 0;
        vis.rotor.rotation = (t * speedHz * 1.6 + phase * 0.5) * Math.PI * 2;
        vis.rotor.alpha = Math.max(0.45, Math.min(0.95, 0.55 + intensity * 0.3));
      }

      if (styleId === 'plasma_recycler' && vis.halo) {
        const pulse = 0.5 + 0.5 * Math.sin((t * speedHz * 0.65 + phase) * Math.PI * 2);
        vis.halo.alpha = Math.max(0.15, Math.min(0.9, 0.22 + pulse * 0.55));
        vis.halo.scale.set(0.92 + pulse * 0.16, 0.92 + pulse * 0.16);
      }
    });
  }

  clampFrameDelta(dtMs) {
    const perfCfg = this.config?.display?.performance || {};
    const maxFrameDtMs = Number(perfCfg.maxFrameDtMs ?? 50);
    if (!Number.isFinite(maxFrameDtMs) || maxFrameDtMs <= 0) {
      return Math.max(0, Number(dtMs) || 0);
    }
    return Math.max(0, Math.min(Number(dtMs) || 0, maxFrameDtMs));
  }

  updateBackground(dtMs) {
    if (!this.backgroundVisual) {
      return;
    }
    const texCfg = this.config?.display?.backgroundTexture || {};
    const factor = Number(texCfg.scrollFactor ?? 0);
    if (!Number.isFinite(factor) || factor === 0) {
      return;
    }
    const dt = Math.max(0, Number(dtMs) || 0) / 1000;
    const shiftX = Number(texCfg.scrollX ?? 16) * factor * dt;
    const shiftY = Number(texCfg.scrollY ?? 0) * factor * dt;
    try {
      this.backgroundVisual.tilePosition.x += shiftX;
      this.backgroundVisual.tilePosition.y += shiftY;
    } catch (_) {
      // ignore
    }
  }

  queueDropEffects(dropEvents = []) {
    if (!Array.isArray(dropEvents) || dropEvents.length === 0) {
      return;
    }
    const missCfg = this.config?.display?.missAnimation || {};
    const mode = String(missCfg.mode ?? 'none').toLowerCase();
    if (!['snap', 'furnace', 'disintegrate'].includes(mode)) {
      return;
    }
    const brickDurationMs = Math.max(80, Number(missCfg.durationMs ?? 190));
    const markerFlashMs = Math.max(50, Number(missCfg.markerFlashMs ?? 120));
    const markerColor = toPixiColor(missCfg.flashColor ?? '#ef4444');
    const perfCfg = this.config?.display?.performance || {};
    const maxEffects = Math.max(0, Number(perfCfg.maxActiveEffects ?? 240));

    dropEvents.forEach((drop) => {
      if (this.effectVisuals.length >= maxEffects) {
        return;
      }
      const width = Math.max(1, Number(drop.width ?? 1));
      const height = Math.max(1, Number(drop.height ?? 1));
      const cornerRadius = Math.max(0, Number(this.config.display.brickCornerRadius ?? 0));
      const color = toPixiColor(drop.color ?? this.config.display.brickColor);
      const borderColor = toPixiColor(drop.borderColor ?? this.config.display.brickBorderColor ?? 0x0f172a);
      const shape = normalizeBrickShape(drop.shape ?? this.config.display.brickShape);

      const conveyorId = String(drop.conveyorId ?? '');
      const marker = this.dueMarkerAnchors.get(conveyorId);
      const furnace = this.furnaceAnchors.get(conveyorId);

      if (mode === 'furnace' && furnace) {
        const brickFx = new PIXI.Graphics();
        brickFx.beginFill(color, 1);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.endFill();
        brickFx.lineStyle(1.1, borderColor, 0.55);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.lineStyle(0, 0, 0);
        brickFx.x = Number(drop.x ?? 0);
        brickFx.y = Number(drop.y ?? 0);
        this.effectLayer.addChild(brickFx);
        this.effectVisuals.push({
          kind: 'furnace_ingest',
          node: brickFx,
          elapsedMs: 0,
          durationMs: Math.max(100, brickDurationMs + 40),
          startX: brickFx.x,
          startY: brickFx.y,
          endX: furnace.mouthX + 1,
          endY: furnace.mouthY + (furnace.mouthHeight - height) * 0.5
        });

        const glowFx = new PIXI.Graphics();
        glowFx.beginFill(0xfb923c, 0.9);
        glowFx.drawRect(
          furnace.mouthX + 1,
          furnace.mouthY + 1,
          Math.max(2, furnace.mouthWidth - 2),
          Math.max(2, furnace.mouthHeight - 2)
        );
        glowFx.endFill();
        this.effectLayer.addChild(glowFx);
        this.effectVisuals.push({
          kind: 'furnace_glow',
          node: glowFx,
          elapsedMs: 0,
          durationMs: Math.max(100, markerFlashMs + 80)
        });

        for (let i = 0; i < 3; i += 1) {
          const spark = new PIXI.Graphics();
          spark.beginFill(0xfacc15, 0.95);
          spark.drawRect(0, 0, 3, 3);
          spark.endFill();
          spark.x = furnace.mouthX + furnace.mouthWidth * 0.5;
          spark.y = furnace.mouthY + furnace.mouthHeight * 0.5;
          this.effectLayer.addChild(spark);
          this.effectVisuals.push({
            kind: 'furnace_spark',
            node: spark,
            elapsedMs: 0,
            durationMs: 170 + i * 30,
            vx: -28 - i * 14,
            vy: -10 - i * 9
          });
        }
      } else if (mode === 'snap') {
        const brickFx = new PIXI.Graphics();
        brickFx.beginFill(color, 1);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.endFill();
        brickFx.lineStyle(1.1, borderColor, 0.55);
        this._drawBrickPrimitive(brickFx, shape, width, height, cornerRadius);
        brickFx.lineStyle(0, 0, 0);
        brickFx.pivot.set(width, 0);
        brickFx.x = Number(drop.x ?? 0) + width;
        brickFx.y = Number(drop.y ?? 0);
        this.effectLayer.addChild(brickFx);
        this.effectVisuals.push({
          kind: 'drop_snap',
          node: brickFx,
          elapsedMs: 0,
          durationMs: brickDurationMs
        });
      } else {
        const disCfg = missCfg?.disintegrate || {};
        const shardCount = Math.max(4, Math.min(24, Math.floor(Number(disCfg.shardCount ?? 10))));
        const gravity = Math.max(10, Number(disCfg.gravityPxPerSec2 ?? 640));
        const speedMin = Math.max(10, Number(disCfg.speedMinPxPerSec ?? 110));
        const speedMax = Math.max(speedMin, Number(disCfg.speedMaxPxPerSec ?? 230));
        const shardLifeMs = Math.max(90, Number(disCfg.durationMs ?? Math.max(140, brickDurationMs + 40)));
        const mouthBias = Math.max(0, Math.min(1, Number(disCfg.furnaceBias ?? 0.72)));

        const originX = Number(drop.x ?? 0);
        const originY = Number(drop.y ?? 0);
        const targetX = furnace ? (furnace.mouthX + furnace.mouthWidth * 0.5) : (originX + width + 24);
        const targetY = furnace ? (furnace.mouthY + furnace.mouthHeight * 0.5) : (originY + height * 0.5);

        const flashFx = new PIXI.Graphics();
        flashFx.beginFill(0xf59e0b, 0.55);
        this._drawBrickPrimitive(flashFx, shape, width, height, cornerRadius);
        flashFx.endFill();
        flashFx.x = originX;
        flashFx.y = originY;
        this.effectLayer.addChild(flashFx);
        this.effectVisuals.push({
          kind: 'disintegrate_flash',
          node: flashFx,
          elapsedMs: 0,
          durationMs: Math.max(80, Math.floor(shardLifeMs * 0.45))
        });

        const cols = Math.max(2, Math.round(Math.sqrt(shardCount * (width / Math.max(1, height)))));
        const rows = Math.max(2, Math.ceil(shardCount / cols));
        const shardW = Math.max(2, Math.floor(width / cols));
        const shardH = Math.max(2, Math.floor(height / rows));
        let emitted = 0;
        for (let row = 0; row < rows && emitted < shardCount; row += 1) {
          for (let col = 0; col < cols && emitted < shardCount; col += 1) {
            const sx = col * shardW;
            const sy = row * shardH;
            if (sx >= width || sy >= height) {
              continue;
            }
            const wPart = Math.max(1, Math.min(shardW, width - sx));
            const hPart = Math.max(1, Math.min(shardH, height - sy));
            const shard = new PIXI.Graphics();
            shard.beginFill(color, 1);
            shard.drawRect(0, 0, wPart, hPart);
            shard.endFill();
            shard.lineStyle(1, borderColor, 0.35);
            shard.drawRect(0, 0, wPart, hPart);
            shard.lineStyle(0, 0, 0);
            shard.x = originX + sx;
            shard.y = originY + sy;
            this.effectLayer.addChild(shard);

            const cx = shard.x + wPart * 0.5;
            const cy = shard.y + hPart * 0.5;
            const toMouthX = targetX - cx;
            const toMouthY = targetY - cy;
            const mag = Math.max(1, Math.hypot(toMouthX, toMouthY));
            const dirX = toMouthX / mag;
            const dirY = toMouthY / mag;
            const randomAngle = (this._nextRand() - 0.5) * Math.PI * 0.9;
            const randomSpeed = speedMin + (speedMax - speedMin) * this._nextRand();
            const spreadSpeed = randomSpeed * (0.55 + this._nextRand() * 0.7);
            const spreadVX = Math.cos(randomAngle) * spreadSpeed;
            const spreadVY = Math.sin(randomAngle) * spreadSpeed;
            const vx = (dirX * randomSpeed * mouthBias) + (spreadVX * (1 - mouthBias));
            const vy = (dirY * randomSpeed * mouthBias) + (spreadVY * (1 - mouthBias)) - 30;
            this.effectVisuals.push({
              kind: 'drop_shard',
              node: shard,
              elapsedMs: 0,
              durationMs: shardLifeMs + Math.floor(this._nextRand() * 90),
              vx,
              vy,
              gravity
            });
            emitted += 1;
          }
        }

        if (furnace) {
          const mouthPulse = new PIXI.Graphics();
          mouthPulse.beginFill(0xfb923c, 0.9);
          mouthPulse.drawRect(
            furnace.mouthX + 1,
            furnace.mouthY + 1,
            Math.max(2, furnace.mouthWidth - 2),
            Math.max(2, furnace.mouthHeight - 2)
          );
          mouthPulse.endFill();
          this.effectLayer.addChild(mouthPulse);
          this.effectVisuals.push({
            kind: 'furnace_glow',
            node: mouthPulse,
            elapsedMs: 0,
            durationMs: Math.max(100, markerFlashMs + 90)
          });
        }
      }

      if (marker) {
        const flashFx = new PIXI.Graphics();
        const flashWidth = Math.max(2, Number(marker.width ?? 3) + 2);
        const flashHeight = Math.max(8, Number(marker.height ?? height) + 4);
        flashFx.beginFill(markerColor, 0.95);
        flashFx.drawRoundedRect(
          Number(marker.x) - flashWidth / 2,
          Number(marker.y) - flashHeight / 2,
          flashWidth,
          flashHeight,
          Math.min(4, flashWidth / 2)
        );
        flashFx.endFill();
        this.effectLayer.addChild(flashFx);
        this.effectVisuals.push({
          kind: 'marker_flash',
          node: flashFx,
          elapsedMs: 0,
          durationMs: markerFlashMs
        });
      }
    });
  }

  updateEffects(dtMs) {
    if (!this.effectVisuals.length) {
      return;
    }
    const dt = Math.max(0, Number(dtMs) || 0);
    const survivors = [];
    this.effectVisuals.forEach((effect) => {
      const node = effect.node;
      if (!node) {
        return;
      }
      effect.elapsedMs += dt;
      const t = Math.max(0, Math.min(1, effect.elapsedMs / Math.max(1, effect.durationMs)));
      if (effect.kind === 'drop_snap') {
        const eased = 1 - Math.pow(1 - t, 3);
        node.scale.x = Math.max(0.01, 1 - eased);
        node.alpha = Math.max(0, 1 - t * 0.9);
      } else if (effect.kind === 'disintegrate_flash') {
        node.alpha = Math.max(0, 0.55 * (1 - t));
      } else if (effect.kind === 'drop_shard') {
        const dtSec = dt / 1000;
        effect.vy += (Number(effect.gravity) || 0) * dtSec;
        node.x += (Number(effect.vx) || 0) * dtSec;
        node.y += (Number(effect.vy) || 0) * dtSec;
        node.alpha = Math.max(0, 1 - t * 1.05);
        node.rotation += (Number(effect.vx) || 0) * 0.0006;
      } else if (effect.kind === 'furnace_ingest') {
        const eased = 1 - Math.pow(1 - t, 3);
        node.x = effect.startX + (effect.endX - effect.startX) * eased;
        node.y = effect.startY + (effect.endY - effect.startY) * eased;
        node.scale.x = Math.max(0.15, 1 - t * 0.85);
        node.scale.y = Math.max(0.25, 1 - t * 0.75);
        node.alpha = Math.max(0, 1 - t * 0.95);
      } else if (effect.kind === 'furnace_glow') {
        node.alpha = 0.25 + 0.7 * Math.sin((1 - t) * Math.PI);
      } else if (effect.kind === 'furnace_spark') {
        node.x += (Number(effect.vx) || 0) * (dt / 1000);
        node.y += (Number(effect.vy) || 0) * (dt / 1000);
        node.alpha = Math.max(0, 1 - t);
      } else if (effect.kind === 'marker_flash') {
        node.alpha = Math.max(0, 0.95 * (1 - t));
      }
      if (t < 1) {
        survivors.push(effect);
      } else {
        node.destroy();
      }
    });
    this.effectVisuals = survivors;
  }

  _setupHUD() {
    if (!this.config.display.ui?.showHUD) {
      return;
    }
    const uiCfg = this.config.display.ui || {};
    const hudFontFamily = String(uiCfg.hudFontFamily || uiCfg.hudFont || 'Inter, Arial, sans-serif');
    const hudFontSize = Number(uiCfg.hudFontSize ?? 16);
    const hudColor = toPixiColor(uiCfg.hudColor ?? '#f5f6fa');
    const panelEnabled = uiCfg.hudPanel !== false;
    if (panelEnabled) {
      const panel = new PIXI.Graphics();
      panel.x = Number(uiCfg.hudOffsetX ?? 10);
      panel.y = Number(uiCfg.hudOffsetY ?? 10);
      this.hudLayer.addChild(panel);
      this.hudBackground = panel;
    }
    const hudStyle = new PIXI.TextStyle({
      fill: hudColor,
      fontSize: Number.isFinite(hudFontSize) ? hudFontSize : 16,
      fontFamily: hudFontFamily,
      fontWeight: String(uiCfg.hudFontWeight || '500'),
      lineHeight: Number(uiCfg.hudLineHeight ?? 22)
    });
    // Pixi v7 Text constructor signature: (text, style)
    const hudText = new PIXI.Text('', hudStyle);
    hudText.x = Number(uiCfg.hudOffsetX ?? 10);
    hudText.y = Number(uiCfg.hudOffsetY ?? 10);
    this.hudLayer.addChild(hudText);
    this.hudElements.status = hudText;
  }

  /**
   * Synchronises PIXI sprites with the logical bricks array.
   */
  syncBricks(bricks, completionMode, completionParams, focusState = null) {
    const conveyorWideHitArea = this._isConveyorHitAreaEnabled();
    this.bricksByConveyor.clear();
    bricks.forEach((brick) => {
      const cid = String(brick.conveyorId ?? '');
      if (!this.bricksByConveyor.has(cid)) {
        this.bricksByConveyor.set(cid, []);
      }
      this.bricksByConveyor.get(cid).push(brick);
    });
    this.bricksByConveyor.forEach((list) => {
      list.sort((a, b) => ((b.x + b.width) - (a.x + a.width)) || (a.x - b.x));
    });
    const focusEnabled = Boolean(focusState?.enabled);
    this.activeBrickId = focusEnabled ? focusState?.activeBrickId ?? null : null;
    const seen = new Set();
    bricks.forEach((brick) => {
      let sprite = this.brickSprites.get(brick.id);
      if (!sprite) {
        sprite = this._createBrickSprite(brick);
        this.brickSprites.set(brick.id, sprite);
        this.brickLayer.addChild(sprite);
      }
      const desiredFill = toPixiColor(brick.color ?? this.config.display.brickColor);
      const desiredBorder = toPixiColor(brick.borderColor ?? this.config.display.brickBorderColor ?? 0x0f172a);
      const desiredShape = normalizeBrickShape(brick.shape ?? this.config.display.brickShape);
      const progressChanged = sprite.progressValue !== brick.clearProgress;
      const needsProgressRedraw =
        progressChanged &&
        (completionMode === 'hold_duration' || completionMode === 'hover_to_clear') &&
        !sprite.usesProgressMask;
      if (
        sprite.modeValue !== completionMode ||
        sprite.fillColorValue !== desiredFill ||
        sprite.borderColorValue !== desiredBorder ||
        sprite.textureStyleValue !== normalizeTextureStyleId(brick.textureStyle ?? '') ||
        sprite.shapeValue !== desiredShape ||
        sprite.brickWidth !== brick.width ||
        sprite.brickHeight !== brick.height ||
        needsProgressRedraw
      ) {
        this._drawBrickGraphics(sprite, brick, completionMode);
      }
      this._updateBrickProgressVisual(sprite, brick, completionMode);
      sprite.position.set(brick.x, brick.y);
      const isFocused = !focusEnabled || brick.id === this.activeBrickId;
      if (conveyorWideHitArea) {
        sprite.eventMode = 'none';
        sprite.cursor = 'default';
      } else {
        sprite.eventMode = isFocused ? 'dynamic' : 'none';
        sprite.cursor = isFocused ? 'pointer' : 'default';
      }
      if (completionMode === 'multi_click') {
        sprite.alpha = 1 - Math.min(1, (brick.clicks ?? 0) / Math.max(1, completionParams?.clicks_required ?? 2)) * 0.6;
        sprite.tint = brickProgressTint(brick, completionMode, completionParams);
      } else if (completionMode === 'hold_duration') {
        sprite.alpha = isFocused ? 1 : 0.95;
        sprite.tint = 0xffffff;
      } else {
        sprite.alpha = isFocused ? 1 : 0.95;
        sprite.tint = 0xffffff;
      }
      seen.add(brick.id);
    });
    // Remove stale sprites.
    Array.from(this.brickSprites.keys()).forEach((id) => {
      if (!seen.has(id)) {
        const sprite = this.brickSprites.get(id);
        if (sprite) {
          sprite.destroy();
        }
        this.brickSprites.delete(id);
      }
    });
    if (conveyorWideHitArea && completionMode === 'hover_to_clear') {
      this.conveyorHovered.forEach((cid) => {
        const next = this._getConveyorTargetBrickId(cid);
        const prev = this.conveyorHoverTarget.get(cid) || null;
        const pos = this.conveyorPointerPos.get(cid) || {};
        if (prev && prev !== next) {
          this.onBrickHover(prev, false, pos.x ?? null, pos.y ?? null);
        }
        if (next && next !== prev) {
          this.onBrickHover(next, true, pos.x ?? null, pos.y ?? null);
          this.conveyorHoverTarget.set(cid, next);
        } else if (!next) {
          this.conveyorHoverTarget.delete(cid);
        }
      });
    }
    this._updateSpotlight(focusState);
  }

  _resetBrickVisualChildren(sprite) {
    if (!sprite) {
      return;
    }
    const children = sprite.removeChildren();
    children.forEach((child) => child?.destroy?.());
    sprite.mainGraphic = null;
    sprite.progressGraphic = null;
    sprite.progressMask = null;
    sprite.usesProgressMask = false;
    sprite.progressMaxWidth = 0;
  }

  _drawBrickBody(target, {
    brick,
    shape,
    width,
    height,
    cornerRadius,
    fillColor,
    fillAlpha = 1,
    borderColor,
    borderAlpha = 0.5,
    borderWidth = 1.25,
    withTextureOverlay = true,
  }) {
    target.beginFill(fillColor, fillAlpha);
    this._drawBrickPrimitive(target, shape, width, height, cornerRadius);
    target.endFill();
    if (withTextureOverlay) {
      this._drawBrickTextureOverlay(target, brick, shape, width, height, cornerRadius, fillAlpha);
    }
    if (borderWidth > 0 && borderAlpha > 0) {
      target.lineStyle(borderWidth, borderColor, borderAlpha);
      this._drawBrickPrimitive(target, shape, width, height, cornerRadius);
      target.lineStyle(0, 0, 0);
    }
  }

  _shouldUseProgressMask(shape, completionMode) {
    if (!['hold_duration', 'hover_to_clear'].includes(completionMode)) {
      return false;
    }
    return shape === 'rect' || shape === 'rounded_rect';
  }

  _createBrickSprite(brick) {
    const sprite = new PIXI.Container();
    sprite.brickId = brick.id;
    sprite.cursor = 'pointer';
    sprite.eventMode = 'dynamic';
    if (this.config.bricks.completionMode === 'hold_duration') {
      const beginHold = (e) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hold_begin', brick.id, e);
        this.brickHoldStart.set(brick.id, {
          t: performance.now(),
          x: gx,
          y: gy
        });
      };
      const endHold = (e) => {
        const start = this.brickHoldStart.get(brick.id);
        if (!start) {
          return;
        }
        this.brickHoldStart.delete(brick.id);
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? start.x ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? start.y ?? 0;
        const durationMs = Math.max(0, performance.now() - start.t);
        this._emitPointerDebug('brick_hold_end', brick.id, e, { hold_ms: Math.round(durationMs) });
        this.onBrickHold(brick.id, durationMs, gx, gy);
      };
      sprite.on('pointerdown', beginHold);
      // End hold across multiple exit/release cases because bricks move while
      // the pointer is down, which can otherwise drop the release callback.
      sprite.on('pointerup', endHold);
      sprite.on('pointerupoutside', endHold);
      sprite.on('pointerout', endHold);
      sprite.on('pointerleave', endHold);
      sprite.on('pointeroutoutside', endHold);
      sprite.on('pointercancel', endHold);
    } else if (this.config.bricks.completionMode === 'hover_to_clear') {
      const beginHover = (e) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hover_begin', brick.id, e);
        this.onBrickHover(brick.id, true, gx, gy);
      };
      const endHover = (e) => {
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_hover_end', brick.id, e);
        this.onBrickHover(brick.id, false, gx, gy);
      };
      sprite.on('pointerover', beginHover);
      sprite.on('pointerout', endHover);
      sprite.on('pointeroutoutside', endHover);
      sprite.on('pointercancel', endHover);
    } else {
      const handleClick = (e) => {
        // Use pointerdown so moving bricks still register immediately.
        const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
        const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
        this._emitPointerDebug('brick_click_event', brick.id, e);
        this.onBrickClick(brick.id, gx, gy);
      };
      sprite.on('pointerdown', handleClick);
      // Keep pointertap as a compatibility fallback.
      sprite.on('pointertap', handleClick);
    }

    this._drawBrickGraphics(sprite, brick, this.config.bricks.completionMode);
    return sprite;
  }

  _drawBrickGraphics(sprite, brick, completionMode) {
    const color = toPixiColor(brick.color ?? this.config.display.brickColor);
    const borderColor = toPixiColor(brick.borderColor ?? this.config.display.brickBorderColor ?? 0x0f172a);
    const shape = normalizeBrickShape(brick.shape ?? this.config.display.brickShape);
    const defaultCornerRadius = Math.max(0, Number(this.config.display.brickCornerRadius ?? 0));
    this._resetBrickVisualChildren(sprite);
    const cornerRadius = Math.max(
      0,
      Math.min(Number(defaultCornerRadius) || 0, Number(brick.width) / 2, Number(brick.height) / 2)
    );
    const supportsMaskProgress = this._shouldUseProgressMask(shape, completionMode);
    if (completionMode === 'hold_duration' && supportsMaskProgress) {
      const progressGraphic = new PIXI.Graphics();
      this._drawBrickBody(progressGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: color,
        fillAlpha: 1,
        borderColor,
        borderAlpha: 0.45,
      });
      const mask = new PIXI.Graphics();
      progressGraphic.mask = mask;
      sprite.addChild(progressGraphic);
      sprite.addChild(mask);
      sprite.progressGraphic = progressGraphic;
      sprite.progressMask = mask;
      sprite.usesProgressMask = true;
      sprite.progressMaxWidth = brick.width;
    } else if (completionMode === 'hover_to_clear' && supportsMaskProgress) {
      const ghostGraphic = new PIXI.Graphics();
      this._drawBrickBody(ghostGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: color,
        fillAlpha: 0.26,
        borderColor,
        borderAlpha: 0.55,
        borderWidth: 1.5,
      });
      const progressGraphic = new PIXI.Graphics();
      this._drawBrickBody(progressGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: color,
        fillAlpha: 0.96,
        borderColor,
        borderAlpha: 0,
        borderWidth: 0,
      });
      const mask = new PIXI.Graphics();
      progressGraphic.mask = mask;
      sprite.addChild(ghostGraphic);
      sprite.addChild(progressGraphic);
      sprite.addChild(mask);
      sprite.mainGraphic = ghostGraphic;
      sprite.progressGraphic = progressGraphic;
      sprite.progressMask = mask;
      sprite.usesProgressMask = true;
      sprite.progressMaxWidth = brick.width;
    } else if (completionMode === 'hold_duration') {
      const legacyGraphic = new PIXI.Graphics();
      const remainingWidth = getBrickVisibleWidth(brick, completionMode);
      const legacyRadius = Math.max(0, Math.min(cornerRadius, remainingWidth / 2, brick.height / 2));
      if (remainingWidth > 0) {
        this._drawBrickBody(legacyGraphic, {
          brick,
          shape,
          width: remainingWidth,
          height: brick.height,
          cornerRadius: legacyRadius,
          fillColor: color,
          fillAlpha: 1,
          borderColor,
          borderAlpha: 0.45,
        });
      }
      sprite.addChild(legacyGraphic);
      sprite.mainGraphic = legacyGraphic;
    } else if (completionMode === 'hover_to_clear') {
      const legacyGraphic = new PIXI.Graphics();
      const remainingWidth = getBrickVisibleWidth(brick, completionMode);
      this._drawBrickBody(legacyGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: color,
        fillAlpha: 0.26,
        borderColor,
        borderAlpha: 0.55,
        borderWidth: 1.5,
      });
      if (remainingWidth > 0) {
        this._drawBrickBody(legacyGraphic, {
          brick,
          shape,
          width: remainingWidth,
          height: brick.height,
          cornerRadius: Math.max(0, Math.min(cornerRadius, remainingWidth / 2)),
          fillColor: color,
          fillAlpha: 0.96,
          borderColor,
          borderAlpha: 0,
          borderWidth: 0,
        });
      }
      sprite.addChild(legacyGraphic);
      sprite.mainGraphic = legacyGraphic;
    } else {
      const mainGraphic = new PIXI.Graphics();
      this._drawBrickBody(mainGraphic, {
        brick,
        shape,
        width: brick.width,
        height: brick.height,
        cornerRadius,
        fillColor: color,
        fillAlpha: 1,
        borderColor,
        borderAlpha: 0.5,
      });
      sprite.addChild(mainGraphic);
      sprite.mainGraphic = mainGraphic;
    }
    sprite.hitArea = this._buildBrickHitArea(shape, brick.width, brick.height);
    sprite.modeValue = completionMode;
    sprite.fillColorValue = color;
    sprite.borderColorValue = borderColor;
    sprite.textureStyleValue = normalizeTextureStyleId(brick.textureStyle ?? '');
    sprite.shapeValue = shape;
    sprite.brickWidth = brick.width;
    sprite.brickHeight = brick.height;
    sprite.progressValue = brick.clearProgress;
  }

  _updateBrickProgressVisual(sprite, brick, completionMode) {
    sprite.progressValue = brick.clearProgress;
    if (!sprite.usesProgressMask || !sprite.progressMask) {
      return;
    }
    const remainingWidth = getBrickVisibleWidth(brick, completionMode);
    const maxWidth = Math.max(1, Number(sprite.progressMaxWidth ?? brick.width) || 1);
    const width = Math.max(0, Math.min(maxWidth, remainingWidth));
    const h = Math.max(1, Number(brick.height) || 1);
    sprite.progressMask.clear();
    if (width <= 0) {
      return;
    }
    sprite.progressMask.beginFill(0xffffff, 1);
    sprite.progressMask.drawRect(0, 0, width, h);
    sprite.progressMask.endFill();
  }

  _resolveBrickTextureOverlayConfig(brick) {
    const base = this.config?.display?.brickTextureOverlay || {};
    if (base.enable !== true) {
      return null;
    }
    const styleId = normalizeTextureStyleId(brick?.textureStyle ?? base?.style ?? '');
    if (!styleId) {
      return base;
    }
    const customStyles = base?.styles && typeof base.styles === 'object' ? base.styles : {};
    const custom = Object.entries(customStyles).find(([key]) => normalizeTextureStyleId(key) === styleId)?.[1];
    const builtin = BUILTIN_BRICK_TEXTURE_STYLES?.[styleId];
    const override = custom && typeof custom === 'object'
      ? custom
      : (builtin && typeof builtin === 'object' ? builtin : null);
    if (!override) {
      return base;
    }
    return { ...base, ...override };
  }

  _drawBrickTextureOverlay(target, brick, shape, width, height, cornerRadius, fillAlpha = 1) {
    const cfg = this._resolveBrickTextureOverlayConfig(brick);
    if (!cfg || cfg.enable !== true) {
      return;
    }
    const isRectangular = ['rect', 'rounded_rect'].includes(shape);
    const isCircular = shape === 'circle';
    if (!isRectangular && !isCircular) {
      return;
    }
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    if (w < 8 || h < 8) {
      return;
    }
    const pattern = String(cfg.pattern ?? 'wood_planks').toLowerCase();
    const idNum = Number(String(brick?.id ?? '').replace(/\D+/g, '')) || 0;
    const phase = (idNum % 7) / 7;
    const alphaBase = Math.max(0, Math.min(1, Number(cfg.alpha ?? 0.16))) * Math.max(0.25, Math.min(1, fillAlpha));
    const baseFillAlpha = Math.max(0, Math.min(1, Number(cfg.baseFillAlpha ?? 0)));
    const baseFillColor = toPixiColor(cfg.baseFillColor ?? '#8b6f4e');
    const seamColor = toPixiColor(cfg.seamColor ?? '#111827');
    const highlightColor = toPixiColor(cfg.highlightColor ?? '#f8fafc');
    const plankCount = Math.max(1, Math.min(5, Math.floor(Number(cfg.plankCount ?? 3))));
    const seamWidth = Math.max(1, Number(cfg.seamWidthPx ?? 1));
    const grainCount = Math.max(0, Math.floor(Number(cfg.grainCount ?? 5)));
    const nailRadius = Math.max(0.5, Number(cfg.nailRadiusPx ?? 1.2));
    const inset = Math.max(1, Number(cfg.insetPx ?? 3));
    const topSheenAlpha = Math.max(0, Math.min(1, Number(cfg.topSheenAlpha ?? 0.42)));
    const radius = Math.max(0, Math.min(Number(cornerRadius) || 0, w / 2, h / 2));

    if (baseFillAlpha > 0) {
      target.beginFill(baseFillColor, baseFillAlpha * Math.max(0.25, Math.min(1, fillAlpha)));
      this._drawBrickPrimitive(target, shape, w, h, radius);
      target.endFill();
    }

    if (pattern === 'pizza') {
      if (!isCircular) {
        return;
      }
      const crustColor = toPixiColor(cfg.crustColor ?? '#a16207');
      const sauceColor = toPixiColor(cfg.sauceColor ?? '#b91c1c');
      const cheeseColor = toPixiColor(cfg.cheeseColor ?? '#facc15');
      const toppingColor = toPixiColor(cfg.toppingColor ?? '#7f1d1d');
      const sliceLineColor = toPixiColor(cfg.sliceLineColor ?? '#7c2d12');
      const sliceCount = Math.max(4, Math.min(12, Math.floor(Number(cfg.sliceCount ?? 6))));
      const toppingCount = Math.max(0, Math.min(24, Math.floor(Number(cfg.toppingCount ?? 7))));
      const cx = w * 0.5;
      const cy = h * 0.5;
      const rx = Math.max(2, w * 0.5 - inset);
      const ry = Math.max(2, h * 0.5 - inset);
      const crustThickness = Math.max(2, Math.round(Math.min(rx, ry) * 0.13));
      const sauceInset = crustThickness + 1;
      const cheeseInset = crustThickness + Math.max(2, Math.round(crustThickness * 0.7));

      target.beginFill(crustColor, alphaBase * 0.98);
      target.drawEllipse(cx, cy, rx, ry);
      target.endFill();

      target.beginFill(sauceColor, alphaBase * 0.78);
      target.drawEllipse(cx, cy, Math.max(1, rx - sauceInset), Math.max(1, ry - sauceInset));
      target.endFill();

      target.beginFill(cheeseColor, alphaBase * 0.72);
      target.drawEllipse(cx, cy, Math.max(1, rx - cheeseInset), Math.max(1, ry - cheeseInset));
      target.endFill();

      target.lineStyle(Math.max(1, seamWidth), sliceLineColor, alphaBase * 0.5);
      for (let i = 0; i < sliceCount; i += 1) {
        const angle = (Math.PI * 2 * i) / sliceCount + phase * Math.PI * 0.3;
        const ex = cx + Math.cos(angle) * Math.max(1, rx - sauceInset - 1);
        const ey = cy + Math.sin(angle) * Math.max(1, ry - sauceInset - 1);
        target.moveTo(cx, cy);
        target.lineTo(ex, ey);
      }
      target.lineStyle(0, 0, 0);

      let local = ((idNum || 1) * 2654435761) >>> 0;
      const rand = () => {
        local ^= (local << 13) >>> 0;
        local ^= local >>> 17;
        local ^= (local << 5) >>> 0;
        return (local >>> 0) / 0x100000000;
      };
      const toppingRadius = Math.max(1.2, Math.min(5, Math.min(w, h) * 0.06));
      for (let i = 0; i < toppingCount; i += 1) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 0.72;
        const tx = cx + Math.cos(a) * (rx - cheeseInset - toppingRadius) * r;
        const ty = cy + Math.sin(a) * (ry - cheeseInset - toppingRadius) * r;
        target.beginFill(toppingColor, alphaBase * 0.86);
        target.drawCircle(tx, ty, toppingRadius);
        target.endFill();
      }
      return;
    }

    if (pattern === 'gift_wrap') {
      if (!isRectangular) {
        return;
      }
      const ribbonColor = toPixiColor(cfg.ribbonColor ?? '#fef3c7');
      const ribbonAlpha = Math.max(0, Math.min(1, Number(cfg.ribbonAlpha ?? 0.95)));
      const ribbonWidthRatio = Math.max(0.06, Math.min(0.45, Number(cfg.ribbonWidthRatio ?? 0.16)));
      const ribbonInsetPx = Math.max(0, Number(cfg.ribbonInsetPx ?? inset));
      const ribbonW = Math.max(2, Math.round(w * ribbonWidthRatio));
      const ribbonH = Math.max(2, Math.round(h * ribbonWidthRatio));
      const cx = Math.round((w - ribbonW) * 0.5);
      const cy = Math.round((h - ribbonH) * 0.5);
      const usableW = Math.max(1, w - ribbonInsetPx * 2);
      const usableH = Math.max(1, h - ribbonInsetPx * 2);
      const paperPatternColor = toPixiColor(cfg.paperPatternColor ?? '#ffffff');
      const paperPatternAlpha = Math.max(0, Math.min(0.4, Number(cfg.paperPatternAlpha ?? 0.12)));
      const paperDotStep = Math.max(6, Math.floor(Number(cfg.paperDotStepPx ?? 11)));
      for (let py = ribbonInsetPx + 2; py < ribbonInsetPx + usableH - 1; py += paperDotStep) {
        for (let px = ribbonInsetPx + 2; px < ribbonInsetPx + usableW - 1; px += paperDotStep) {
          target.beginFill(paperPatternColor, alphaBase * paperPatternAlpha);
          target.drawCircle(px + ((Math.floor(py / paperDotStep) % 2) ? 2 : 0), py, 0.8);
          target.endFill();
        }
      }

      target.beginFill(ribbonColor, alphaBase * ribbonAlpha);
      target.drawRect(cx, ribbonInsetPx, ribbonW, usableH);
      target.drawRect(ribbonInsetPx, cy, usableW, ribbonH);
      target.endFill();

      const bowAlpha = alphaBase * Math.max(0.35, ribbonAlpha * 0.9);
      const bowSize = Math.max(2, Math.round(Math.min(w, h) * 0.12));
      target.beginFill(ribbonColor, bowAlpha);
      target.drawCircle(cx + ribbonW * 0.5 - bowSize, cy + ribbonH * 0.5, bowSize);
      target.drawCircle(cx + ribbonW * 0.5 + bowSize, cy + ribbonH * 0.5, bowSize);
      target.drawCircle(cx + ribbonW * 0.5, cy + ribbonH * 0.5, Math.max(1.2, bowSize * 0.58));
      target.drawPolygon([
        cx + ribbonW * 0.5 - bowSize * 0.2, cy + ribbonH * 0.5 + bowSize * 0.6,
        cx + ribbonW * 0.5 - bowSize * 0.95, cy + ribbonH * 0.5 + bowSize * 1.75,
        cx + ribbonW * 0.5 - bowSize * 0.15, cy + ribbonH * 0.5 + bowSize * 1.2,
      ]);
      target.drawPolygon([
        cx + ribbonW * 0.5 + bowSize * 0.2, cy + ribbonH * 0.5 + bowSize * 0.6,
        cx + ribbonW * 0.5 + bowSize * 0.95, cy + ribbonH * 0.5 + bowSize * 1.75,
        cx + ribbonW * 0.5 + bowSize * 0.15, cy + ribbonH * 0.5 + bowSize * 1.2,
      ]);
      target.endFill();
      return;
    }

    if (!isRectangular) {
      return;
    }

    // Top sheen (optional; can create a strong two-tone look if too high).
    if (topSheenAlpha > 0) {
      target.beginFill(highlightColor, alphaBase * topSheenAlpha);
      target.drawRoundedRect(inset, inset, Math.max(1, w - inset * 2), Math.max(1, h * 0.2), Math.max(0, radius * 0.55));
      target.endFill();
    }

    // Horizontal plank seams.
    for (let i = 1; i < plankCount; i += 1) {
      const y = Math.round((h * i) / plankCount);
      target.beginFill(seamColor, alphaBase * 0.62);
      target.drawRect(inset, y - seamWidth / 2, Math.max(1, w - inset * 2), seamWidth);
      target.endFill();
    }

    // Light grain streaks.
    for (let i = 0; i < grainCount; i += 1) {
      const y = Math.round(inset + ((h - inset * 2) * ((i + phase) % grainCount)) / Math.max(1, grainCount));
      const streakW = Math.max(6, Math.round(w * (0.28 + ((i + phase) % 3) * 0.11)));
      const x = inset + ((i * 13 + Math.floor(phase * 17)) % Math.max(1, Math.floor(w - inset * 2 - streakW)));
      target.beginFill(highlightColor, alphaBase * 0.18);
      target.drawRect(x, y, streakW, 1);
      target.endFill();
    }

    // Small corner nails.
    const nailAlpha = alphaBase * 0.7;
    const nailOffsetX = Math.max(inset + nailRadius + 1, w * 0.13);
    const nailOffsetY = Math.max(inset + nailRadius + 1, h * 0.2);
    const nailYBottom = Math.max(nailOffsetY, h - nailOffsetY);
    target.beginFill(seamColor, nailAlpha);
    target.drawCircle(nailOffsetX, nailOffsetY, nailRadius);
    target.drawCircle(Math.max(nailOffsetX, w - nailOffsetX), nailOffsetY, nailRadius);
    target.drawCircle(nailOffsetX, nailYBottom, nailRadius);
    target.drawCircle(Math.max(nailOffsetX, w - nailOffsetX), nailYBottom, nailRadius);
    target.endFill();

    if (cfg.labelPatch === true) {
      const patchW = Math.max(8, Math.round(w * 0.36));
      const patchH = Math.max(5, Math.round(h * 0.3));
      const px = Math.round(w - patchW - inset - 1);
      const py = Math.round(inset + 1);
      const patchColor = toPixiColor(cfg.labelPatchColor ?? '#f8fafc');
      const patchAlpha = Math.max(0, Math.min(1, Number(cfg.labelPatchAlpha ?? 0.8)));
      const patchBorder = toPixiColor(cfg.labelPatchBorderColor ?? '#334155');
      const barcodeColor = toPixiColor(cfg.labelBarcodeColor ?? '#111827');
      target.beginFill(patchColor, alphaBase * patchAlpha);
      target.drawRoundedRect(px, py, patchW, patchH, 1);
      target.endFill();
      target.beginFill(patchBorder, alphaBase * 0.35);
      target.drawRect(px, py + patchH - 1, patchW, 1);
      target.endFill();
      for (let i = 0; i < 4; i += 1) {
        const bx = px + 2 + i * Math.max(1, Math.floor((patchW - 4) / 4));
        const bw = Math.max(1, (i % 2 === 0 ? 1 : 2));
        target.beginFill(barcodeColor, alphaBase * 0.55);
        target.drawRect(bx, py + Math.max(1, Math.floor(patchH * 0.34)), bw, Math.max(1, patchH - 3));
        target.endFill();
      }
    }

    if (cfg.bandColor != null) {
      const bandColor = toPixiColor(cfg.bandColor);
      const bandAlpha = Math.max(0, Math.min(1, Number(cfg.bandAlpha ?? 0.28)));
      const bandW = Math.max(2, Math.round(w * 0.12));
      target.beginFill(bandColor, alphaBase * bandAlpha);
      target.drawRect(inset, inset, bandW, Math.max(1, h - inset * 2));
      target.drawRect(Math.max(inset, w - inset - bandW), inset, bandW, Math.max(1, h - inset * 2));
      target.endFill();
      const plateColor = toPixiColor(cfg.lockPlateColor ?? '#fef3c7');
      const plateAlpha = Math.max(0, Math.min(1, Number(cfg.lockPlateAlpha ?? 0.68)));
      const plateW = Math.max(3, Math.round(w * 0.14));
      const plateH = Math.max(3, Math.round(h * 0.22));
      target.beginFill(plateColor, alphaBase * plateAlpha);
      target.drawRoundedRect(Math.round((w - plateW) * 0.5), Math.round((h - plateH) * 0.5), plateW, plateH, 1);
      target.endFill();
    }
  }

  _drawBrickPrimitive(sprite, shape, width, height, cornerRadius) {
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const radius = Math.max(0, Math.min(Number(cornerRadius) || 0, w / 2, h / 2));
    const cx = w / 2;
    const cy = h / 2;
    if (shape === 'circle') {
      sprite.drawEllipse(cx, cy, w / 2, h / 2);
      return;
    }
    if (shape === 'diamond') {
      sprite.drawPolygon([cx, 0, w, cy, cx, h, 0, cy]);
      return;
    }
    if (shape === 'hexagon') {
      sprite.drawPolygon([w * 0.25, 0, w * 0.75, 0, w, cy, w * 0.75, h, w * 0.25, h, 0, cy]);
      return;
    }
    if (shape === 'rect') {
      sprite.drawRect(0, 0, w, h);
      return;
    }
    sprite.drawRoundedRect(0, 0, w, h, radius);
  }

  _buildBrickHitArea(shape, width, height) {
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    if (shape === 'circle') {
      return new PIXI.Ellipse(w / 2, h / 2, w / 2, h / 2);
    }
    if (shape === 'diamond') {
      return new PIXI.Polygon([w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]);
    }
    if (shape === 'hexagon') {
      return new PIXI.Polygon([w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2]);
    }
    return new PIXI.Rectangle(0, 0, w, h);
  }

  _updateSpotlight(focusState) {
    if (!focusState?.enabled || !focusState.activeBrickId) {
      if (this.spotlightGraphics) {
        this.spotlightGraphics.clear();
      }
      if (this.spotlightRing) {
        this.spotlightRing.clear();
      }
      return;
    }
    if (!this.spotlightGraphics) {
      this.spotlightGraphics = new PIXI.Graphics();
      this.spotlightLayer.addChild(this.spotlightGraphics);
    }
    if (!this.spotlightRing) {
      this.spotlightRing = new PIXI.Graphics();
      this.spotlightLayer.addChild(this.spotlightRing);
    }
    const sprite = this.brickSprites.get(focusState.activeBrickId);
    if (!sprite) {
      this.spotlightGraphics.clear();
      this.spotlightRing.clear();
      return;
    }
    const pad = Math.max(0, Number(focusState.spotlightPadding ?? 18));
    const dimAlpha = Math.max(0, Math.min(0.95, Number(focusState.dimAlpha ?? 0.45)));
    const holeX = sprite.x - pad;
    const holeY = sprite.y - pad;
    const holeW = sprite.brickWidth + pad * 2;
    const holeH = sprite.brickHeight + pad * 2;
    const canvasW = this.config.display.canvasWidth;
    const canvasH = this.config.display.canvasHeight;

    this.spotlightGraphics.clear();
    this.spotlightGraphics.beginFill(0x000000, dimAlpha);
    this.spotlightGraphics.drawRect(0, 0, canvasW, Math.max(0, holeY));
    this.spotlightGraphics.drawRect(0, Math.max(0, holeY + holeH), canvasW, Math.max(0, canvasH - (holeY + holeH)));
    this.spotlightGraphics.drawRect(0, Math.max(0, holeY), Math.max(0, holeX), Math.max(0, holeH));
    this.spotlightGraphics.drawRect(
      Math.max(0, holeX + holeW),
      Math.max(0, holeY),
      Math.max(0, canvasW - (holeX + holeW)),
      Math.max(0, holeH)
    );
    this.spotlightGraphics.endFill();

    this.spotlightRing.clear();
    this.spotlightRing.lineStyle(3, 0xf8fafc, 0.95);
    this.spotlightRing.drawRoundedRect(holeX, holeY, holeW, holeH, 10);
  }

  updateHUD(stats, remainingMs, blockInfo) {
    const text = this.hudElements.status;
    if (!text) {
      return;
    }
    const lines = buildHUDLines({
      stats,
      remainingMs,
      blockLabel: blockInfo?.label,
      drtStats: blockInfo?.drtStats,
      focusInfo: blockInfo?.focusInfo,
      uiConfig: this.config?.display?.ui || {},
      drtEnabled: Boolean(blockInfo?.drtEnabled)
    });
    text.text = lines.join('\n');

    const uiCfg = this.config?.display?.ui || {};
    if (this.hudBackground) {
      const padX = Math.max(2, Number(uiCfg.hudPanelPaddingX ?? 10));
      const padY = Math.max(2, Number(uiCfg.hudPanelPaddingY ?? 8));
      const bgAlpha = Math.max(0, Math.min(1, Number(uiCfg.hudPanelAlpha ?? 0.42)));
      const bgColor = toPixiColor(uiCfg.hudPanelColor ?? '#0f172a');
      const radius = Math.max(0, Number(uiCfg.hudPanelRadius ?? 8));
      this.hudBackground.clear();
      this.hudBackground.beginFill(bgColor, bgAlpha);
      this.hudBackground.drawRoundedRect(
        -padX,
        -padY,
        Math.max(8, text.width + padX * 2),
        Math.max(8, text.height + padY * 2),
        radius
      );
      this.hudBackground.endFill();
    }
  }

  /**
   * Shows or hides the visual DRT indicator.
   */
  toggleVisualDRT(show, config) {
    if (!config) {
      return;
    }
    if (!this.drtGraphics) {
      this.drtGraphics = new PIXI.Graphics();
      this.drtLayer.addChild(this.drtGraphics);
    }
    this.drtGraphics.clear();
    if (show) {
      const { shape, color, size_px, x, y } = config;
      const tint = toPixiColor(color || '#ffffff');
      this.drtGraphics.beginFill(tint, 0.9);
      if (shape === 'circle') {
        this.drtGraphics.drawCircle(x, y, size_px / 2);
      } else {
        this.drtGraphics.drawRoundedRect(x - size_px / 2, y - size_px / 2, size_px, size_px, size_px * 0.2);
      }
      this.drtGraphics.endFill();
    }
  }

  async _prepareBackgroundTexture() {
    try {
      const texCfg = this.config?.display?.backgroundTexture || {};
      if (!texCfg.enable) {
        this.backgroundTexture = null;
        this.backgroundTextureOwned = false;
        return;
      }
      const renderMode = String(texCfg.renderMode ?? 'image').toLowerCase();
      if (renderMode === 'procedural_warehouse') {
        const key = makeMaterialKey(
          'background:procedural_warehouse',
          texCfg.proceduralWarehouse || {},
          (this.seed ^ 0x1f123bb5) >>> 0
        );
        this.backgroundTexture = getOrCreateProceduralTexture(this.app?.renderer, key, () =>
          this._buildProceduralWarehouseTexture(texCfg.proceduralWarehouse || {})
        );
        this.backgroundTextureOwned = false;
        return;
      }
      const src = texCfg.src || 'assets/warehouse-tile.svg';
      this.backgroundTexture = await loadCachedImageTexture(src);
      this.backgroundTextureOwned = false;
    } catch (error) {
      console.warn('Failed to load background texture; using backgroundColor only.', error);
      this.backgroundTexture = null;
      this.backgroundTextureOwned = false;
    }
  }

  _drawBackground() {
    if (!this.backgroundLayer) {
      return;
    }
    this.backgroundLayer.removeChildren();
    this.backgroundVisual = null;
    const texCfg = this.config?.display?.backgroundTexture || {};
    const useTexture = Boolean(texCfg.enable && this.backgroundTexture);
    if (!useTexture) {
      return;
    }
    const width = this.config.display.canvasWidth;
    const height = this.config.display.canvasHeight;
    let sprite;
    try {
      sprite = new PIXI.TilingSprite({ texture: this.backgroundTexture, width, height });
    } catch (_) {
      sprite = new PIXI.TilingSprite(this.backgroundTexture, width, height);
    }
    const alpha = Number(texCfg.alpha ?? 1);
    const scaleX = Number(texCfg.scaleX ?? texCfg.scale ?? 1);
    const scaleY = Number(texCfg.scaleY ?? texCfg.scale ?? 1);
    sprite.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    if (texCfg.tint) {
      sprite.tint = toPixiColor(texCfg.tint);
    }
    try {
      sprite.tileScale.set(scaleX, scaleY);
      sprite.tilePosition.set(0, 0);
    } catch (_) {
      // ignore API differences across Pixi versions
    }
    this.backgroundLayer.addChild(sprite);
    this.backgroundVisual = sprite;
  }

  destroy() {
    this.conveyorHoldStart.clear();
    this.conveyorHovered.clear();
    this.conveyorHoverTarget.clear();
    this.conveyorPointerPos.clear();
    this.bricksByConveyor.clear();
    this.conveyorZones.clear();
    this.brickHoldStart.clear();
    this.brickSprites.forEach((sprite) => sprite.destroy());
    this.brickSprites.clear();
    this.effectVisuals.forEach((effect) => effect?.node?.destroy?.());
    this.effectVisuals = [];
    this.dueMarkerAnchors.clear();
    this.furnaceVisuals.clear();
    if (this.app) {
      // Do not destroy textures from the global Assets cache here.
      // Destroying cached BaseTextures breaks subsequent trial loads; if cleanup is
      // needed, use PIXI.Assets.unload() on specific asset keys instead.
      this.app.destroy(true, { children: true, texture: false, baseTexture: false });
      const view = this.app.canvas || this.app.view;
      if (this.root && view && view.parentNode === this.root) {
        this.root.removeChild(view);
      }
    }
    if (this.backgroundTextureOwned && this.backgroundTexture?.destroy) {
      this.backgroundTexture.destroy(true);
    }
    if (this.beltTextureOwned && this.beltTexture?.destroy) {
      this.beltTexture.destroy(true);
    }
    this.app = null;
    this.backgroundVisual = null;
    this.backgroundTexture = null;
    this.backgroundTextureOwned = false;
    this.beltTexture = null;
    this.beltTextureOwned = false;
  }
}
