# LUMINA — Smart Lighting PWA

## Design & Technical Specification v1.0

**Owner:** Cody
**Stack:** FastAPI + React/Vite PWA
**Target device:** iPhone 14 Pro (393 × 852 viewport)
**Network:** LAN-only, Mac Mini host

---

## 1. Color System

### Base Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#0E0C14` | Page background — near-black with faint violet warmth |
| `--surface` | `#161420` | Card/tile resting state |
| `--surface-hover` | `#1C1828` | Tile hover / press feedback |
| `--surface-active` | `#221E30` | Active tile background base |
| `--text` | `#E8E4F0` | Primary text — cool off-white |
| `--text-muted` | `#7B7490` | Secondary text, descriptions |
| `--text-dim` | `#4A4460` | Tertiary, disabled states |
| `--border` | `#2A2636` | Default tile/button borders |
| `--border-active` | `#3A3450` | Elevated border on hover |

### Preset Accent Colors

Each preset has a single accent hex. This color drives: the tile indicator dot, active tile border/glow, the ambient page wash, and any accent text.

| Preset | Accent Hex | CSS Variable |
|---|---|---|
| `morning` | `#F5C882` | `--accent-morning` |
| `reading` | `#B8CCE4` | `--accent-reading` |
| `relax` | `#E8A64C` | `--accent-relax` |
| `dim` | `#C49A52` | `--accent-dim` |
| `sleep` | `#D4391C` | `--accent-sleep` |
| `cinema` | `#C47A12` | `--accent-cinema` |
| `velvet` | `#E5006A` | `--accent-velvet` |

### Tile States

**Inactive tile:**
- Background: `var(--surface)` solid
- Border: `1px solid var(--border)`
- Indicator dot: accent color at 33% opacity
- Name text: `var(--text-muted)`
- Description text: `var(--text-dim)`
- Shadow: `0 1px 3px rgba(0,0,0,0.3)`

**Active tile:**
- Background: `linear-gradient(135deg, rgba(ACCENT, 0.12) 0%, var(--surface) 100%)`
- Border: `1px solid rgba(ACCENT, 0.35)`
- Indicator dot: accent color at 100%, with glow `0 0 8px rgba(ACCENT, 0.53)`
- Name text: `var(--text)`
- Description text: accent color at 80% opacity
- Shadow: `0 0 24px rgba(ACCENT, 0.15), 0 0 48px rgba(ACCENT, 0.06), inset 0 1px 0 rgba(ACCENT, 0.1)`

**Pressed tile (transient):**
- `transform: scale(0.96)` — springs back on release

**Off state (bulb off):**
- All tiles revert to inactive styling
- Active indicator persists at reduced opacity (shows last-used preset)
- Accent color globally falls back to `var(--text-dim)`

---

## 2. Typography

### Font Stack

- **Display / Headings:** Syne (Google Fonts), weights 700 and 800
- **Mono / Labels / Data:** DM Mono (Google Fonts), weights 300 and 400

Load via: `https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap`

### Type Scale

| Role | Font | Size | Weight | Letter-spacing | Transform |
|---|---|---|---|---|---|
| App title (LUMINA) | Syne | 18px | 800 | 0.22em | uppercase |
| Preset name | Syne | 13px | 700 | 0.14em | uppercase |
| Preset name (velvet, featured) | Syne | 15px | 700 | 0.14em | uppercase |
| Preset description | DM Mono | 10px | 400 | 0.03em | lowercase |
| Slider label | DM Mono | 11px | 400 | 0.08em | uppercase |
| Slider value | DM Mono | 11px | 400 | 0 | — |
| Button text | Syne | 12–13px | 700 | 0.16–0.18em | uppercase |
| Status indicator | DM Mono | 10px | 400 | 0.06em | uppercase |

---

## 3. Component Breakdown

### 3.1 — App Shell

Full viewport container. Background: `var(--bg)`. Contains:
- SVG noise texture overlay (fixed, `opacity: 0.035`, `pointer-events: none`, z-index above content)
- Ambient color wash (two radial gradients, blurred, accent-colored, z-index below content)
- Scrollable content column, max-width 430px, centered

The noise texture is an inline SVG with `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4">`. It covers the full viewport and never scrolls.

The ambient wash consists of two elements:
1. **Primary wash:** Positioned at top 25%, `width: 400px, height: 400px`, `radial-gradient` from `rgba(ACCENT, 0.10)` to transparent at 70%, `filter: blur(80px)`. Plays a slow breathing animation: scale oscillates between 1.0 and 1.05 over 6s.
2. **Secondary wash:** Positioned at bottom -10%, `width: 500px, height: 300px`, `radial-gradient` from `rgba(ACCENT, 0.06)` to transparent. `filter: blur(60px)`. Static.

Both washes transition `background` over 1.2s ease when accent color changes.

### 3.2 — Header

Horizontal bar at the top. Padding-top: 56px (safe area). Contains:
- **Left:** Status dot (10×10px circle, accent-colored with `box-shadow: 0 0 10px ACCENT/53, 0 0 20px ACCENT/27`) + app title "LUMINA"
- **Right:** Current state label in DM Mono — shows active preset name, "CUSTOM", or "OFF"

The status dot pulses with a subtle opacity animation (0.6 → 1.0 → 0.6, 3s cycle) when bulb is on.

### 3.3 — PresetGrid

CSS Grid: `grid-template-columns: 1fr 1fr`, `gap: 10px`. Contains 7 PresetTile components. The `velvet` tile spans both columns (`grid-column: 1 / -1`).

### 3.4 — PresetTile

See tile states above. Structure per tile:
- Row 1: accent dot (8×8px circle) + preset name
- Row 2: description text, indented 16px from left

Minimum heights: standard tiles 80px, velvet tile 72px. `border-radius: 14px`.

Tap behavior:
1. On touch-start: `scale(0.96)` with `transition: 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)`
2. On touch-end: scale returns to 1.0
3. On click: fires API call `POST /preset/{name}`, updates local state immediately (optimistic), sets bulb to on if off

### 3.5 — Off Button

Full-width button below the grid. `border-radius: 12px`, `padding: 14px 0`.

**Bulb on state:**
- Background: transparent
- Border: `1px solid var(--border)`
- Text: "OFF" in `var(--text-muted)`, Syne 12px weight 700, tracking 0.18em

**Bulb off state:**
- Background: `rgba(ACCENT, 0.1)` — using the last-active accent
- Border: `1px solid rgba(ACCENT, 0.3)`
- Text: "TAP TO WAKE" in accent color

Tap fires `POST /off` (toggle) or `POST /preset/{last}` to wake.

### 3.6 — Custom Panel Trigger

Below the Off button. A minimal text button: `↑ CUSTOM`, DM Mono 11px, `var(--text-dim)`. Tapping opens the Custom Panel bottom sheet.

### 3.7 — Custom Panel (Bottom Sheet)

A panel that slides up from the bottom of the screen, covering roughly the lower 60% of the viewport.

**Container:**
- Background: `linear-gradient(180deg, #1A1726 0%, var(--bg) 100%)`
- `border-radius: 20px 20px 0 0`
- `box-shadow: 0 -8px 40px rgba(0,0,0,0.5)`
- Padding: 12px 24px 40px
- Max-width: 430px, centered

**Drag handle:** 36×4px rounded bar, `var(--text-dim)`, centered at top. Supports swipe-down-to-dismiss (if drag > 100px, sheet closes).

**Overlay:** Fixed overlay behind the sheet, `rgba(0,0,0,0.6)`, click-to-dismiss.

**Contents:**
- Header row: "CUSTOM" label (Syne 14px/700) + live color preview swatch (28×28px circle with glow)
- Four sliders (see 3.8)
- Apply button: full width, same styling as active tile border/glow but as a button

**Animation:** Sheet enters with `transform: translateY(100%) → translateY(0)`, `0.35s cubic-bezier(0.32, 0.72, 0, 1)`. Overlay fades in over 0.25s.

### 3.8 — Custom Sliders

Each slider consists of:
- Label row: slider name (left, DM Mono 11px uppercase) + current value (right, DM Mono 11px)
- Track: 3px tall bar, `var(--border)` for unfilled, accent-colored for filled portion
- Thumb: 18×18px circle, accent-colored, with glow `box-shadow: 0 0 12px ACCENT/40, 0 0 4px ACCENT/27`

Slider ranges:
- Hue: 0–360°, step 1
- Saturation: 0–100%, step 1
- Brightness: 0–100%, step 1
- Kelvin: 2000–6500K, step 100

Implemented as custom div-based sliders (not native range inputs) for full visual control. Touch-drag with immediate response; no debounce on visual update.

The preview swatch color is computed from HSL(hue, sat, max(25, bri×0.55)) to ensure the preview is always visible even at low brightness.

---

## 4. Layout Spec

### Viewport Target

iPhone 14 Pro: 393 × 852 CSS pixels. The layout must also work on iPhone SE (375 × 667) and larger phones up to 430px wide.

### Spacing System

Base unit: 4px. All spacing is a multiple of 4.

| Element | Value |
|---|---|
| Page horizontal padding | 20px |
| Safe area top padding | 56px |
| Header bottom margin | 20px |
| Grid gap | 10px |
| Tile inner padding | 16px |
| Tile border radius | 14px |
| Space between grid and Off button | flex (minimum 16px) |
| Off button bottom margin | 10px |
| Custom trigger bottom padding | 36px |
| Bottom sheet padding | 12px top, 24px sides, 40px bottom |
| Slider bottom margin | 20px |
| Slider label-to-track gap | 8px |

### Grid Math (iPhone 14 Pro)

Content width: 393 − 40 (padding) = 353px.
Each tile width: (353 − 10) / 2 = 171.5px.
Velvet tile: 353px full width.

Vertical budget:
- 56 (safe) + 20 (header bottom) + 48 (header) = 124px top
- Grid: 3 rows × 80px + 1 row × 72px + 3 × 10px gap = 382px
- 16 (flex space) + 42 (off btn) + 10 + 36 (custom trigger) + 36 (bottom safe) = 140px bottom
- Total: ~646px — fits within 852 with 206px breathing room

---

## 5. Animation Spec

### Tile Press

- Property: `transform`
- On press: `scale(0.96)`
- Duration: 0.15s
- Easing: `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- On release: returns to `scale(1)` with same timing

### Tile State Transition (active ↔ inactive)

- Properties: `background, border, box-shadow, color`
- Duration: background/shadow 0.6s, border 0.4s, color 0.4s
- Easing: `ease`

### Ambient Wash Breathing

- Properties: `opacity, transform`
- Keyframes: `0%/100%: opacity 0.5, scale(1)` → `50%: opacity 0.7, scale(1.05)`
- Duration: 6s
- Easing: `ease-in-out`
- Iteration: infinite
- Only plays when bulb is on

### Status Dot Pulse

- Property: `opacity`
- Keyframes: `0%/100%: 0.6` → `50%: 1.0`
- Duration: 3s
- Easing: `ease-in-out`
- Iteration: infinite

### Page Load Stagger

All main sections use a shared `fadeIn` animation (opacity 0→1, translateY 8→0, 0.5s ease) with staggered `animation-delay`:
- Header: 0s
- Grid: 0.1s
- Off button: 0.2s
- Custom trigger: 0.3s

### Bottom Sheet Enter/Exit

- Property: `transform: translateY`
- Enter: `translateY(100%) → translateY(0)`
- Duration: 0.35s
- Easing: `cubic-bezier(0.32, 0.72, 0, 1)` — iOS-style spring
- Overlay: `opacity: 0 → 1`, 0.25s ease

### Accent Color Global Transition

When the active preset changes, these transition over 1.2s ease:
- Ambient wash gradient colors
- Status dot color and glow

---

## 6. PWA Icon Spec

### Design

A 512×512px icon with the following composition:
- Background: solid `#0E0C14` (matches app background)
- Center element: a soft, glowing circle — a radial gradient from `#E5006A` (velvet accent) at center to transparent at edges
- The glow circle is positioned center, ~200px diameter, with a soft falloff
- Below the glow, a very subtle noise texture (optional, only if the icon renderer supports it)

The icon should read as: a luminous orb floating in darkness. No text, no logomarks. Pure light.

### Implementation

Generate with Canvas API at build time, or provide as static PNGs:
- `icon-192.png` — 192×192
- `icon-512.png` — 512×512

```javascript
// Canvas generation pseudocode:
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 512;
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = '#0E0C14';
ctx.fillRect(0, 0, 512, 512);

// Glow
const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 160);
grad.addColorStop(0, '#E5006A');
grad.addColorStop(0.4, 'rgba(229, 0, 106, 0.4)');
grad.addColorStop(1, 'rgba(229, 0, 106, 0)');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, 512, 512);
```

### iOS Meta Tags

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Lumina">
<meta name="theme-color" content="#0E0C14">
<link rel="apple-touch-icon" href="/icon-192.png">
```

---

## 7. API Contract

**Base URL:** `http://<mac-mini-ip>:8766`

### GET /presets

Returns the list of available presets.

```json
// Response 200
{
  "presets": [
    {
      "id": "morning",
      "name": "Morning",
      "description": "warm white 70%, 3000K — waking up",
      "accent": "#F5C882"
    },
    // ... all 7
  ]
}
```

### GET /state

Returns the current bulb state.

```json
// Response 200
{
  "power": true,
  "mode": "preset",       // "preset" | "custom" | "off"
  "active_preset": "relax",  // null if mode is "custom"
  "custom": null,             // { hue, sat, bri, kelvin } if mode is "custom"
}
```

### POST /preset/{name}

Activate a preset. Turns power on if off.

```
POST /preset/velvet
```

```json
// Response 200
{
  "ok": true,
  "power": true,
  "mode": "preset",
  "active_preset": "velvet"
}
```

```json
// Response 404
{ "error": "Unknown preset: foo" }
```

### POST /off

Toggle power. If on, turns off. If off, restores last preset.

```json
// Response 200
{
  "ok": true,
  "power": false,  // or true if it was off
  "mode": "off",
  "active_preset": "relax"  // remembers last preset
}
```

### POST /custom

Set arbitrary color values. Turns power on if off.

```json
// Request body
{
  "hue": 280,
  "sat": 80,
  "bri": 50,
  "kelvin": 3500
}
```

```json
// Response 200
{
  "ok": true,
  "power": true,
  "mode": "custom",
  "custom": { "hue": 280, "sat": 80, "bri": 50, "kelvin": 3500 }
}
```

All endpoints return `Content-Type: application/json`. CORS is open (`*`).

---

## 8. Backend Code — `api.py`

See `api.py` in project root. Complete, ready to run.

---

## 9. Frontend Scaffolding

See `ui/` directory. Complete project with all source files.

### Key files:
- `ui/src/App.tsx` — root component, layout shell, ambient effects
- `ui/src/components/PresetGrid.tsx` — grid container
- `ui/src/components/PresetTile.tsx` — individual tile with press/active states
- `ui/src/components/CustomPanel.tsx` — bottom sheet with sliders
- `ui/src/components/StateIndicator.tsx` — header with status dot
- `ui/src/api.ts` — typed API client
- `ui/src/styles/globals.css` — variables, resets, noise, animations
- `ui/src/styles/presets.css` — tile and grid styles
- `ui/vite.config.ts` — dev server on port 5174, proxy to backend
- `ui/package.json` — dependencies

---

## 10. Startup

```bash
# Terminal 1 — Backend
cd ~/Projects/smarthome
pip install fastapi uvicorn
python -m uvicorn api:app --host 0.0.0.0 --port 8766

# Terminal 2 — Frontend
cd ~/Projects/smarthome/ui
npm install
npm run dev

# On iPhone (same Wi-Fi):
# Open Safari → http://<mac-mini-ip>:5174
# Tap Share → Add to Home Screen
```

The PWA will install with the LUMINA icon and run in standalone mode (no browser chrome).

---

*End of spec. This document is the source of truth. Do not deviate.*
