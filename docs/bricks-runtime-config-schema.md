# Bricks Runtime Config Schema

This is the runtime-facing schema used by `tasks/bricks/src/runtime/*` and block planner code in `tasks/bricks/src/index.ts`.

## 1. Run Bricks with a specific config

Start app:

```bash
npm run dev
```

Run Bricks baseline:

```text
http://localhost:5173/?task=bricks&variant=baseline
```

Run Bricks Moray baseline (ported from DiscoveryProject):

```text
http://localhost:5173/?task=bricks&variant=moray1991_vpt_vdd_baseline
```

Run Bricks spotlight:

```text
http://localhost:5173/?task=bricks&variant=spotlight
```

Force Bricks spotlight config while keeping baseline variant:

```text
http://localhost:5173/?task=bricks&variant=baseline&config=bricks/spotlight
```

## 2. Top-level sections

Recognized top-level keys:

- `display`
- `conveyors`
- `bricks`
- `drt`
- `trial`
- `experiment`
- `debug`
- `difficultyModel`
- `selfReport`
- `instructions`
- `blocks`
- `manipulations`

`blocks/manipulations` are planning-level keys. Other sections are consumed by runtime.

## 3. Planning-level schema (`blocks` + `manipulations`)

### `blocks[]`

```ts
{
  label?: string;
  trials?: number;          // >= 1, default 1
  manipulation?: string;    // manipulation id
  overrides?: object;       // deep-merged into per-block config
}
```

### `manipulations[]`

```ts
{
  id: string;
  label?: string;
  overrides?: object;
  trialPlan?: {
    schedule?: {
      mode?: "weighted" | "sequence" | "quota_shuffle" | "block_quota_shuffle";
      sequence?: Array<string | number>;
      withoutReplacement?: boolean;
      without_replacement?: boolean;
    };
    variants?: Array<{
      id?: string;
      label?: string;
      weight?: number;      // > 0, default 1
      overrides?: object;   // deep-merged into per-trial config
    }>;
  };
}
```

## 4. Runtime sections

## 4.1 `display`

Core:

```ts
{
  canvasWidth: number;
  canvasHeight: number;
  viewportPaddingPx?: number; // default 24
  backgroundColor?: string | number;

  beltColor?: string | number;
  beltHeight?: number;
  beltGap?: number;

  brickWidth?: number;
  brickHeight?: number;
  brickCornerRadius?: number;
  brickColor?: string | number;
  brickBorderColor?: string | number;
  brickShape?: "rect" | "rounded_rect" | "pill" | "diamond" | "hex" | "triangle" | "parallelogram" | "trapezoid";
}
```

Shape aliases accepted:

- `"square"` / `"rectangle"` -> `"rect"`
- `"rounded"` / `"rounded_rectangle"` -> `"rounded_rect"`

### `display.ui`

```ts
{
  showHUD?: boolean;
  hudFontFamily?: string;
  hudFontSize?: number;
  hudFontWeight?: number | string;
  hudPanel?: boolean;
  hudPanelColor?: string | number;
  hudPanelAlpha?: number;        // 0..1
  showTimer?: boolean;
  showRemainingBlocks?: boolean;
  showDroppedBlocks?: boolean;
  showPoints?: boolean;
  showDRT?: boolean;
}
```

### `display.performance`

```ts
{
  maxDevicePixelRatio?: number;  // default 2
  maxFrameDtMs?: number;         // default 50
  maxActiveEffects?: number;     // default 240
}
```

### `display.dueDateMarker`

```ts
{
  enable?: boolean;
  color?: string | number;
  widthPx?: number;
  heightPx?: number;
  alpha?: number; // 0..1
}
```

### `display.endFurnace`

Supports `enable`, `offsetX`, and visual style values used by renderer presets:

- `wallColor`
- `wallShadeColor`
- `rimColor`
- `mouthColor`
- `emberColor`
- `style` (`"furnace" | "crusher" | "shredder" | "plasma_recycler"`)
- `bodyPanelLines` (bool)
- `hazardStripes` (bool), `hazardColorA`, `hazardColorB`
- `sideRivets` (bool)

### `display.missAnimation`

```ts
{
  mode?: "furnace";
  durationMs?: number;
  markerFlashMs?: number;
  flashColor?: string | number;
  disintegrate?: {
    shardCount?: number;
    durationMs?: number;
    gravityPxPerSec2?: number;
    speedMinPxPerSec?: number;
    speedMaxPxPerSec?: number;
    furnaceBias?: number;
  };
}
```

### `display.backgroundTexture`

```ts
{
  enable?: boolean;
  src?: string;                        // image mode
  renderMode?: "image" | "procedural_warehouse";
  alpha?: number;
  scale?: number;
  scrollFactor?: number;
  proceduralWarehouse?: {
    tileSizePx?: number;
    paverWidthPx?: number;
    paverHeightPx?: number;
    groutPx?: number;
    layout?: "grid" | "staggered";
    rowOffsetPx?: number;
    pattern?: "none" | "checker_alternating";
    alternationStrength?: number;
    variation?: number;
    edgeShadingAlpha?: number;
    noiseCount?: number;
    seamDashCount?: number;
    rivetCount?: number;
    dentCount?: number;
    crackCount?: number;
    baseColor?: string | number;
    groutColor?: string | number;
    seamDarkColor?: string | number;
    seamLightColor?: string | number;
    scratchColor?: string | number;
    rivetColor?: string | number;
  };
}
```

### `display.beltTexture`

```ts
{
  enable?: boolean;
  src?: string;                        // image mode
  renderMode?: "image" | "procedural_topdown";
  alpha?: number;
  scale?: number;
  scrollFactor?: number;
  proceduralTopdown?: {
    tileSizePx?: number;
    ribStepPx?: number;
    ribWidthPx?: number;
    sideBandPx?: number;
    sideCleatStepPx?: number;
    sideCleatLengthPx?: number;
    shadeAlpha?: number;
    baseColor?: string | number;
    shadeColor?: string | number;
    ribColor?: string | number;
    grooveColor?: string | number;
    sideCleatColor?: string | number;
    sideLineDarkColor?: string | number;
    sideLineLightColor?: string | number;
    scuffCount?: number;
    patchCount?: number;
    scuffColor?: string | number;
    patchColor?: string | number;
  };
  brickContactBand?: {
    enable?: boolean;
    topInsetPx?: number;
    topInsetRatio?: number;
    bottomInsetPx?: number;
    bottomInsetRatio?: number;
    offsetYPx?: number;
  };
}
```

### `display.brickTextureOverlay`

```ts
{
  enable?: boolean;
  style?: string; // default style id (e.g., "crate", "present", or custom)
  styles?: Record<string, object>; // per-style overrides
  pattern?: "wood_planks" | "gift_wrap" | "pizza";
  baseFillColor?: string | number;
  baseFillAlpha?: number; // 0..1, can fully mask base brick color when 1
  alpha?: number;
  plankCount?: number;
  seamWidthPx?: number;
  grainCount?: number;
  nailRadiusPx?: number;
  insetPx?: number;
  topSheenAlpha?: number;
  seamColor?: string | number;
  highlightColor?: string | number;
  ribbonColor?: string | number;      // gift_wrap
  ribbonAlpha?: number;               // gift_wrap
  ribbonWidthRatio?: number;          // gift_wrap
  ribbonInsetPx?: number;             // gift_wrap
  paperPatternColor?: string | number; // gift_wrap
  paperPatternAlpha?: number;          // gift_wrap
  paperDotStepPx?: number;             // gift_wrap
  sliceCount?: number;                // pizza
  toppingCount?: number;              // pizza
  crustColor?: string | number;       // pizza
  sauceColor?: string | number;       // pizza
  cheeseColor?: string | number;      // pizza
  toppingColor?: string | number;     // pizza
  sliceLineColor?: string | number;   // pizza
  labelPatch?: boolean;               // wood_planks
  labelPatchColor?: string | number;  // wood_planks
  labelPatchAlpha?: number;           // wood_planks
  labelPatchBorderColor?: string | number; // wood_planks
  labelBarcodeColor?: string | number;     // wood_planks
  bandColor?: string | number;        // wood_planks
  bandAlpha?: number;                 // wood_planks
  lockPlateColor?: string | number;   // wood_planks
  lockPlateAlpha?: number;            // wood_planks
}
```

### `display.preset` (Moray-style visual preset system)

```ts
{
  enable?: boolean;
  mode?: "none" | "fixed" | "random_per_trial";
  id?: string;                 // fixed mode
  fixedId?: string;            // fixed mode
  pool?: string[];             // random_per_trial mode
  presetOverrides?: Record<string, object>; // per-preset deep override
}
```

Built-in preset IDs:

- `warehouse_concrete_checker`
- `industrial_sleek_flat`
- `kraft_wood_packaging`
- `parcel_sorting_holiday`
- `cold_storage_blueprint`
- `nightshift_high_contrast`
- `lab_rivet_sorting_bay`
- `wood_corrugation_packline`
- `damaged_salvage_line`
- `salvage_shredder_bay`

Texture-forward preset convention:

- New presets above include `display.brickTextureOverlay.styles.target`, `.other`, and `.neutral`.
- You can bind these directly via `bricks.textureCategories[*].textureStyle`.

Built-in brick texture style IDs (global, usable without presets):

- `crate`
- `other_crate`
- `other_steel_case`
- `present`
- `target_present`
- `target_teal_present`
- `neutral_tote`
- `pizza`
- `target_pizza`
- `box`
- `crate_damaged`
- `parcel_label`
- `parcel_damaged`
- `chest`

## 4.2 `conveyors`

```ts
{
  nConveyors: number;
  lengthPx: number | number[] | SamplerSpec;
  runtimeLengths?: number[]; // optional renderer override
  speedPxPerSec: number | SamplerSpec;
}
```

## 4.3 `bricks`

```ts
{
  completionMode: "single_click" | "multi_click" | "hold_duration" | "hover_to_clear" | string;
  completionParams?: {
    clicks_required?: number;        // multi_click
    target_hold_ms?: number;         // hold_duration
    progress_per_perfect?: number;   // hold_duration
    progress_curve?: number;         // hold_duration
    overshoot_tolerance_ms?: number; // hold_duration
    width_scaling?: boolean;         // hold_duration
    width_reference_px?: number;     // hold_duration
    width_scaling_exponent?: number; // hold_duration
  };

  maxBricksPerTrial?: number;

  initialBricks?: number | { type: "fixed"; value: number };

  spawn: {
    ratePerSec?: number | SamplerSpec;
    interSpawnDist?: number | SamplerSpec | null;
    minSpacingPx?: number;
    byConveyor?: boolean;      // default true
    maxActivePerConveyor?: number;
  };

  forcedSet?: Array<object>;
  forcedSetPlan?: {
    enable?: boolean;
    count?: number | SamplerSpec;
    n?: number | SamplerSpec;
    defaults?: object;
    fields?: Record<string, ForcedPlanFieldSpec>;
  };

  colorCategories?: BrickCategorySpec[];
  widthCategories?: BrickCategorySpec[];
  borderColorCategories?: BrickCategorySpec[];
  shapeCategories?: BrickCategorySpec[];
  textureCategories?: BrickCategorySpec[];
}
```

### `BrickCategorySpec`

Accepted keys include:

- `id`, `label`
- trait keys:
  - `color` / `colour`
  - `width`
  - `borderColor` / `border_color` / `border_colour`
  - `shape`
  - `textureStyle` / `texture_style` / `texture`
  - `brickLabel` / `brick_label`
  - `value`
  - `workDeadlineMs` / `work_deadline_ms`
  - `targetHoldMs` / `target_hold_ms`
  - `progressPerPerfect` / `progress_per_perfect`
- `assign` object with same trait keys

Trait values can be direct values or `SamplerSpec`.

### `forcedSet[]` entry keys

Supported keys (with aliases):

- position and conveyor:
  - `conveyorIndex` / `conveyor_index`
  - `x`, or `xFraction` / `x_fraction`
- category picks:
  - `colorCategoryId` / `color_category_id`
  - `widthCategoryId` / `width_category_id`
  - `borderColorCategoryId` / `border_color_category_id`
  - `shapeCategoryId` / `shape_category_id`
  - `textureCategoryId` / `texture_category_id`
  - `categoryIds: { color, width, borderColor, shape, texture }`
- direct traits:
  - `color`, `colour`
  - `width`
  - `borderColor` / `border_color` / `border_colour`
  - `shape`
  - `label`
  - `value`
  - `isTarget` / `is_target`
  - `workDeadlineMs` / `work_deadline_ms`
  - `targetHoldMs` / `target_hold_ms`
  - `progressPerPerfect` / `progress_per_perfect`

### `forcedSetPlan.fields.*`

Each field can be:

- direct value
- sampler object
- list spec:

```ts
{
  values: unknown[];
  draw?: "with_replacement" | "without_replacement" | "sequence";
  mode?: same as draw;
  weights?: number[]; // normalized if using weighted list sampling
  without_replacement?: boolean;
  shuffle?: boolean;
}
```

## 4.4 `drt`

```ts
{
  enable?: boolean;
  stim_type?: "visual" | "audio";
  stim_file_audio?: string;            // required for audio presentation
  stim_visual_config?: {
    shape?: string;                    // renderer interprets
    color?: string | number;
    size_px?: number;
    x?: number;
    y?: number;
  };
  key?: string;                        // supports "space"/"spacebar"/" "
  isi_sampler?: SamplerSpec;           // default uniform 3000..7000 ms
  response_deadline_ms?: number;       // default 1500
  audio?: { volume?: number };         // 0..1
}
```

## 4.5 `trial`

```ts
{
  seed?: number | string | "random" | "auto";
  mode?: "fixed_time" | "max_bricks";
  maxTimeSec?: number | null;          // used in fixed_time
  forcedOrder?: {
    enable?: boolean;
    switchMode?: "on_clear" | "interval" | "interval_or_clear";
    switchIntervalMs?: number;         // default 8000
    switchOnDrop?: boolean;            // default true
    sequence?: number[];               // index order into forced-set brick list
    spotlightPadding?: number;         // default 18
    dimAlpha?: number;                 // default 0.45 (clamped 0..0.95)
    coverStory?: {
      enableAmmoCue?: boolean;
    };
  };
}
```

## 4.6 `experiment`

```ts
{
  startTrialsOnSpace?: boolean;  // if true, trial starts on space
  startOverlay?: {
    text?: string;
    padding?: string;
    background?: string;
    border?: string;
    borderRadius?: string;
    color?: string;
    fontSize?: string;
  };
  showBetweenBlockSummary?: boolean; // currently not consumed in runtime
}
```

## 4.7 `debug`

```ts
{
  pointerOverlay?: boolean;
  pointerConsole?: boolean;
  holdConsole?: boolean;
  saveTrialLog?: boolean;
  printTrialLog?: boolean;
  trialLogPrefix?: string;
}
```

## 4.8 `difficultyModel`

Used by trial difficulty estimator:

```ts
{
  holdQualityMean?: number;         // 0..1 (default 0.5)
  hoverAcquireMs?: number;          // default 120
  hoverTrackingEfficiency?: number; // default 0.9
  avgClickIntervalMs?: number;      // default 240
  clickAcquireMs?: number;          // default 110
}
```

## 4.9 `selfReport` and `instructions`

- `selfReport` and `instructions` are allowed and preserved in config snapshots.
- In current Bricks adapter/runtime, these sections are not used to render instruction pages or post-trial questionnaires directly.

## 5. SamplerSpec grammar

Fields that accept sampler specs use this shape:

```ts
type SamplerSpec =
  | { type: "fixed"; value: unknown }
  | { type: "uniform"; min: number; max: number }
  | { type: "normal"; mu: number; sd: number; min?: number; max?: number }
  | { type: "truncnorm"; mu: number; sd: number; min?: number; max?: number }
  | { type: "exponential"; lambda: number; min?: number; max?: number }
  | { type: "poisson"; lambda: number; min?: number; max?: number }
  | { type: "negative_binomial" | "negbin"; mu: number; k?: number; size?: number; dispersion?: number; r?: number; min?: number; max?: number }
  | {
      type: "list";
      values: unknown[];
      weights?: number[]; // must sum to 1
      draw?: "with_replacement" | "without_replacement" | "sequence";
      mode?: string;
      without_replacement?: boolean;
      withoutReplacement?: boolean;
      shuffle?: boolean;
    };
```

## 6. Example (compact, valid shape)

```json
{
  "display": {
    "canvasWidth": 1200,
    "canvasHeight": 760,
    "preset": {
      "mode": "fixed",
      "id": "parcel_sorting_holiday"
    },
    "ui": { "showHUD": true, "showTimer": true, "showDRT": true }
  },
  "conveyors": {
    "nConveyors": 4,
    "lengthPx": { "type": "uniform", "min": 860, "max": 1160 },
    "speedPxPerSec": { "type": "fixed", "value": 42 }
  },
  "bricks": {
    "completionMode": "hold_duration",
    "completionParams": {
      "target_hold_ms": 500,
      "progress_per_perfect": 0.175
    },
    "colorCategories": [
      { "id": "NeutralA", "color": "#6b7280" },
      { "id": "NeutralB", "color": "#6b7280" }
    ],
    "textureCategories": [
      { "id": "Target", "textureStyle": "target", "value": 15, "label": "High Value" },
      { "id": "Other", "textureStyle": "other", "value": 5, "label": "Distractor" }
    ],
    "forcedSetPlan": {
      "enable": true,
      "count": 4,
      "fields": {
        "textureCategoryId": { "values": ["Target", "Other", "Other", "Other"] }
      }
    },
    "maxBricksPerTrial": 4,
    "spawn": {
      "ratePerSec": { "type": "fixed", "value": 0 },
      "byConveyor": true,
      "maxActivePerConveyor": 1
    }
  },
  "drt": {
    "enable": true,
    "stim_type": "visual",
    "key": "space",
    "isi_sampler": { "type": "uniform", "min": 3000, "max": 5000 },
    "response_deadline_ms": 2500
  },
  "trial": {
    "mode": "fixed_time",
    "maxTimeSec": 40,
    "forcedOrder": { "enable": true, "switchMode": "on_clear", "sequence": [1, 0, 2, 3] }
  },
  "blocks": [{ "label": "Block 1", "trials": 4, "manipulation": "m1" }],
  "manipulations": [{ "id": "m1", "overrides": {} }]
}
```
