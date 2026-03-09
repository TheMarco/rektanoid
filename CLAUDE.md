# Rektanoid

Crypto-themed Arkanoid/Breakout clone built with Three.js (WebGL) and TypeScript.

## Tech Stack

- **Renderer**: Three.js (WebGL) with EffectComposer post-processing
- **Build**: Vite + TypeScript
- **Audio**: Procedural Web Audio API (SFX + ambient drones) + MP3 soundtrack playlist
- **No frameworks** — vanilla TS, no React/Phaser/etc.

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — TypeScript check + Vite production build
- `npm run preview` — Preview production build
- `npx tsc --noEmit` — Type-check only

## Project Structure

```
src/
  main.ts              — Entry point: creates Game, calls start()
  Game.ts              — Game loop, state machine, physics, collisions, input
  Renderer.ts          — Three.js scene, camera, post-processing, mesh factories, HUD canvas, overlay screens
  Background.ts        — 10 level backgrounds (caves + crypto wireframe structures, ~1900 lines)
  CRTPass.ts           — GLSL CRT post-processing ShaderPass
  constants.ts         — GAME_WIDTH=450, GAME_HEIGHT=800 (9:16 portrait)
  data/
    balance.ts         — All gameplay constants (speeds, sizes, durations)
    brickTypes.ts      — 16 brick types (standard, tough, tough3, indestructible, explosive, drop, sentimentUp/Down, hazard, fomo, stable, leverage, rug, whale, influencer, diamond)
    powerups.ts        — 10 powerup types (8 positive, 2 negative)
    riskProfiles.ts    — 3 risk modes (Spot/Margin/Degen) with modifier values
    bosses.ts          — Boss definitions (Whale, Liquidator, Flippening) with phases/attacks
    events.ts          — Market event definitions
    marketStates.ts    — Market state definitions (bear/neutral/bull/euphoria)
    stageMeta.ts       — Stage metadata
    levelOrder.ts      — Level sequence (10 stages)
    levels/            — stage01.ts through stage10.ts (grid layouts)
  types/
    LevelDefinition.ts — Level layout + metadata
    BrickDefinition.ts — Brick type properties
    BrickInstanceState.ts — Runtime brick state (row/col, boss/event flags)
    PowerupDefinition.ts
    SentimentState.ts  — Bull/Neutral/Bear enum
    BossTypes.ts       — Boss, phase, attack type definitions
    BossDefinition.ts  — Boss definition type
    MarketState.ts     — Market state type
    MarketModifiers.ts — Market modifier type
    EventDefinition.ts — Event definition type
    StageMeta.ts       — Stage metadata type
  systems/
    AudioSystem.ts     — Procedural sound synthesis + music playlist
  utils/
    math.ts, random.ts, timing.ts, arrays.ts, storage.ts
public/
  adstudios.png        — Studio logo (displayed on title screen)
  music/               — 6 MP3 soundtrack files (soundtrack1-6.mp3)
index.html             — HTML shell with CSS
```

## Architecture

### Rendering Pipeline

The renderer uses Three.js EffectComposer with this pass order:

1. **RenderPass** — Main scene (game objects, backgrounds) with perspective camera
2. **RenderPass** (clear=false) — HUD scene with orthographic camera (canvas texture overlay)
3. **UnrealBloomPass** — Bloom glow on everything
4. **CRT ShaderPass** — Scanlines, aperture grille, beam simulation, vignette, flicker
5. **OutputPass** — Final tone-mapped output

### Camera Setup

- Perspective camera: fov=60, aspect=450/800
- Camera at z = 400/tan(30deg) ≈ 692.8, looking at origin
- Game objects at z=0, backgrounds at z=-5
- This setup makes the visible area at z=0 exactly 450x800 units

### Coordinate System

- Game coords: (0,0) top-left, y-down (standard 2D game coords)
- Three.js world: (0,0) center, y-up
- `Renderer.toWorld(gx, gy)` converts: `(gx - 225, 400 - gy, 0)`
- `Renderer.setPos(obj, gx, gy)` positions objects in game coords

### HUD System

Text is rendered to a 1152x2048 offscreen canvas, then displayed as a Three.js CanvasTexture
on a full-screen quad in a separate orthographic scene. This scene renders after the main scene
(clear=false) so the HUD composites on top, then both go through bloom + CRT.

- Ticker tape (top) — scrolling crypto prices from CoinGecko API (falls back to fake data)
- Bottom HUD bar — score (as bag value), PnL%, lives, combo, sentiment, active effects, stage name
- Callouts — floating text that rises and fades (combo messages, etc.)

### Overlay Screens (Canvas-based, through CRT)

All overlay screens (menu, stage-intro, paused, game-over, victory) are rendered to the HUD canvas
and go through the full post-processing pipeline (bloom + CRT). No HTML overlays.

- `OverlayScreen` discriminated union type for screen states
- `setOverlayScreen()` / `hideOverlay()` to show/hide
- `hitTestOverlay()` for click detection on risk profile buttons (game coordinate space)
- `fitText()` helper auto-shrinks font size so text always fits horizontally
- Title screen features: decorative 2D wireframe bricks (all 16 types), animated paddle + ball, risk profile selector, studio logo
- Colors are very muted (dark) to avoid bloom blowout at 0.03 threshold
- `dimColor()` helper scales hex colors by a multiplier

### Paddle Input

- Mouse/touch control is 1:1 — paddle position directly matches input position (no easing)
- Keyboard: arrow keys / A/D at fixed PADDLE_SPEED

### Game States

`menu` → `playing` → `stage-intro` → `playing` → ... → `game-over` / `victory`
Also: `paused` (toggle with Escape/P)

### Sentiment System

- Value 0-100, starts at 50
- Bull (>=65): 1.5x score bonus
- Bear (<=35): hazards spawn
- Green/Red candle bricks shift sentiment +/-10

### Backgrounds

Each level has a unique background in `Background.ts`:
- Procedural cave walls (line segments with thickening for bloom)
- Crypto-themed wireframe structures (Bitcoin logos, candlesticks, blockchain nodes, etc.)
- Animated elements (rotation, pulsing, floating particles)
- Color-themed per level (green, red, orange, blue, purple)

### CRT Effect (CRTPass.ts)

GLSL shader with:
- 360 virtual scanlines (V_RES_Y), hardness -11
- 5-tap horizontal Gaussian beam simulation
- Trinitron-style aperture grille (RGB vertical stripes)
- Vignette, interlace flicker, rolling scan band, power supply flicker
- Warm color temperature tint
- Resolution uniform updated to actual framebuffer size for crisp rendering

### Music System

- 6 MP3 tracks in `public/music/` (soundtrack1-6.mp3)
- Shuffled (Fisher-Yates) each time the game starts
- Plays tracks sequentially; loops playlist when all 6 have played
- Routed through Web Audio API graph (MediaElementSource → GainNode → master)

## Key Conventions

- Rendering at native display resolution (CSS size x devicePixelRatio, capped at 2x)
- WebGL canvas has z-index:1
- All game objects added directly to `renderer.scene` by Game.ts
- Background meshes go in `renderer.bgGroup` (z=-5)
- Particle effects go in `renderer.fxGroup`
- Line thickening: wireframe lines are duplicated with perpendicular offsets for bloom visibility
- Bloom threshold is very low (0.03) — bright colors bloom easily, keep HUD text colors muted
- HUD text colors should be muted (~dark hex values) to avoid bloom blowout
- Overlay screen colors use `dimColor()` at 20-40% multipliers

## Level Themes

Each level has a color theme defined in `LEVEL_THEMES` array in Renderer.ts:
- bg color, fog color/density, accent color
- bloom strength/radius, exposure
- All levels use bloomStrength: 0.45, bloomRadius: 0.40, threshold: 0.03
- Levels: Genesis Block, Bull Trap, Liquidation, Pump & Dump, Diamond Hands,
  Bear Market, Halving, DeFi Maze, Margin Call, The Flippening

## Brick Types

| ID | HP | Special |
|----|-----|---------|
| standard | 1 | Basic brick |
| tough | 2 | Takes 2 hits |
| tough3 | 3 | Takes 3 hits |
| indestructible | 999 | Cannot be destroyed |
| explosive | 1 | Chain explosion to neighbors |
| drop | 1 | 80% powerup drop chance |
| sentimentUp | 1 | Green candle shape, +10 sentiment |
| sentimentDown | 1 | Red candle shape, -10 sentiment |
| hazard | 1 | Spawns falling hazard |
| fomo | 1 | 6s countdown; bonus if destroyed in time, explodes if not |
| stable | 1 | Indestructible in neutral sentiment; depegs when extreme |
| leverage | 2 | Score doubles per hit + spawns hazard; risk/reward |
| rug | 1 | Neighbors in radius start falling when destroyed |
| whale | 4 | Tank brick, drops multiple powerups on destroy |
| influencer | 1 | Converts adjacent bricks to standard on destroy |
| diamond | 2 | Explosion-proof, 3x score + guaranteed powerup |

## Risk Profiles

Three risk modes selectable from menu:
- **Spot (1x)**: 5 lives, 0.9x speed, 0.8x score, fewer hazards, more drops, longer fomo timers
- **Margin (5x)**: 3 lives, standard everything (default)
- **Degen (100x)**: 2 lives, 1.15x speed, 2x score, 1.5x hazards, fewer drops, shorter fomo timers

## Powerups

Positive: Diamond Hands (wide paddle), Airdrop (multiball), Shield, Whale Mode (pierce),
Bull Run (sentiment boost), Laser Eyes, Liquidity Boost (+1 life), Chain Halt (slow ball)

Negative: Paper Hands (shrink paddle), Gas Spike (speed up ball)

## Bosses

Three bosses with multi-phase fights:
- **The Whale** (Stage 5): Gravity Swell, Pickup Vacuum, Shield Spawn attacks. Phases: Accumulating → Distributing → Dumping
- **The Liquidator** (Stage 9): Liquidation Beam, Column Strike, Volatility Pulse, Hazard Summon. Phases: Targeting → Executing → Cascading
- **The Flippening** (Stage 10): Polarity Shift, Mood Inversion, Lane Pressure. Phases: Bull Form → Bear Form → Chaos Form

## Deployment

- Hosted on Vercel
- GitHub repo: https://github.com/TheMarco/rektanoid.git
- Build: `tsc && vite build` outputs to `dist/`
