// @ts-nocheck
const deepClone = (value) => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_) {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const deepMerge = (base, override) => {
  if (!isObject(base) || !isObject(override)) {
    return override;
  }
  const out = { ...base };
  Object.keys(override).forEach((key) => {
    const left = out[key];
    const right = override[key];
    if (isObject(left) && isObject(right)) {
      out[key] = deepMerge(left, right);
    } else {
      out[key] = deepClone(right);
    }
  });
  return out;
};

const toPresetId = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const hashUint32 = (seed, trialIndex) => {
  let x = (Number(seed) >>> 0) ^ (((Number(trialIndex) + 1) * 0x9e3779b9) >>> 0);
  x ^= (x << 13) >>> 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  return x >>> 0;
};

const COMPLETE_WAREHOUSE_PROCEDURAL_DEFAULTS = {
  tileSizePx: 240,
  paverWidthPx: 80,
  paverHeightPx: 80,
  groutPx: 2,
  layout: 'grid',
  rowOffsetPx: 0,
  pattern: 'none',
  alternationStrength: 0,
  variation: 0,
  edgeShadingAlpha: 0,
  noiseCount: 0,
  seamDashCount: 0,
  rivetCount: 0,
  dentCount: 0,
  crackCount: 0,
  baseColor: '#8f959c',
  groutColor: '#8f959c',
  seamDarkColor: '#8f959c',
  seamLightColor: '#8f959c',
  scratchColor: '#8f959c',
  rivetColor: '#dbe8f2',
};

const COMPLETE_BELT_PROCEDURAL_DEFAULTS = {
  tileSizePx: 120,
  ribStepPx: 12,
  ribWidthPx: 8,
  sideBandPx: 18,
  sideCleatStepPx: 16,
  sideCleatLengthPx: 12,
  shadeAlpha: 0.55,
  baseColor: '#2a323b',
  shadeColor: '#202730',
  ribColor: '#4d5863',
  grooveColor: '#2b333c',
  sideCleatColor: '#6b7280',
  sideLineDarkColor: '#111827',
  sideLineLightColor: '#9ca3af',
  scuffCount: 0,
  patchCount: 0,
  scuffColor: '#cbd5e1',
  patchColor: '#111827',
};

const materializeCompletePreset = (preset) => {
  const out = deepClone(preset || {});
  const bg = out?.backgroundTexture;
  if (isObject(bg) && String(bg.renderMode ?? '').toLowerCase() === 'procedural_warehouse') {
    out.backgroundTexture = {
      ...bg,
      proceduralWarehouse: deepMerge(
        COMPLETE_WAREHOUSE_PROCEDURAL_DEFAULTS,
        isObject(bg.proceduralWarehouse) ? bg.proceduralWarehouse : {}
      ),
    };
  }
  const belt = out?.beltTexture;
  if (isObject(belt) && String(belt.renderMode ?? '').toLowerCase() === 'procedural_topdown') {
    out.beltTexture = {
      ...belt,
      proceduralTopdown: deepMerge(
        COMPLETE_BELT_PROCEDURAL_DEFAULTS,
        isObject(belt.proceduralTopdown) ? belt.proceduralTopdown : {}
      ),
    };
  }
  return out;
};

export const BUILTIN_DISPLAY_PRESETS = {
  warehouse_concrete_checker: {
    backgroundColor: '#7f858a',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.84,
      scale: 1.15,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 240,
        paverWidthPx: 82,
        paverHeightPx: 82,
        groutPx: 3,
        layout: 'grid',
        rowOffsetPx: 0,
        pattern: 'checker_alternating',
        alternationStrength: 0.07,
        variation: 0.12,
        edgeShadingAlpha: 0,
        noiseCount: 20,
        seamDashCount: 8,
        baseColor: '#8f959c',
        groutColor: '#6e757e',
        seamDarkColor: '#4b545f',
        seamLightColor: '#b4bac1',
        scratchColor: '#5a616b',
      },
    },
    beltColor: '#e5e7eb',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 1,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 120,
        ribStepPx: 12,
        ribWidthPx: 8,
        sideBandPx: 18,
        sideCleatStepPx: 16,
        sideCleatLengthPx: 12,
        shadeAlpha: 0.55,
      },
    },
    brickTextureOverlay: {
      enable: true,
      alpha: 0.14,
      plankCount: 3,
      seamWidthPx: 1,
      grainCount: 4,
      nailRadiusPx: 1,
      insetPx: 2,
    },
  },
  industrial_sleek_flat: {
    backgroundColor: '#161a20',
    backgroundTexture: {
      enable: false,
    },
    beltColor: '#2a313a',
    beltTexture: {
      enable: false,
    },
    dueDateMarker: {
      color: '#f1f5f9',
      widthPx: 4,
      alpha: 0.95,
    },
    brickTextureOverlay: {
      enable: true,
      alpha: 0.08,
      plankCount: 2,
      seamWidthPx: 1,
      grainCount: 1,
      nailRadiusPx: 0.7,
      insetPx: 3,
      topSheenAlpha: 0.28,
      seamColor: '#0f172a',
      highlightColor: '#f8fafc',
    },
    endFurnace: {
      wallColor: '#3b4450',
      wallShadeColor: '#26303b',
      rimColor: '#a5b4c7',
      mouthColor: '#0b1120',
      emberColor: '#f97316',
    },
  },
  kraft_wood_packaging: {
    backgroundColor: '#786a56',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.5,
      scale: 1.25,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 250,
        paverWidthPx: 96,
        paverHeightPx: 96,
        groutPx: 2,
        layout: 'grid',
        pattern: 'none',
        variation: 0.09,
        edgeShadingAlpha: 0.12,
        noiseCount: 16,
        seamDashCount: 10,
        baseColor: '#9a8666',
        groutColor: '#6f5f47',
        seamDarkColor: '#5d4f3b',
        seamLightColor: '#b9a889',
        scratchColor: '#5e503d',
      },
    },
    beltColor: '#4b3a27',
    beltTexture: {
      enable: false,
    },
    brickTextureOverlay: {
      enable: true,
      alpha: 0.23,
      plankCount: 3,
      seamWidthPx: 1,
      grainCount: 6,
      nailRadiusPx: 1.2,
      insetPx: 2,
      topSheenAlpha: 0.25,
      seamColor: '#3b2f22',
      highlightColor: '#f5e9d8',
    },
    endFurnace: {
      wallColor: '#5b4632',
      wallShadeColor: '#3f3124',
      rimColor: '#cfb89a',
      mouthColor: '#1e1209',
      emberColor: '#fb923c',
    },
  },
  parcel_sorting_holiday: {
    backgroundColor: '#847462',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.62,
      scale: 1.2,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 240,
        paverWidthPx: 92,
        paverHeightPx: 92,
        groutPx: 2,
        layout: 'grid',
        rowOffsetPx: 0,
        pattern: 'none',
        alternationStrength: 0.04,
        variation: 0.1,
        edgeShadingAlpha: 0.1,
        noiseCount: 16,
        seamDashCount: 10,
        baseColor: '#9e8d75',
        groutColor: '#7a6a56',
        seamDarkColor: '#5f5140',
        seamLightColor: '#c7b69c',
        scratchColor: '#5a4c3d',
      },
    },
    beltColor: '#2f3b46',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 1,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 120,
        ribStepPx: 12,
        ribWidthPx: 8,
        sideBandPx: 17,
        sideCleatStepPx: 16,
        sideCleatLengthPx: 11,
        shadeAlpha: 0.58,
        baseColor: '#31414d',
        shadeColor: '#22303b',
        ribColor: '#4f6270',
        grooveColor: '#2b3944',
        sideCleatColor: '#71808c',
        sideLineDarkColor: '#111827',
        sideLineLightColor: '#c7d2dd',
      },
    },
    brickTextureOverlay: {
      enable: true,
      style: 'neutral',
      alpha: 0.2,
      baseFillAlpha: 0.8,
      plankCount: 3,
      seamWidthPx: 1,
      grainCount: 3,
      nailRadiusPx: 1,
      insetPx: 2,
      topSheenAlpha: 0.2,
      styles: {
        target: {
          pattern: 'gift_wrap',
          baseFillColor: '#ff2d2d',
          baseFillAlpha: 1,
          alpha: 1,
          ribbonColor: '#ffe14d',
          ribbonAlpha: 1,
          ribbonWidthRatio: 0.2,
          ribbonInsetPx: 2,
          topSheenAlpha: 0.08,
        },
        other: {
          pattern: 'wood_planks',
          baseFillColor: '#795f43',
          baseFillAlpha: 1,
          alpha: 0.94,
          plankCount: 3,
          grainCount: 5,
          seamColor: '#31261b',
          highlightColor: '#ecdfca',
          nailRadiusPx: 1.1,
        },
        neutral: {
          pattern: 'wood_planks',
          baseFillColor: '#6f6457',
          baseFillAlpha: 0.86,
          alpha: 0.55,
          plankCount: 2,
          grainCount: 2,
          seamColor: '#3f3932',
          highlightColor: '#ede8de',
        },
      },
    },
    endFurnace: {
      wallColor: '#4d5761',
      wallShadeColor: '#2e3843',
      rimColor: '#b8c3cf',
      mouthColor: '#0b1120',
      emberColor: '#f97316',
    },
  },
  cold_storage_blueprint: {
    backgroundColor: '#6a7f94',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.7,
      scale: 1.1,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 228,
        paverWidthPx: 76,
        paverHeightPx: 76,
        groutPx: 2,
        layout: 'grid',
        rowOffsetPx: 0,
        pattern: 'checker_alternating',
        alternationStrength: 0.06,
        variation: 0.08,
        edgeShadingAlpha: 0,
        noiseCount: 18,
        seamDashCount: 8,
        baseColor: '#96acbf',
        groutColor: '#72889b',
        seamDarkColor: '#526678',
        seamLightColor: '#c9d7e3',
        scratchColor: '#5f7387',
      },
    },
    beltColor: '#dbeafe',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 1,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 126,
        ribStepPx: 13,
        ribWidthPx: 8,
        sideBandPx: 18,
        sideCleatStepPx: 16,
        sideCleatLengthPx: 11,
        shadeAlpha: 0.5,
        baseColor: '#3a5166',
        shadeColor: '#23384a',
        ribColor: '#69859e',
        grooveColor: '#2b3f51',
        sideCleatColor: '#8aa4bc',
        sideLineDarkColor: '#0f172a',
        sideLineLightColor: '#dbeafe',
      },
    },
    brickTextureOverlay: {
      enable: true,
      style: 'neutral',
      alpha: 0.24,
      baseFillAlpha: 0.92,
      plankCount: 3,
      seamWidthPx: 1,
      grainCount: 2,
      nailRadiusPx: 0.8,
      insetPx: 2,
      topSheenAlpha: 0.24,
      styles: {
        target: {
          pattern: 'gift_wrap',
          baseFillColor: '#1e40ff',
          baseFillAlpha: 1,
          alpha: 1,
          ribbonColor: '#ffe14d',
          ribbonAlpha: 0.96,
          ribbonWidthRatio: 0.19,
          ribbonInsetPx: 2,
        },
        other: {
          pattern: 'wood_planks',
          baseFillColor: '#617487',
          baseFillAlpha: 1,
          alpha: 0.92,
          plankCount: 4,
          grainCount: 1,
          seamColor: '#1f2937',
          highlightColor: '#dbe7f5',
          nailRadiusPx: 0.7,
        },
        neutral: {
          pattern: 'wood_planks',
          baseFillColor: '#7b8ea1',
          baseFillAlpha: 0.88,
          alpha: 0.52,
          plankCount: 2,
          grainCount: 2,
          seamColor: '#3c4f60',
          highlightColor: '#eef4fb',
        },
      },
    },
    endFurnace: {
      wallColor: '#41556a',
      wallShadeColor: '#293a4c',
      rimColor: '#c6d5e5',
      mouthColor: '#0b1220',
      emberColor: '#fb7185',
    },
  },
  nightshift_high_contrast: {
    backgroundColor: '#2a3038',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.58,
      scale: 1.12,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 230,
        paverWidthPx: 84,
        paverHeightPx: 84,
        groutPx: 2,
        layout: 'grid',
        rowOffsetPx: 0,
        pattern: 'checker_alternating',
        alternationStrength: 0.08,
        variation: 0.09,
        edgeShadingAlpha: 0,
        noiseCount: 14,
        seamDashCount: 8,
        baseColor: '#5f6873',
        groutColor: '#424a54',
        seamDarkColor: '#2f3640',
        seamLightColor: '#88919b',
        scratchColor: '#3f4650',
      },
    },
    beltColor: '#f8fafc',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 1,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 116,
        ribStepPx: 11,
        ribWidthPx: 7,
        sideBandPx: 17,
        sideCleatStepPx: 15,
        sideCleatLengthPx: 10,
        shadeAlpha: 0.62,
        baseColor: '#303842',
        shadeColor: '#1b222b',
        ribColor: '#4f5a66',
        grooveColor: '#262e38',
        sideCleatColor: '#6b7683',
        sideLineDarkColor: '#020617',
        sideLineLightColor: '#cbd5e1',
      },
    },
    brickTextureOverlay: {
      enable: true,
      style: 'neutral',
      alpha: 0.22,
      baseFillAlpha: 0.92,
      plankCount: 3,
      seamWidthPx: 1,
      grainCount: 2,
      nailRadiusPx: 0.8,
      insetPx: 2,
      topSheenAlpha: 0.22,
      styles: {
        target: {
          pattern: 'gift_wrap',
          baseFillColor: '#00a34a',
          baseFillAlpha: 1,
          alpha: 1,
          ribbonColor: '#ff3b30',
          ribbonAlpha: 0.98,
          ribbonWidthRatio: 0.2,
          ribbonInsetPx: 2,
        },
        other: {
          pattern: 'wood_planks',
          baseFillColor: '#4b5563',
          baseFillAlpha: 1,
          alpha: 0.9,
          plankCount: 4,
          grainCount: 1,
          seamColor: '#111827',
          highlightColor: '#d1d5db',
          nailRadiusPx: 0.7,
        },
        neutral: {
          pattern: 'wood_planks',
          baseFillColor: '#6b7280',
          baseFillAlpha: 0.9,
          alpha: 0.48,
          plankCount: 2,
          grainCount: 2,
          seamColor: '#374151',
          highlightColor: '#f3f4f6',
        },
      },
    },
    endFurnace: {
      wallColor: '#3a434f',
      wallShadeColor: '#262f3b',
      rimColor: '#b4c1cf',
      mouthColor: '#0b1120',
      emberColor: '#fb923c',
    },
  },
  lab_rivet_sorting_bay: {
    backgroundColor: '#4f5f6c',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.76,
      scale: 1.08,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 220,
        paverWidthPx: 72,
        paverHeightPx: 72,
        groutPx: 2,
        layout: 'grid',
        pattern: 'checker_alternating',
        alternationStrength: 0.05,
        variation: 0.07,
        edgeShadingAlpha: 0.06,
        noiseCount: 14,
        seamDashCount: 8,
        rivetCount: 36,
        dentCount: 6,
        baseColor: '#8ea0ad',
        groutColor: '#617380',
        seamDarkColor: '#465560',
        seamLightColor: '#c6d3de',
        scratchColor: '#51606b',
        rivetColor: '#dbe8f2',
      },
    },
    beltColor: '#dbeafe',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 1,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 122,
        ribStepPx: 12,
        ribWidthPx: 8,
        sideBandPx: 18,
        sideCleatStepPx: 16,
        sideCleatLengthPx: 12,
        shadeAlpha: 0.56,
        baseColor: '#3a4c5c',
        shadeColor: '#223544',
        ribColor: '#617b90',
        grooveColor: '#2a3b49',
        sideCleatColor: '#8ca1b4',
        sideLineDarkColor: '#0f172a',
        sideLineLightColor: '#dbeafe',
        scuffCount: 8,
      },
    },
    brickTextureOverlay: {
      enable: true,
      style: 'neutral',
      alpha: 0.24,
      baseFillAlpha: 0.95,
      plankCount: 3,
      seamWidthPx: 1,
      grainCount: 3,
      nailRadiusPx: 1,
      insetPx: 2,
      styles: {
        target: {
          pattern: 'gift_wrap',
          baseFillColor: '#1e40ff',
          baseFillAlpha: 1,
          alpha: 1,
          ribbonColor: '#ffe14d',
          ribbonAlpha: 1,
          ribbonWidthRatio: 0.2,
        },
        other: {
          pattern: 'wood_planks',
          baseFillColor: '#7a6b56',
          baseFillAlpha: 1,
          alpha: 0.95,
          plankCount: 2,
          grainCount: 3,
          seamColor: '#403628',
          highlightColor: '#f0e8dc',
          labelPatch: true,
          labelPatchColor: '#f8fafc',
          labelPatchAlpha: 0.85,
          labelPatchBorderColor: '#334155',
          labelBarcodeColor: '#111827',
        },
        neutral: {
          pattern: 'wood_planks',
          baseFillColor: '#5f6b78',
          baseFillAlpha: 0.88,
          alpha: 0.52,
          plankCount: 2,
          grainCount: 2,
          seamColor: '#374151',
          highlightColor: '#e2e8f0',
        },
      },
    },
    endFurnace: {
      style: 'plasma_recycler',
    },
  },
  wood_corrugation_packline: {
    backgroundColor: '#7e6a54',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.68,
      scale: 1.2,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 246,
        paverWidthPx: 92,
        paverHeightPx: 76,
        groutPx: 2,
        layout: 'staggered',
        rowOffsetPx: 46,
        pattern: 'none',
        variation: 0.12,
        edgeShadingAlpha: 0.15,
        noiseCount: 20,
        seamDashCount: 12,
        baseColor: '#9a8266',
        groutColor: '#715c47',
        seamDarkColor: '#5a4736',
        seamLightColor: '#c3ae92',
        scratchColor: '#5b4939',
      },
    },
    beltColor: '#4b3a27',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 0.97,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 116,
        ribStepPx: 10,
        ribWidthPx: 7,
        sideBandPx: 16,
        sideCleatStepPx: 14,
        sideCleatLengthPx: 10,
        shadeAlpha: 0.58,
        baseColor: '#4a3929',
        shadeColor: '#2e2419',
        ribColor: '#70583f',
        grooveColor: '#3b2d21',
        sideCleatColor: '#8a7359',
        sideLineDarkColor: '#1a130d',
        sideLineLightColor: '#d1bfa7',
      },
    },
    brickTextureOverlay: {
      enable: true,
      style: 'other',
      alpha: 0.24,
      baseFillAlpha: 1,
      styles: {
        target: {
          pattern: 'gift_wrap',
          baseFillColor: '#ff2d2d',
          baseFillAlpha: 1,
          alpha: 1,
          ribbonColor: '#ffe14d',
          ribbonAlpha: 1,
          ribbonWidthRatio: 0.22,
        },
        other: {
          pattern: 'wood_planks',
          baseFillColor: '#7b5d42',
          baseFillAlpha: 1,
          alpha: 0.96,
          plankCount: 3,
          grainCount: 5,
          seamColor: '#32261b',
          highlightColor: '#e9dbc8',
          bandColor: '#f1f5f9',
          bandAlpha: 0.18,
        },
        neutral: {
          pattern: 'wood_planks',
          baseFillColor: '#6f6357',
          baseFillAlpha: 0.9,
          alpha: 0.5,
          plankCount: 2,
          grainCount: 2,
          seamColor: '#3f3932',
          highlightColor: '#eee7de',
        },
      },
    },
    endFurnace: {
      style: 'furnace',
    },
  },
  damaged_salvage_line: {
    backgroundColor: '#5a6068',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.74,
      scale: 1.14,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 232,
        paverWidthPx: 84,
        paverHeightPx: 84,
        groutPx: 2,
        layout: 'grid',
        pattern: 'checker_alternating',
        alternationStrength: 0.08,
        variation: 0.11,
        edgeShadingAlpha: 0.08,
        noiseCount: 22,
        seamDashCount: 14,
        rivetCount: 18,
        dentCount: 12,
        crackCount: 14,
        baseColor: '#7a838e',
        groutColor: '#545c66',
        seamDarkColor: '#3d434c',
        seamLightColor: '#9ea7b2',
        scratchColor: '#474e57',
        rivetColor: '#cbd5e1',
      },
    },
    beltColor: '#3d4650',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 1,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 118,
        ribStepPx: 11,
        ribWidthPx: 7,
        sideBandPx: 17,
        sideCleatStepPx: 15,
        sideCleatLengthPx: 10,
        shadeAlpha: 0.62,
        baseColor: '#38414a',
        shadeColor: '#212a33',
        ribColor: '#55606b',
        grooveColor: '#2a323b',
        sideCleatColor: '#68727d',
        sideLineDarkColor: '#0b1120',
        sideLineLightColor: '#b7c2ce',
        scuffCount: 18,
        patchCount: 8,
      },
    },
    brickTextureOverlay: {
      enable: true,
      style: 'other',
      alpha: 0.26,
      baseFillAlpha: 0.98,
      styles: {
        target: {
          pattern: 'gift_wrap',
          baseFillColor: '#ff2d2d',
          baseFillAlpha: 1,
          alpha: 1,
          ribbonColor: '#ffe14d',
          ribbonAlpha: 0.95,
          ribbonWidthRatio: 0.18,
        },
        other: {
          pattern: 'wood_planks',
          baseFillColor: '#6d5239',
          baseFillAlpha: 1,
          alpha: 0.98,
          plankCount: 3,
          seamWidthPx: 2,
          grainCount: 7,
          nailRadiusPx: 1.2,
          seamColor: '#2a2118',
          highlightColor: '#dbcab2',
          labelPatch: true,
          labelPatchColor: '#e2e8f0',
          labelPatchAlpha: 0.65,
          labelPatchBorderColor: '#1f2937',
          labelBarcodeColor: '#020617',
        },
        neutral: {
          pattern: 'wood_planks',
          baseFillColor: '#5f6771',
          baseFillAlpha: 0.9,
          alpha: 0.5,
          plankCount: 2,
          grainCount: 3,
          seamColor: '#30363f',
          highlightColor: '#dbe2ea',
        },
      },
    },
    endFurnace: {
      style: 'crusher',
      hazardColorA: '#f59e0b',
      hazardColorB: '#111827',
    },
  },
  salvage_shredder_bay: {
    backgroundColor: '#4a525b',
    backgroundTexture: {
      enable: true,
      renderMode: 'procedural_warehouse',
      alpha: 0.72,
      scale: 1.08,
      scrollFactor: 0,
      proceduralWarehouse: {
        tileSizePx: 224,
        paverWidthPx: 74,
        paverHeightPx: 74,
        groutPx: 2,
        layout: 'grid',
        pattern: 'checker_alternating',
        alternationStrength: 0.06,
        variation: 0.08,
        edgeShadingAlpha: 0.06,
        noiseCount: 16,
        seamDashCount: 10,
        rivetCount: 28,
        dentCount: 8,
        baseColor: '#7f8b97',
        groutColor: '#596572',
        seamDarkColor: '#414b55',
        seamLightColor: '#bac7d4',
        scratchColor: '#49545f',
        rivetColor: '#d8e3ee',
      },
    },
    beltColor: '#d1d5db',
    beltTexture: {
      enable: true,
      renderMode: 'procedural_topdown',
      alpha: 1,
      scale: 1,
      scrollFactor: 1,
      proceduralTopdown: {
        tileSizePx: 114,
        ribStepPx: 11,
        ribWidthPx: 7,
        sideBandPx: 17,
        sideCleatStepPx: 15,
        sideCleatLengthPx: 10,
        shadeAlpha: 0.6,
        baseColor: '#343d46',
        shadeColor: '#1f2730',
        ribColor: '#515d69',
        grooveColor: '#2a333c',
        sideCleatColor: '#738190',
        sideLineDarkColor: '#060b14',
        sideLineLightColor: '#d6e0ea',
        scuffCount: 10,
      },
    },
    brickTextureOverlay: {
      enable: true,
      style: 'other',
      alpha: 0.22,
      baseFillAlpha: 0.96,
      styles: {
        target: {
          pattern: 'gift_wrap',
          baseFillColor: '#1e40ff',
          baseFillAlpha: 1,
          alpha: 1,
          ribbonColor: '#ffe14d',
          ribbonAlpha: 0.95,
          ribbonWidthRatio: 0.2,
        },
        other: {
          pattern: 'wood_planks',
          baseFillColor: '#5f6f82',
          baseFillAlpha: 1,
          alpha: 0.92,
          plankCount: 4,
          grainCount: 1,
          seamColor: '#1f2937',
          highlightColor: '#dbe7f5',
        },
        neutral: {
          pattern: 'wood_planks',
          baseFillColor: '#687687',
          baseFillAlpha: 0.9,
          alpha: 0.52,
          plankCount: 2,
          grainCount: 2,
          seamColor: '#3c4f60',
          highlightColor: '#eef4fb',
        },
      },
    },
    endFurnace: {
      style: 'shredder',
    },
  },
};

export const resolveDisplayPresetId = (config, { baseSeed = 0, trialIndex = 0 } = {}) => {
  const display = config?.display || {};
  const presetCfg = display?.preset || {};
  if (typeof presetCfg === 'string') {
    return toPresetId(presetCfg) || null;
  }
  if (!isObject(presetCfg)) {
    return null;
  }

  const mode = String(presetCfg.mode ?? 'fixed').toLowerCase();
  if (mode === 'none' || presetCfg.enable === false) {
    return null;
  }
  if (mode === 'fixed') {
    const fixed = toPresetId(presetCfg.fixedId ?? presetCfg.id);
    return fixed || null;
  }
  if (mode === 'random_per_trial') {
    const poolRaw = Array.isArray(presetCfg.pool) ? presetCfg.pool : [];
    const pool = poolRaw
      .map(toPresetId)
      .filter(Boolean)
      .filter((id) => Boolean(BUILTIN_DISPLAY_PRESETS[id]));
    if (!pool.length) {
      return null;
    }
    const idx = hashUint32(baseSeed, trialIndex) % pool.length;
    return pool[idx];
  }

  const fallback = toPresetId(presetCfg.fixedId ?? presetCfg.id);
  return fallback || null;
};

export const applyDisplayPreset = (config, presetId) => {
  const cloned = deepClone(config);
  const id = toPresetId(presetId);
  if (!id) {
    return cloned;
  }
  const preset = BUILTIN_DISPLAY_PRESETS[id];
  if (!preset) {
    return cloned;
  }
  const mergedDisplay = deepMerge(cloned?.display || {}, materializeCompletePreset(preset));
  const presetCfg = isObject(cloned?.display?.preset) ? cloned.display.preset : {};
  const perPresetOverrides = isObject(presetCfg?.presetOverrides) ? presetCfg.presetOverrides[id] : null;
  const displayWithOverrides = isObject(perPresetOverrides)
    ? deepMerge(mergedDisplay, perPresetOverrides)
    : mergedDisplay;
  return {
    ...cloned,
    display: displayWithOverrides,
  };
};
