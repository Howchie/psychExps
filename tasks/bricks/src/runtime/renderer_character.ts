import * as PIXI from 'pixi.js';

export type CharacterState = 'idle' | 'celebrate' | 'sad';

export interface CharacterFrameConfig {
  /** Folder path (string) or explicit list of file paths (string[]). */
  idle?: string | string[];
  celebrate?: string | string[];
  sad?: string | string[];
}

export interface CharacterTimingConfig {
  /** Ms between idle frame changes. Default 120. */
  idleFrameIntervalMs?: number;
  /** How long celebrate pose holds before returning to idle. Default 2000. */
  celebrateDurationMs?: number;
  /** How long sad pose holds before returning to idle. Default 1800. */
  sadDurationMs?: number;
  /** Duration of cross-fade between frames. Default 80. */
  crossFadeMs?: number;
}

export interface CharacterSpriteConfig {
  /** Height (px) the sprite is scaled to fit within. Default 80. */
  sizePx?: number;
  /** Y offset from top of canvas. Default 4. */
  offsetYPx?: number;
  frames?: CharacterFrameConfig;
  timing?: CharacterTimingConfig;
}

async function resolvePaths(entry: string | string[]): Promise<string[]> {
  if (Array.isArray(entry)) return entry;
  const folder = entry.replace(/\/$/, '');
  try {
    const res = await fetch(`${folder}/manifest.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files: string[] = await res.json();
    return files.map(f => `${folder}/${f}`);
  } catch (err) {
    console.warn(`[character] failed to load manifest for folder "${folder}":`, err);
    return [];
  }
}

const DEFAULTS = {
  sizePx: 80,
  offsetYPx: 4,
  timing: {
    idleFrameIntervalMs: 2500,
    celebrateDurationMs: 2000,
    sadDurationMs: 1800,
    crossFadeMs: 100,
  },
} as const;

export class CharacterSprite {
  private container: PIXI.Container;
  private spriteA: PIXI.Sprite;
  private spriteB: PIXI.Sprite;
  private textures = new Map<CharacterState, PIXI.Texture[]>();
  private state: CharacterState = 'idle';
  private frameTimer = 0;
  private stateTimer = 0;
  private crossFadeTimer = 0;
  private lastIndices = new Map<CharacterState, number>();
  private loaded = false;
  private readonly sizePx: number;
  private readonly timing: Required<CharacterTimingConfig>;
  private globalScale = 1.0;

  constructor(private readonly config: CharacterSpriteConfig) {
    this.sizePx = Math.max(20, Number(config.sizePx ?? DEFAULTS.sizePx));
    this.timing = { ...DEFAULTS.timing, ...(config.timing ?? {}) };
    
    this.container = new PIXI.Container();
    
    // We use two sprites for cross-fading
    this.spriteA = new PIXI.Sprite(PIXI.Texture.EMPTY);
    this.spriteB = new PIXI.Sprite(PIXI.Texture.EMPTY);
    
    [this.spriteA, this.spriteB].forEach(s => {
      s.anchor.set(0.5, 0); // Top-middle anchor for "hanging" from offsetYPx
      this.container.addChild(s);
    });

    this.container.visible = false;
  }

  get displayObject(): PIXI.Container {
    return this.container;
  }

  async load(): Promise<void> {
    const frameConfig = this.config.frames ?? {};
    const states: CharacterState[] = ['idle', 'celebrate', 'sad'];
    
    let maxDim = 1;

    for (const state of states) {
      const raw = (frameConfig as Record<string, string | string[] | undefined>)[state];
      if (!raw) continue;
      const paths = await resolvePaths(raw);
      if (paths.length === 0) continue;
      const loaded: PIXI.Texture[] = [];
      for (const path of paths) {
        try {
          const tex = await PIXI.Texture.fromURL(path);
          loaded.push(tex);
          maxDim = Math.max(maxDim, tex.width, tex.height);
        } catch {
          console.warn(`[character] failed to load frame: ${path}`);
        }
      }
      if (loaded.length > 0) this.textures.set(state, loaded);
    }

    if (!this.textures.has('idle')) return;

    // Use a consistent scale across all frames.
    // Since all PNGs are now pre-processed to the same size, this is trivial.
    this.globalScale = this.sizePx / maxDim;
    [this.spriteA, this.spriteB].forEach(s => s.scale.set(this.globalScale));
    
    this.loaded = true;
    this.container.visible = true;
    this._enterState('idle');
  }

  onClear(): void {
    if (!this.loaded || this.state !== 'idle') return;
    if (this.textures.has('celebrate')) this._enterState('celebrate');
  }

  onDrop(): void {
    if (!this.loaded || this.state !== 'idle') return;
    if (this.textures.has('sad')) this._enterState('sad');
  }

  update(dt: number): void {
    if (!this.loaded) return;
    this.stateTimer += dt;
    this.frameTimer += dt;
    this.crossFadeTimer += dt;

    // Update cross-fade alpha
    if (this.crossFadeTimer < this.timing.crossFadeMs) {
      const t = this.crossFadeTimer / this.timing.crossFadeMs;
      this.spriteB.alpha = t;
      this.spriteA.alpha = 1 - t;
    } else {
      this.spriteB.alpha = 1;
      this.spriteA.alpha = 0;
    }

    switch (this.state) {
      case 'celebrate':
      case 'sad': {
        const holdMs = this.state === 'celebrate'
          ? this.timing.celebrateDurationMs
          : this.timing.sadDurationMs;
        
        // NO frame picking here - just hold the one we picked in _enterState
        if (this.stateTimer >= holdMs) this._enterState('idle');
        break;
      }

      case 'idle': {
        if (this.frameTimer >= this.timing.idleFrameIntervalMs) {
          this.frameTimer = 0;
          this._pickRandomFrame(true);
        }
        break;
      }
    }
  }

  private _enterState(next: CharacterState): void {
    const isNewState = next !== this.state;
    this.state = next;
    this.frameTimer = 0;
    this.stateTimer = 0;
    
    // Cross-fade if we are actually switching states
    this._pickRandomFrame(isNewState);
  }

  private _pickRandomFrame(crossFade: boolean): void {
    const frames = this.textures.get(this.state);
    if (!frames || frames.length === 0) return;
    
    const lastIdx = this.lastIndices.get(this.state) ?? -1;
    let nextIdx = 0;

    if (frames.length > 1) {
      nextIdx = lastIdx;
      // Ensure we pick a DIFFERENT frame for this specific state
      while (nextIdx === lastIdx) {
        nextIdx = Math.floor(Math.random() * frames.length);
      }
    }
    
    this.lastIndices.set(this.state, nextIdx);
    this._applyFrame(this.state, nextIdx, crossFade);
  }

  private _applyFrame(state: CharacterState, idx: number, crossFade: boolean): void {
    const frames = this.textures.get(state);
    if (!frames || frames.length === 0) return;
    const tex = frames[idx % frames.length];
    if (!tex || tex === PIXI.Texture.EMPTY) return;

    if (crossFade) {
      // Swap textures: A becomes current (visible), B becomes next (fading in)
      this.spriteA.texture = this.spriteB.texture;
      this.spriteB.texture = tex;
      this.crossFadeTimer = 0;
    } else {
      this.spriteA.texture = PIXI.Texture.EMPTY;
      this.spriteB.texture = tex;
      this.spriteB.alpha = 1;
      this.spriteA.alpha = 0;
      this.crossFadeTimer = this.timing.crossFadeMs;
    }
  }
}
