// @ts-nocheck
import { createCoreRng } from '@experiments/core';
import { createSampler } from './sampling.js';
import { getBrickVisibleWidth } from './brick_logic.js';

const BRICK_STATUS = {
  ACTIVE: 'active',
  CLEARED: 'cleared',
  DROPPED: 'dropped'
};

/**
 * Represents the trial-level game state, including conveyors, bricks, and
 * high-level statistics. Rendering and jsPsych plugin orchestrate updates
 * via the public methods exposed here.
 */
export class GameState {
  constructor(config, { onEvent, seed } = {}) {
    this.config = config;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.rng = createCoreRng(seed ?? config?.trial?.seed);
    this.samplerCache = new WeakMap();
    this.elapsed = 0;

    this.events = [];
    this.stats = {
      spawned: 0,
      cleared: 0,
      dropped: 0,
      clickErrors: 0,
      points: 0
    };

    this.bricks = new Map();
    this.conveyors = [];
    this.conveyorsById = new Map();
    this.spawnControllers = [];
    this.pendingDropVisuals = [];
    this.nextBrickId = 0;
    this.globalInterSpawnSampler = this._makeInterSpawnSampler(this.config?.bricks?.spawn || {});
    this.nextGlobalSpawnAt = 0;
    this.defaultConveyorLength = this.config.display?.canvasWidth ?? 1000;
    this.categoryPalettes = this._prepareBrickCategories();
    this.brickCategories = this.categoryPalettes.color;
    this.forcedControl = this._buildForcedControlConfig();
    this._initConveyors();
    this._initBricks();
    this._initForcedControl();
  }

  _log(type, payload = {}) {
    const event = {
      time: this.elapsed,
      type,
      ...payload
    };
    this.events.push(event);
    this.onEvent(event);
  }

  _initConveyors() {
    const cfg = this.config;
    const n = cfg.conveyors.nConveyors;
    const beltHeight = cfg.display.beltHeight;
    const gap = cfg.display.beltGap;
    const totalHeight = n * beltHeight + (n - 1) * gap;
    const topOffset = (cfg.display.canvasHeight - totalHeight) / 2;
    const explicitLengths = Array.isArray(cfg.conveyors.lengthPx) ? cfg.conveyors.lengthPx : null;
    const lengthSampler = explicitLengths ? null : this._makeLengthSampler(cfg.conveyors.lengthPx);
    const speedSampler = createSampler(cfg.conveyors.speedPxPerSec, this.rng);
    const interSpawnSampler = this._makeInterSpawnSampler(cfg.bricks.spawn);
    const configuredBrickWidth = Number(cfg.display?.brickWidth);
    const brickWidth = Number.isFinite(configuredBrickWidth) ? Math.max(8, configuredBrickWidth) : 80;
    const minLength = brickWidth * 2;
    const fallbackLength = Number.isFinite(Number(cfg.display?.canvasWidth))
      ? Math.max(minLength, Number(cfg.display.canvasWidth))
      : Math.max(minLength, 1000);
    let defaultLength = null;
    for (let i = 0; i < n; i += 1) {
      const sampledLength = explicitLengths
        ? Number(explicitLengths[i] ?? explicitLengths[explicitLengths.length - 1])
        : Number(lengthSampler());
      const length = Number.isFinite(sampledLength)
        ? Math.max(minLength, sampledLength)
        : fallbackLength;
      const speed = Math.max(0, speedSampler());
      const conveyor = {
        id: `c${i}`,
        index: i,
        y: topOffset + i * (beltHeight + gap),
        length,
        speed,
        interSpawnSampler,
        nextSpawnAt: 0,
        activeIds: []
      };
      if (defaultLength === null) {
        defaultLength = length;
      }
      this.conveyors.push(conveyor);
      this.conveyorsById.set(conveyor.id, conveyor);
    }
    if (defaultLength !== null) {
      this.defaultConveyorLength = defaultLength;
    }
  }

  _initBricks() {
    const hasConfiguredSet = this._initForcedBricks();
    if (hasConfiguredSet) {
      return;
    }
    const cfg = this.config;
    const initialCount = Math.max(0, Math.floor(this._resolveValue(cfg.bricks.initialBricks)));
    if (initialCount === 0) {
      return;
    }
    const configuredBrickWidth = Number(cfg.display?.brickWidth);
    const brickWidth = Number.isFinite(configuredBrickWidth) ? Math.max(8, configuredBrickWidth) : 80;
    for (let i = 0; i < initialCount; i += 1) {
      const conveyor = this.conveyors[i % this.conveyors.length];
      const fraction = (i + 1) / (initialCount + 1);
      const length = Number(conveyor.length) - brickWidth;
      const x = Math.max(0, fraction * length);
      this._spawnBrick(conveyor, { x, reason: 'initial' });
    }
  }

  _initForcedBricks() {
    const set = this._materializeForcedSet();
    if (set.length === 0) {
      return false;
    }
    set.forEach((entry, index) => {
      const conveyorIndexSpec = entry?.conveyorIndex ?? entry?.conveyor_index ?? 0;
      const conveyorIndexRaw = Number(this._sampleField(conveyorIndexSpec));
      const conveyorIndex = Number.isFinite(conveyorIndexRaw)
        ? Math.max(0, Math.min(this.conveyors.length - 1, Math.floor(conveyorIndexRaw)))
        : 0;
      const conveyor = this.conveyors[conveyorIndex];
      if (!conveyor) {
        return;
      }
      const sampledWidth = this._sampleField(entry?.width ?? entry?.processingWidthPx ?? entry?.processing_width_px);
      const entryWidthRaw = Number(sampledWidth);
      const entryWidth = Number.isFinite(entryWidthRaw)
        ? Math.max(8, entryWidthRaw)
        : Math.max(8, Number(this.config.display.brickWidth) || 80);
      const maxX = Math.max(0, conveyor.length - entryWidth);
      const xRaw = Number(this._sampleField(entry?.x));
      const xFractionRaw = Number(this._sampleField(entry?.xFraction ?? entry?.x_fraction));
      const x = Number.isFinite(xRaw)
        ? Math.max(0, Math.min(maxX, xRaw))
        : Number.isFinite(xFractionRaw)
          ? Math.max(0, Math.min(maxX, xFractionRaw * maxX))
          : (index + 1) / (set.length + 1) * maxX;
      const sampledValue = this._sampleField(entry?.value);
      const sampledWorkDeadlineMs = this._sampleField(entry?.workDeadlineMs ?? entry?.work_deadline_ms);
      const sampledTargetHoldMs = this._sampleField(entry?.targetHoldMs ?? entry?.target_hold_ms);
      const sampledProgressPerPerfect = this._sampleField(entry?.progressPerPerfect ?? entry?.progress_per_perfect);
      const categories = this._resolveCategorySelectionsForEntry(entry);
      this._spawnBrick(conveyor, {
        x,
        reason: 'forced_set',
        bypassSpacing: true,
        categories,
        traits: {
          color: entry?.color ?? entry?.colour ?? null,
          width: Number.isFinite(entryWidthRaw) ? entryWidth : null,
          borderColor: entry?.borderColor ?? entry?.border_colour ?? entry?.border_color ?? null,
          shape: entry?.shape ?? null,
          textureStyle: entry?.textureStyle ?? entry?.texture_style ?? entry?.texture ?? null
        },
        metadata: {
          forcedSetIndex: index,
          label: entry?.label ?? null,
          value: Number.isFinite(Number(sampledValue)) ? Number(sampledValue) : null,
          isTarget: Boolean(entry?.isTarget ?? entry?.is_target),
          workDeadlineMs: Number.isFinite(Number(sampledWorkDeadlineMs))
            ? Number(sampledWorkDeadlineMs)
            : null,
          targetHoldMs: Number.isFinite(Number(sampledTargetHoldMs))
            ? Number(sampledTargetHoldMs)
            : null,
          progressPerPerfect: Number.isFinite(Number(sampledProgressPerPerfect))
            ? Number(sampledProgressPerPerfect)
            : null
        }
      });
    });
    return true;
  }

  _materializeForcedSet() {
    const bricksCfg = this.config?.bricks || {};
    const plan = bricksCfg?.forcedSetPlan;
    if (plan && typeof plan === 'object' && plan.enable !== false) {
      const generated = this._generateForcedSetFromPlan(plan);
      if (generated.length > 0) {
        return generated;
      }
    }
    return Array.isArray(bricksCfg?.forcedSet) ? bricksCfg.forcedSet : [];
  }

  _generateForcedSetFromPlan(plan) {
    const countRaw = Number(this._sampleField(plan.count ?? plan.n ?? 0));
    const count = Number.isFinite(countRaw) ? Math.max(0, Math.floor(countRaw)) : 0;
    if (count <= 0) {
      return [];
    }
    const defaults = plan.defaults && typeof plan.defaults === 'object' ? plan.defaults : {};
    const fields = plan.fields && typeof plan.fields === 'object' ? plan.fields : {};
    const resolvers = Object.entries(fields).reduce((acc, [fieldKey, fieldSpec]) => {
      acc[fieldKey] = this._createForcedPlanFieldResolver(fieldSpec);
      return acc;
    }, {});
    const output = [];
    for (let i = 0; i < count; i += 1) {
      const entry = {
        ...defaults
      };
      Object.entries(resolvers).forEach(([fieldKey, resolver]) => {
        entry[fieldKey] = resolver(i);
      });
      output.push(entry);
    }
    return output;
  }

  _createForcedPlanFieldResolver(fieldSpec) {
    if (fieldSpec && typeof fieldSpec === 'object' && !Array.isArray(fieldSpec)) {
      if (Array.isArray(fieldSpec.values)) {
        const values = fieldSpec.values.slice();
        if (values.length === 0) {
          return () => null;
        }
        const drawMode = String(fieldSpec.draw ?? fieldSpec.mode ?? 'with_replacement').toLowerCase();
        if (drawMode === 'sequence') {
          return (index) => values[index % values.length];
        }
        try {
          const sampler = createSampler({
            type: 'list',
            values,
            weights: fieldSpec.weights,
            draw: fieldSpec.draw,
            mode: fieldSpec.mode,
            without_replacement: fieldSpec.without_replacement,
            shuffle: fieldSpec.shuffle
          }, this.rng);
          return () => sampler();
        } catch (error) {
          console.warn('Invalid forced-set list field spec; falling back to uniform with replacement.', fieldSpec, error);
          return () => values[Math.floor(this.rng.nextRange(0, values.length))];
        }
      }
      if (typeof fieldSpec.type === 'string') {
        return () => this._sampleField(fieldSpec);
      }
    }
    return () => fieldSpec;
  }

  _sampleField(spec) {
    if (spec && typeof spec === 'object' && !Array.isArray(spec) && (typeof spec.type === 'string')) {
      try {
        let sampler = this.samplerCache.get(spec);
        if (!sampler) {
          sampler = createSampler(spec, this.rng);
          this.samplerCache.set(spec, sampler);
        }
        return sampler();
      } catch (error) {
        console.warn('Invalid forced-set sampler spec; falling back to raw value.', spec, error);
        return spec.value ?? null;
      }
    }
    return spec;
  }

  _resolveValue(spec) {
    if (typeof spec === 'number') {
      return spec;
    }
    if (spec && typeof spec === 'object' && spec.type === 'fixed') {
      return Number(spec.value);
    }
    return 0;
  }

  _prepareBrickCategories() {
    const normalizePalette = (entries, dimension, featureExtractor) => {
      if (!Array.isArray(entries) || entries.length === 0) {
        return [];
      }
      return entries
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const baseTraits = featureExtractor(entry);
          if (!baseTraits) {
            return null;
          }
          const assignTraits = entry.assign && typeof entry.assign === 'object'
            ? this._collectCategoryTraitSpecs(entry.assign)
            : {};
          return {
            id: entry.id ?? `${dimension}${index + 1}`,
            label: entry.label ?? null,
            dimension,
            traits: {
              ...baseTraits,
              ...this._collectCategoryTraitSpecs(entry),
              ...assignTraits
            }
          };
        })
        .filter(Boolean);
    };

    return {
      color: normalizePalette(this.config?.bricks?.colorCategories, 'color', (entry) => {
        const color = entry.color ?? entry.colour ?? null;
        if (color === null || color === undefined) {
          return null;
        }
        return { color };
      }),
      width: normalizePalette(this.config?.bricks?.widthCategories, 'width', (entry) => {
        const width = entry.width;
        const isSampler = this._isSamplerSpec(width);
        if (!isSampler && !Number.isFinite(Number(width))) {
          return null;
        }
        return { width };
      }),
      borderColor: normalizePalette(this.config?.bricks?.borderColorCategories, 'borderColor', (entry) => {
        const borderColor = entry.borderColor ?? entry.border_colour ?? entry.border_color ?? null;
        if (borderColor === null || borderColor === undefined) {
          return null;
        }
        return { borderColor };
      }),
      shape: normalizePalette(this.config?.bricks?.shapeCategories, 'shape', (entry) => {
        const shape = entry.shape;
        const isSampler = this._isSamplerSpec(shape);
        const normalized = isSampler ? shape : this._normalizeBrickShape(shape);
        if (!normalized) {
          return null;
        }
        return { shape: normalized };
      }),
      texture: normalizePalette(this.config?.bricks?.textureCategories, 'texture', (entry) => {
        const textureStyle = entry.textureStyle ?? entry.texture_style ?? entry.texture ?? null;
        if (textureStyle === null || textureStyle === undefined) {
          return null;
        }
        return { textureStyle };
      })
    };
  }

  _normalizeBrickShape(rawShape) {
    if (typeof rawShape !== 'string') {
      return null;
    }
    const normalized = rawShape.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const aliases = {
      square: 'rect',
      rectangle: 'rect',
      rounded: 'rounded_rect',
      rounded_rectangle: 'rounded_rect'
    };
    return aliases[normalized] ?? normalized;
  }

  _isSamplerSpec(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof value.type === 'string');
  }

  _collectCategoryTraitSpecs(source) {
    if (!source || typeof source !== 'object') {
      return {};
    }
    const out = {};
    const copyRaw = (keys, targetKey, transform = (value) => value) => {
      const key = keys.find((candidate) => source[candidate] !== undefined && source[candidate] !== null);
      if (!key) {
        return;
      }
      const rawValue = source[key];
      if (!(typeof rawValue === 'string' || typeof rawValue === 'number' || this._isSamplerSpec(rawValue))) {
        return;
      }
      const value = transform(rawValue);
      if (value === null || value === undefined || value === '') {
        return;
      }
      out[targetKey] = value;
    };

    copyRaw(['color', 'colour'], 'color');
    copyRaw(['borderColor', 'border_colour', 'border_color'], 'borderColor');
    copyRaw(['shape'], 'shape');
    copyRaw(['textureStyle', 'texture_style', 'texture'], 'textureStyle');
    copyRaw(['brickLabel', 'brick_label'], 'label');

    copyRaw(['width'], 'width');
    copyRaw(['value'], 'value');
    copyRaw(['workDeadlineMs', 'work_deadline_ms'], 'workDeadlineMs');
    copyRaw(['targetHoldMs', 'target_hold_ms'], 'targetHoldMs');
    copyRaw(['progressPerPerfect', 'progress_per_perfect'], 'progressPerPerfect');
    return out;
  }

  _materializeBrickTraits(traitSpecs) {
    const specs = traitSpecs && typeof traitSpecs === 'object' ? traitSpecs : {};
    const out = {};
    const readString = (key, transform = (value) => value) => {
      if (specs[key] === undefined || specs[key] === null) {
        return;
      }
      const sampled = this._sampleField(specs[key]);
      if (typeof sampled !== 'string') {
        return;
      }
      const value = transform(sampled);
      if (typeof value === 'string' && value) {
        out[key] = value;
      }
    };
    const readNumber = (key, { min = null, max = null } = {}) => {
      if (specs[key] === undefined || specs[key] === null) {
        return;
      }
      const sampled = this._sampleField(specs[key]);
      const value = Number(sampled);
      if (!Number.isFinite(value)) {
        return;
      }
      let next = value;
      if (min !== null) {
        next = Math.max(min, next);
      }
      if (max !== null) {
        next = Math.min(max, next);
      }
      out[key] = next;
    };

    readString('color');
    readString('borderColor');
    readString('label');
    readString('shape', (value) => this._normalizeBrickShape(value));
    readString('textureStyle', (value) => value.trim());
    readNumber('width', { min: 8 });
    readNumber('value');
    readNumber('workDeadlineMs', { min: 0 });
    readNumber('targetHoldMs', { min: 0 });
    readNumber('progressPerPerfect', { min: 0 });
    return out;
  }

  _pickRandomCategory(dimension) {
    const palette = this.categoryPalettes?.[dimension];
    if (!Array.isArray(palette) || palette.length === 0) {
      return null;
    }
    const index = Math.floor(this.rng.nextRange(0, palette.length));
    return palette[index] ?? null;
  }

  _resolveCategoryById(dimension, id) {
    if (!id) {
      return null;
    }
    const palette = this.categoryPalettes?.[dimension];
    if (!Array.isArray(palette) || palette.length === 0) {
      return null;
    }
    return palette.find((item) => item.id === id) ?? null;
  }

  _resolveCategorySelectionsForEntry(entry) {
    const categoryIds = entry?.categoryIds && typeof entry.categoryIds === 'object' ? entry.categoryIds : {};
    const sampledId = (keys) => {
      const first = keys
        .map((key) => entry?.[key])
        .find((value) => value !== undefined && value !== null);
      return this._sampleField(first);
    };
    return {
      color: this._resolveCategoryById(
        'color',
        sampledId(['colorCategoryId', 'color_category_id']) ?? categoryIds.color
      ),
      width: this._resolveCategoryById(
        'width',
        sampledId(['widthCategoryId', 'width_category_id']) ?? categoryIds.width
      ),
      borderColor: this._resolveCategoryById(
        'borderColor',
        sampledId(['borderColorCategoryId', 'border_color_category_id', 'borderColor_category_id']) ?? categoryIds.borderColor
      ),
      shape: this._resolveCategoryById(
        'shape',
        sampledId(['shapeCategoryId', 'shape_category_id']) ?? categoryIds.shape
      ),
      texture: this._resolveCategoryById(
        'texture',
        sampledId(['textureCategoryId', 'texture_category_id']) ?? categoryIds.texture
      )
    };
  }

  _resolveBrickTraits({ categories = null, traits = null, metadata = null } = {}) {
    const resolvedCategories = {
      color: categories?.color ?? this._pickRandomCategory('color'),
      width: categories?.width ?? this._pickRandomCategory('width'),
      borderColor: categories?.borderColor ?? this._pickRandomCategory('borderColor'),
      shape: categories?.shape ?? this._pickRandomCategory('shape'),
      texture: categories?.texture ?? this._pickRandomCategory('texture')
    };
    const categoryTraits = {};
    ['color', 'width', 'borderColor', 'shape', 'texture'].forEach((dimension) => {
      const catTraits = resolvedCategories[dimension]?.traits;
      if (!catTraits || typeof catTraits !== 'object') {
        return;
      }
      Object.entries(catTraits).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          return;
        }
        if (categoryTraits[key] === undefined) {
          categoryTraits[key] = value;
        }
      });
    });
    return {
      categories: resolvedCategories,
      traits: this._materializeBrickTraits({
        ...categoryTraits,
        ...this._collectCategoryTraitSpecs(traits),
        ...this._collectCategoryTraitSpecs(metadata)
      })
    };
  }

  _makeLengthSampler(lengthSpec) {
    if (typeof lengthSpec === 'number') {
      const value = Number(lengthSpec);
      return () => value;
    }
    if (lengthSpec && typeof lengthSpec === 'object') {
      if (typeof lengthSpec.value === 'number' && !lengthSpec.type) {
        const value = Number(lengthSpec.value);
        return () => value;
      }
      const sampler = createSampler(lengthSpec, this.rng);
      return () => sampler();
    }
    const fallback = this.config.display?.canvasWidth ?? 1000;
    return () => fallback;
  }

  _makeInterSpawnSampler(spawnCfg = {}) {
    const interSpawnSpec = spawnCfg?.interSpawnDist;
    if (typeof interSpawnSpec === 'number' && Number.isFinite(interSpawnSpec) && interSpawnSpec >= 0) {
      return () => interSpawnSpec;
    }
    if (interSpawnSpec && typeof interSpawnSpec === 'object') {
      return createSampler(interSpawnSpec, this.rng);
    }
    const spawnRate = this._resolveValue(spawnCfg?.ratePerSec);
    if (Number.isFinite(spawnRate) && spawnRate > 0) {
      // Fall back to Poisson arrivals when only ratePerSec is configured.
      return createSampler({ type: 'exponential', lambda: spawnRate }, this.rng);
    }
    // Spawning disabled.
    return () => Number.POSITIVE_INFINITY;
  }

  _buildForcedControlConfig() {
    const forced = this.config?.trial?.forcedOrder ?? {};
    const switchModeRaw = String(forced.switchMode ?? 'on_clear').toLowerCase();
    const switchMode = ['on_clear', 'interval', 'interval_or_clear'].includes(switchModeRaw)
      ? switchModeRaw
      : 'on_clear';
    return {
      enabled: Boolean(forced.enable),
      switchMode,
      switchIntervalMs: Math.max(100, Number(forced.switchIntervalMs ?? 8000)),
      switchOnDrop: forced.switchOnDrop !== false,
      sequence: Array.isArray(forced.sequence) ? forced.sequence : null,
      spotlightPadding: Math.max(0, Number(forced.spotlightPadding ?? 18)),
      dimAlpha: Math.max(0, Math.min(0.95, Number(forced.dimAlpha ?? 0.45))),
      coverStory: {
        enableAmmoCue: Boolean(forced.coverStory?.enableAmmoCue)
      },
      activeOrderIndex: -1,
      activeBrickId: null,
      nextSwitchAtMs: null,
      orderedBrickIds: []
    };
  }

  _initForcedControl() {
    if (!this.forcedControl.enabled) {
      return;
    }
    const configured = Array.from(this.bricks.values())
      .sort((a, b) => (a.forcedSetIndex ?? Number.MAX_SAFE_INTEGER) - (b.forcedSetIndex ?? Number.MAX_SAFE_INTEGER));
    const sequence = this.forcedControl.sequence;
    if (Array.isArray(sequence) && sequence.length > 0) {
      const chosen = sequence
        .map((idxRaw) => Number(idxRaw))
        .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < configured.length)
        .map((idx) => configured[Math.floor(idx)]?.id)
        .filter(Boolean);
      this.forcedControl.orderedBrickIds = chosen;
    } else {
      this.forcedControl.orderedBrickIds = configured.map((brick) => brick.id);
    }
    this._setForcedActiveBrick(0, 'trial_start');
  }

  _setForcedActiveBrick(orderIndex, reason) {
    if (!this.forcedControl.enabled) {
      return;
    }
    const previous = this.forcedControl.activeBrickId;
    const order = this.forcedControl.orderedBrickIds || [];
    let chosenIndex = -1;
    let chosenBrickId = null;
    for (let i = Math.max(0, orderIndex); i < order.length; i += 1) {
      const id = order[i];
      const candidate = this.bricks.get(id);
      if (candidate && candidate.status === BRICK_STATUS.ACTIVE) {
        chosenIndex = i;
        chosenBrickId = id;
        break;
      }
    }
    this.forcedControl.activeOrderIndex = chosenIndex;
    this.forcedControl.activeBrickId = chosenBrickId;
    this._scheduleForcedTimedSwitch();
    this._log('brick_focus_changed', {
      reason,
      previous_brick_id: previous,
      active_brick_id: chosenBrickId,
      active_order_index: chosenIndex
    });
  }

  _advanceForcedActiveBrick(reason) {
    if (!this.forcedControl.enabled) {
      return;
    }
    const nextIndex = this.forcedControl.activeOrderIndex + 1;
    this._setForcedActiveBrick(nextIndex, reason);
  }

  _scheduleForcedTimedSwitch() {
    if (!this.forcedControl.enabled) {
      return;
    }
    if (this.forcedControl.switchMode === 'interval' || this.forcedControl.switchMode === 'interval_or_clear') {
      this.forcedControl.nextSwitchAtMs = this.elapsed + this.forcedControl.switchIntervalMs;
    } else {
      this.forcedControl.nextSwitchAtMs = null;
    }
  }

  _computeBrickY(conveyorY, brickHeight) {
    const beltHeight = Math.max(1, Number(this.config?.display?.beltHeight) || 1);
    const fallbackY = conveyorY + (beltHeight - brickHeight) / 2;
    const bandCfg = this.config?.display?.beltTexture?.brickContactBand;
    if (!bandCfg || bandCfg.enable !== true) {
      return fallbackY;
    }
    const readInsetPx = (pxValue, ratioValue) => {
      const px = Number(pxValue);
      if (Number.isFinite(px)) {
        return px;
      }
      const ratio = Number(ratioValue);
      if (Number.isFinite(ratio)) {
        return ratio * beltHeight;
      }
      return 0;
    };
    const topInset = Math.max(0, readInsetPx(bandCfg.topInsetPx, bandCfg.topInsetRatio));
    const bottomInset = Math.max(0, readInsetPx(bandCfg.bottomInsetPx, bandCfg.bottomInsetRatio));
    const bandTop = Math.min(beltHeight, topInset);
    const bandBottom = Math.max(bandTop, beltHeight - bottomInset);
    const bandCenterY = (bandTop + bandBottom) / 2;
    const offsetY = Number.isFinite(Number(bandCfg.offsetYPx)) ? Number(bandCfg.offsetYPx) : 0;
    return conveyorY + bandCenterY - brickHeight / 2 + offsetY;
  }

  /**
   * Spawns a new brick on the given conveyor if safety constraints permit.
   */
  _spawnBrick(conveyor, { x = 0, reason = 'spawn', bypassSpacing = false, categories = null, traits = null, metadata = null } = {}) {
    const cfg = this.config;
    const { categories: selectedCategories, traits: resolvedTraits } = this._resolveBrickTraits({
      categories,
      traits,
      metadata
    });
    const widthRaw = Number(resolvedTraits.width ?? cfg.display.brickWidth);
    const width = Number.isFinite(widthRaw) ? Math.max(8, widthRaw) : Math.max(8, Number(cfg.display.brickWidth) || 80);
    const minSpacing = cfg.bricks.spawn.minSpacingPx ?? 0;
    const maxActive = cfg.bricks.spawn.maxActivePerConveyor ?? Infinity;
    const activeBricks = conveyor.activeIds.map((id) => this.bricks.get(id)).filter(Boolean);

    if (activeBricks.length >= maxActive) {
      return false;
    }
    const id = `b${++this.nextBrickId}`;
    const pickedColor = resolvedTraits.color ?? cfg.display.brickColor;
    const pickedBorderColor = resolvedTraits.borderColor ?? cfg.display.brickBorderColor ?? null;
    const pickedShape = this._normalizeBrickShape(resolvedTraits.shape ?? cfg.display.brickShape) ?? 'rounded_rect';
    const pickedTextureStyle = resolvedTraits.textureStyle ?? null;
    const speed = Math.max(0, conveyor.speed);
    const buffer = Math.max(0, minSpacing);
    const newStart = x;
    const newEnd = x + width;
    const overlaps = !bypassSpacing && activeBricks.some((existing) => {
      const existingStart = existing.x;
      const existingEnd = existing.x + existing.width;
      return newStart < existingEnd + buffer && newEnd + buffer > existingStart;
    });
    if (overlaps) {
      return false;
    }
    const optionalNumber = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const brickHeight = Number.isFinite(Number(cfg.display.brickHeight))
      ? Math.max(8, Number(cfg.display.brickHeight))
      : 60;
    const brick = {
      id,
      conveyorId: conveyor.id,
      status: BRICK_STATUS.ACTIVE,
      x,
      y: this._computeBrickY(conveyor.y, brickHeight),
      speed,
      width,
      initialWidth: width,
      height: brickHeight,
      createdAt: this.elapsed,
      clicks: 0,
      holds: 0,
      clearProgress: 0,
      isHovered: false,
      color: pickedColor,
      borderColor: pickedBorderColor,
      shape: pickedShape,
      textureStyle: pickedTextureStyle,
      colorCategoryId: selectedCategories.color?.id ?? null,
      colorCategoryLabel: selectedCategories.color?.label ?? null,
      widthCategoryId: selectedCategories.width?.id ?? null,
      widthCategoryLabel: selectedCategories.width?.label ?? null,
      borderColorCategoryId: selectedCategories.borderColor?.id ?? null,
      borderColorCategoryLabel: selectedCategories.borderColor?.label ?? null,
      shapeCategoryId: selectedCategories.shape?.id ?? null,
      shapeCategoryLabel: selectedCategories.shape?.label ?? null,
      textureCategoryId: selectedCategories.texture?.id ?? null,
      textureCategoryLabel: selectedCategories.texture?.label ?? null,
      value: Math.max(0, Number(resolvedTraits.value ?? 0)),
      isTarget: Boolean(metadata?.isTarget),
      workDeadlineMs: optionalNumber(resolvedTraits.workDeadlineMs),
      targetHoldMs: optionalNumber(resolvedTraits.targetHoldMs),
      progressPerPerfect: optionalNumber(resolvedTraits.progressPerPerfect),
      forcedSetIndex: optionalNumber(metadata?.forcedSetIndex),
      label: resolvedTraits.label ?? metadata?.label ?? null
    };
    this.bricks.set(id, brick);
    conveyor.activeIds.push(id);
    this.stats.spawned += 1;
    this._log('brick_spawned', {
      brick_id: id,
      conveyor_id: conveyor.id,
      speed_px_s: speed,
      reason,
      color: pickedColor,
      border_color: pickedBorderColor,
      shape: pickedShape,
      texture_style: pickedTextureStyle,
      color_category_id: brick.colorCategoryId,
      color_category_label: brick.colorCategoryLabel,
      width_category_id: brick.widthCategoryId,
      width_category_label: brick.widthCategoryLabel,
      border_color_category_id: brick.borderColorCategoryId,
      border_color_category_label: brick.borderColorCategoryLabel,
      shape_category_id: brick.shapeCategoryId,
      shape_category_label: brick.shapeCategoryLabel,
      texture_category_id: brick.textureCategoryId,
      texture_category_label: brick.textureCategoryLabel,
      value: brick.value,
      is_target: brick.isTarget,
      work_deadline_ms: brick.workDeadlineMs,
      target_hold_ms: brick.targetHoldMs,
      progress_per_perfect: brick.progressPerPerfect,
      forced_set_index: brick.forcedSetIndex
    });
    return true;
  }

  handleBrickHover(brickId, isHovering, timestamp, pointerPos = {}) {
    const { x = null, y = null } = pointerPos || {};
    const brick = this.bricks.get(brickId);
    if (!brick) {
      return;
    }
    if (!isHovering) {
      if (brick.isHovered) {
        brick.isHovered = false;
        this._log('brick_hover_end', {
          brick_id: brick.id,
          conveyor_id: brick.conveyorId,
          x,
          y
        });
      }
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this._log('brick_hover_blocked', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y,
        blocked_reason: gate.reason
      });
      return;
    }
    if (!brick.isHovered) {
      brick.isHovered = true;
      this._log('brick_hover_start', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y
      });
    }
  }

  /**
   * Removes a brick and updates stats/logging.
   */
  _finalizeBrick(brick, status, payload = {}) {
    if (!brick || brick.status !== BRICK_STATUS.ACTIVE) {
      return;
    }
    brick.status = status;
    const conveyor = this.conveyorsById.get(brick.conveyorId);
    if (conveyor) {
      conveyor.activeIds = conveyor.activeIds.filter((id) => id !== brick.id);
    }
    this.bricks.delete(brick.id);
    const eventType = status === BRICK_STATUS.CLEARED ? 'brick_cleared' : 'brick_dropped';
    if (status === BRICK_STATUS.CLEARED) {
      this.stats.cleared += 1;
      this.stats.points += Math.max(0, Number(brick.value ?? 0));
    } else if (status === BRICK_STATUS.DROPPED) {
      this.stats.dropped += 1;
      const dropWidth = Math.max(0, Number(payload.visible_width_px ?? brick.width) || 0);
      this.pendingDropVisuals.push({
        brickId: brick.id,
        conveyorId: brick.conveyorId,
        x: brick.x,
        y: brick.y,
        width: dropWidth,
        height: brick.height,
        color: brick.color,
        borderColor: brick.borderColor,
        shape: brick.shape,
        textureStyle: brick.textureStyle
      });
    }
    this._log(eventType, {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      lifetime: this.elapsed - brick.createdAt,
      x: brick.x,
      y: brick.y,
      value: brick.value,
      cumulative_points: this.stats.points,
      ...payload
    });
    if (this.forcedControl.enabled && brick.id === this.forcedControl.activeBrickId) {
      if (status === BRICK_STATUS.CLEARED) {
        this._advanceForcedActiveBrick('active_brick_cleared');
      } else if (status === BRICK_STATUS.DROPPED && this.forcedControl.switchOnDrop) {
        this._advanceForcedActiveBrick('active_brick_dropped');
      }
    }
  }

  _isCurrentForcedBrick(brickId) {
    if (!this.forcedControl.enabled) {
      return true;
    }
    return brickId === this.forcedControl.activeBrickId;
  }

  _canWorkOnBrick(brick) {
    if (!brick || brick.status !== BRICK_STATUS.ACTIVE) {
      return { ok: false, reason: 'inactive' };
    }
    if (!this._isCurrentForcedBrick(brick.id)) {
      return { ok: false, reason: 'forced_order_locked' };
    }
    if (Number.isFinite(brick.workDeadlineMs) && this.elapsed > brick.workDeadlineMs) {
      return { ok: false, reason: 'work_window_closed' };
    }
    return { ok: true, reason: null };
  }

  /**
   * Handles player interaction depending on completion mode.
   */
  handleBrickInteraction(brickId, timestamp, clickPos = {}) {
    const { x = null, y = null } = clickPos || {};
    const brick = this.bricks.get(brickId);
    if (!brick) {
      // Log the attempted click with coordinates even if invalid
      this.stats.clickErrors += 1;
      this._log('brick_click', { brick_id: brickId ?? null, x, y, valid: false });
      this._log('brick_click_invalid', { brick_id: brickId ?? null, x, y });
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this.stats.clickErrors += 1;
      this._log('brick_click', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y,
        valid: false,
        blocked_reason: gate.reason
      });
      return;
    }
    // Log a canonical click event before applying completion logic
    this._log('brick_click', {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      x,
      y,
      valid: true
    });
    const mode = this.config.bricks.completionMode;
    const params = this.config.bricks.completionParams || {};
    if (mode === 'single_click') {
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        clicks: brick.clicks + 1,
        x: brick.x,
        y: brick.y
      });
    } else if (mode === 'multi_click') {
      const required = Math.max(1, Number(params.clicks_required ?? 2));
      brick.clicks += 1;
      this._log('brick_click_progress', {
        brick_id: brick.id,
        clicks: brick.clicks,
        required
      });
      if (brick.clicks >= required) {
        this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
          completion_mode: mode,
          clicks: brick.clicks,
          x: brick.x,
          y: brick.y
        });
      }
    } else if (mode === 'hold_duration') {
      this._log('brick_click_progress', {
        brick_id: brick.id,
        note: 'Click ignored in hold_duration mode; use hold interactions.'
      });
    } else {
      // Future modes can plug in here (e.g., cognitive tasks).
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        clicks: brick.clicks + 1,
        x: brick.x,
        y: brick.y,
        note: 'Fallback clear for unimplemented mode.'
      });
    }
  }

  handleBrickHold(brickId, holdDurationMs, timestamp, clickPos = {}) {
    const { x = null, y = null } = clickPos || {};
    const brick = this.bricks.get(brickId);
    const holdMs = Math.max(0, Number(holdDurationMs) || 0);
    if (!brick) {
      this.stats.clickErrors += 1;
      this._log('brick_hold', { brick_id: brickId ?? null, x, y, valid: false, hold_ms: holdMs });
      return;
    }
    const gate = this._canWorkOnBrick(brick);
    if (!gate.ok) {
      this.stats.clickErrors += 1;
      this._log('brick_hold', {
        brick_id: brick.id,
        conveyor_id: brick.conveyorId,
        x,
        y,
        valid: false,
        hold_ms: holdMs,
        blocked_reason: gate.reason
      });
      return;
    }
    const mode = this.config.bricks.completionMode;
    if (mode !== 'hold_duration') {
      this.handleBrickInteraction(brickId, timestamp, clickPos);
      return;
    }
    const params = this.config.bricks.completionParams || {};
    const targetHoldMs = Math.max(50, Number(brick.targetHoldMs ?? params.target_hold_ms ?? 700));
    const overshootToleranceMs = Math.max(0, Number(params.overshoot_tolerance_ms ?? 0));
    const progressPerPerfect = Math.max(
      0.01,
      Math.min(1, Number(brick.progressPerPerfect ?? params.progress_per_perfect ?? 0.35))
    );
    const progressCurve = Math.max(0.1, Number(params.progress_curve ?? 1));
    const widthScalingEnabled = params.width_scaling !== false;
    const widthReferencePx = Math.max(1, Number(params.width_reference_px ?? this.config.display.brickWidth ?? 160));
    const widthScalingExponent = Math.max(0, Number(params.width_scaling_exponent ?? 1));
    const widthFactorRaw = widthScalingEnabled ? (brick.width / widthReferencePx) : 1;
    const widthFactor = Math.max(0.2, Math.pow(Math.max(0.01, widthFactorRaw), widthScalingExponent));
    const overshoot = holdMs > targetHoldMs + overshootToleranceMs;
    const ratio = overshoot ? 0 : Math.max(0, Math.min(1, holdMs / targetHoldMs));
    const gainedUnscaled = Math.pow(ratio, progressCurve) * progressPerPerfect;
    const gained = gainedUnscaled / widthFactor;
    brick.holds += 1;
    brick.clearProgress = Math.max(0, Math.min(1, (brick.clearProgress ?? 0) + gained));
    this._log('brick_hold', {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      x,
      y,
      valid: true,
      hold_ms: holdMs,
      target_hold_ms: targetHoldMs,
      overshoot,
      width_factor: widthFactor,
      width_reference_px: widthReferencePx,
      progress_gained: gained,
      progress_total: brick.clearProgress,
      holds: brick.holds
    });
    if (brick.clearProgress >= 1) {
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        holds: brick.holds,
        progress: brick.clearProgress,
        x: brick.x,
        y: brick.y
      });
    }
  }

  /**
   * Advances the simulation by dt milliseconds.
   */
  step(dtMs) {
    const dt = dtMs / 1000;
    this.elapsed += dtMs;
    const completionMode = this.config.bricks.completionMode;

    // Update brick positions and check for drops.
    this.bricks.forEach((brick) => {
      if (brick.status !== BRICK_STATUS.ACTIVE) {
        return;
      }
      const conveyor = this.conveyorsById.get(brick.conveyorId);
      const conveyorLength = conveyor ? conveyor.length : this.defaultConveyorLength;
      const speed = conveyor ? conveyor.speed : brick.speed;
      brick.speed = speed;
      const hoverCanProcess = completionMode === 'hover_to_clear' && brick.isHovered && this._canWorkOnBrick(brick).ok;
      if (hoverCanProcess) {
        const referenceWidth = Math.max(1, Number(brick.initialWidth ?? brick.width ?? 1));
        const progressDelta = (speed * dt) / referenceWidth;
        brick.clearProgress = Math.max(0, Math.min(1, (brick.clearProgress ?? 0) + progressDelta));
      } else {
        brick.x += speed * dt;
      }
      if (completionMode === 'hover_to_clear' && (brick.clearProgress ?? 0) >= 1) {
        this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
          completion_mode: completionMode,
          progress: brick.clearProgress,
          x: brick.x,
          y: brick.y
        });
        return;
      }
      const visibleWidth = getBrickVisibleWidth(brick, completionMode);
      if (brick.x + visibleWidth >= conveyorLength) {
        this._finalizeBrick(brick, BRICK_STATUS.DROPPED, {
          completion_mode: completionMode,
          visible_width_px: visibleWidth
        });
      }
    });

    if (this.forcedControl.enabled) {
      const mode = this.forcedControl.switchMode;
      if ((mode === 'interval' || mode === 'interval_or_clear') &&
        Number.isFinite(this.forcedControl.nextSwitchAtMs) &&
        this.elapsed >= this.forcedControl.nextSwitchAtMs) {
        this._advanceForcedActiveBrick('scheduled_switch');
      }
    }

    // Spawn logic.
    const maxTotal = this.config.bricks.maxBricksPerTrial ?? Infinity;
    const activeCount = this.bricks.size;
    const allowSpawn = !this.forcedControl.enabled;
    if (allowSpawn && activeCount < maxTotal) {
      const spawnRate = this._resolveValue(this.config.bricks.spawn.ratePerSec);
      const shouldConsider = spawnRate > 0 || this.config.bricks.spawn.interSpawnDist;
      if (shouldConsider) {
        if (this.config?.bricks?.spawn?.byConveyor === false) {
          if (this.elapsed >= this.nextGlobalSpawnAt) {
            // Try conveyors in randomized order until one accepts the spawn.
            const queue = this.conveyors.map((_, index) => index);
            for (let i = queue.length - 1; i > 0; i -= 1) {
              const j = Math.floor(this.rng.nextRange(0, i + 1));
              const tmp = queue[i];
              queue[i] = queue[j];
              queue[j] = tmp;
            }
            let spawned = false;
            queue.forEach((index) => {
              if (!spawned) {
                spawned = this._spawnBrick(this.conveyors[index]);
              }
            });
            const delay = this.globalInterSpawnSampler();
            this.nextGlobalSpawnAt = this.elapsed + delay * 1000;
            if (!spawned) {
              this.nextGlobalSpawnAt = this.elapsed + Math.min(1000, delay * 500);
            }
          }
        } else {
          this.conveyors.forEach((conveyor) => {
            const nextSpawn = conveyor.nextSpawnAt;
            if (this.elapsed >= nextSpawn) {
              const spawned = this._spawnBrick(conveyor);
              const delay = conveyor.interSpawnSampler();
              conveyor.nextSpawnAt = this.elapsed + delay * 1000;
              if (!spawned) {
                // If spawn failed due to spacing, retry sooner.
                conveyor.nextSpawnAt = this.elapsed + Math.min(1000, delay * 500);
              }
            }
          });
        }
      }
    }
  }

  /**
   * Returns a lightweight snapshot for HUD rendering.
   */
  getHUDStats() {
    const focusBrick = this.forcedControl.enabled
      ? this.bricks.get(this.forcedControl.activeBrickId)
      : null;
    return {
      timeElapsedMs: this.elapsed,
      bricksActive: this.bricks.size,
      spawned: this.stats.spawned,
      cleared: this.stats.cleared,
      dropped: this.stats.dropped,
      points: this.stats.points,
      focusBrickId: focusBrick?.id ?? null,
      focusBrickValue: focusBrick?.value ?? null
    };
  }

  getFocusState() {
    if (!this.forcedControl.enabled) {
      return {
        enabled: false,
        activeBrickId: null
      };
    }
    const active = this.bricks.get(this.forcedControl.activeBrickId) || null;
    const ammoLabel = this.forcedControl.coverStory.enableAmmoCue && active
      ? `${active.colorCategoryLabel ?? active.color ?? 'Current'} ammo`
      : null;
    return {
      enabled: true,
      activeBrickId: active?.id ?? null,
      spotlightPadding: this.forcedControl.spotlightPadding,
      dimAlpha: this.forcedControl.dimAlpha,
      ammoLabel
    };
  }

  /**
   * Returns serializable data for persistent storage.
   */
  exportData() {
    return {
      stats: { ...this.stats },
      events: this.events.slice()
    };
  }

  /**
   * Cleans up any remaining bricks (used when the trial ends abruptly).
   */
  forceEnd() {
    this.bricks.forEach((brick) => {
      this._finalizeBrick(brick, BRICK_STATUS.DROPPED, { forced: true });
    });
  }

  consumeDroppedVisuals() {
    if (!this.pendingDropVisuals.length) {
      return [];
    }
    const output = this.pendingDropVisuals.slice();
    this.pendingDropVisuals.length = 0;
    return output;
  }
}

export { BRICK_STATUS };
