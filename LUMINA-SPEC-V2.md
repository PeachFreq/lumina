# LUMINA v2 — "The Descent"

## Design & Technical Specification v2.0

**Owner:** Cody · **Maintainer of record:** Tex
**Stack:** FastAPI + React/Vite PWA, served persistently from the Mac (launchd)
**Devices:** LIFX bulb (LAN) + Govee table lamp + Govee floor lamp (Govee OpenAPI, cloud)
**Design anchor:** `~/Tex-main/gradientDescent_designInspiration.png` — the Gradient Descent poster
**Supersedes:** LUMINA-SPEC.md (v1). v1 API surface is preserved as a compatibility layer.

---

## 0. The Concept

Gradient descent: `θ_{t+1} = θ_t − η∇L(θ_t)`. Follow the steepest path to minimize loss.

Lumina v2 treats **your evening as a loss landscape** and **sleep as the global minimum.**
The app's core object is no longer a preset — it is a **trajectory**. From evening onward,
the room's light is always *somewhere on a planned descent curve*: brightness and color
temperature stepping downward toward darkness at 10:00 PM. In the morning, the same
engine runs in reverse — an ascent — simulating sunrise before the alarm.

Presets still exist, but they are re-conceived as **minima**: named wells in the
parameter space (hue × sat × bri × kelvin) that you can drop into at any time.
A manual override during a descent is an **excursion**; the engine notices and
pauses, and resumes the descent only when you tell it to (or at the next anchor).

The wake-time migration goal (6:55 AM → 5:50 AM) is implemented as — of course —
**a learning rate.** You set a target wake time and an η (minutes per day). The
schedule steps toward the target by η each morning. Small steps converge.

Everything in the UI speaks this language: the state readout is `θ_t`, the
scheduler is the DESCENT ENGINE, the wake ramp is the ASCENT, and the hero
visual is a contour topography of your day.

---

## 1. Aesthetic Direction — "Blueprint Ember"

Derived directly from the poster. This REPLACES the v1 violet palette.

### 1.1 Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#0B0D12` | Near-black, blue-leaning ink |
| `--bg-raise` | `#11141C` | Cards, sheets |
| `--surface` | `#151925` | Tile resting state |
| `--line` | `#232A3A` | Hairline rules, borders (blueprint feel) |
| `--contour` | `#2E3A54` | Contour strokes, inactive data ink |
| `--blueprint` | `#5B7BB4` | Structural accents, axis labels, math |
| `--ember` | `#FF4D1C` | THE accent. Descent path, active states, the sun |
| `--ember-deep` | `#C43214` | Pressed states, sleep preset |
| `--bone` | `#E8E0D0` | Display type — warm parchment off-white |
| `--text-muted` | `#8A87A0` | Secondary text |
| `--text-dim` | `#4A4D63` | Tertiary, disabled |

Rule: **ember is scarce.** It marks the live thing — current θ, the active minimum,
the descent path. Everything structural is blueprint blue and hairlines. The poster
works because the red sun is alone in a blue-black field; keep that discipline.

### 1.2 Typography

- **Display:** Syne 700/800 (kept from v1 — already in the poster's spirit), tracked wide, uppercase.
- **Mono/data:** DM Mono 300/400 — all numerals, labels, annotations, the update rule.
- **Editorial annotations:** small vertical/rotated mono labels along edges
  (e.g. `— UPDATE RULE —`, `MOVE THROUGH PARAMETER SPACE`), exactly like the poster's margins.
- Japanese annotation accents, used sparingly and honestly: `勾配降下法` (gradient descent)
  next to the wordmark; `未来を最適化する` (optimize the future) on the descent card.

### 1.3 Texture & framing

- Grain/noise overlay kept from v1 (`feTurbulence`, opacity ~0.04) — the poster is grainy print, not glossy UI.
- Thin border frame inset on the page (1px `--line`, like a printed plate).
- Corner registration marks (tiny mono `+`) — printy, technical.
- The **red sun**: a halftone-scanline ember disc, top-right of the hero, small. It doubles as
  the wake indicator — it rises (translates up + brightens) as wake approaches. Do not make it huge.

### 1.4 The hero: contour topography

An SVG contour-line landscape (concentric distorted rings, like the poster's loss surface)
occupying the top ~38% of the viewport. Strokes in `--contour`/`--blueprint` at 1px.
The 24-hour schedule maps onto a path across this surface:

- The **descent path** is drawn in `--ember` with numbered step nodes (0, 1, 2, 3, 4…) —
  anchors of tonight's trajectory (e.g. 0=sundown, 1=relax, 2=honey, 3=fade, 4=minimum/off).
- **Current position θ_t** is a glowing ember dot ON the path, positioned by time of day.
  It is the app's true state indicator.
- The minimum well (sleep) sits lower-right with concentric ember rings, like the poster.
- Tap a numbered node → jumps light to that anchor state (with confirmation flash).

This is not decoration. It is the schedule, readable at a glance: "where is my
evening, and where is the light on its way to."

---

## 2. Information Architecture

Single scrolling column (max-width 430, iPhone 14 Pro primary), five zones:

1. **Masthead** — `LUMINA` wordmark (Syne 800, tracked), `勾配降下法` beside it,
   right-aligned mono status: current mode + θ readout (`bri 35 · 2500K`).
2. **Topography hero** — the contour landscape + descent path + sun (§1.4).
3. **The Update Rule strip** — one-line mono strip under the hero:
   `θ_{t+1} = θ_t − η ∇L(θ_t)` with live values substituted on descent
   (e.g. `bri 25 → 22 · step 12/40 · η 0.63/min`). When idle: the formula, dimmed.
   This is the poster's equation header, made live.
4. **Minima grid** — the presets, 2-col grid. Each tile: small contour-rings glyph
   (rings tinted by preset accent), name (Syne), one-line mono desc, and a mono
   coordinate readout (`H15 S100 B5 2500K`). Active tile = ember border + the glyph's
   center dot lit. `velvet` spans full width (kept). `sleep` gets the deep-red rings.
5. **Device rack** — the three lights as slim rows: LIFX BULB / GOVEE TABLE / GOVEE FLOOR.
   Each row: device name (mono), online dot, per-device on/off, and a "solo" hold
   gesture (long-press = only this device). Group control is the default; the rack
   is for divergence.
6. **Footer controls** — OFF/WAKE bar (kept from v1 behavior), `↑ CUSTOM` sheet trigger
   (custom sliders kept, restyled: hairline tracks, ember fill, mono values),
   and `THE DESCENT` button opening the schedule sheet (§4).
7. **Dario** — the pixel easter egg survives. He now walks the contour lines. Non-negotiable.

Bottom sheets keep v1's iOS spring animation spec. All v1 animation timings carry over
unless overridden here.

---

## 3. Multi-Device Architecture

### 3.1 Device abstraction

```
Device (abstract): id, name, kind, online, apply(hue,sat,bri,kelvin), power(on)
  ├─ LifxLanDevice   — wraps existing lifx.py (LAN)
  ├─ GoveeDevice     — Govee OpenAPI v2 (cloud), one instance per lamp
  └─ (future: anything)
```

Govee driver: `https://openapi.api.govee.com/router/api/v1/…`, header `Govee-API-Key`.
- `GET /user/devices` → discovery (sku, device id, capabilities)
- `POST /device/control` → capabilities: `on_off.powerSwitch`,
  `range.brightness`, `color_setting.colorRgb` (rgb as int), `color_setting.colorTemperatureK`.
- Rate limits exist (10 req/min per device class) → driver maintains a per-device
  min-interval queue (600ms spacing, coalesce to latest-wins) so slider drags don't 429.
- HSBK→RGB conversion in driver when sat > 0; colorTemperatureK when sat == 0.
- Key loaded from `GOVEE_API_KEY` env var or `.env` file (git-ignored). No key → devices
  registered but marked offline; UI shows them dimmed. **App fully functional without key.**

### 3.2 Rooms & roles

Config file `lumina.config.json` (git-tracked, no secrets):
```json
{
  "devices": [
    {"id": "lifx-bulb",  "kind": "lifx",  "name": "LIFX BULB",  "role": "key"},
    {"id": "govee-table","kind": "govee", "name": "GOVEE TABLE","role": "accent", "sku": null, "device": null},
    {"id": "govee-floor","kind": "govee", "name": "GOVEE FLOOR","role": "fill",   "sku": null, "device": null}
  ]
}
```
`sku`/`device` null until discovery fills them (a `POST /api/devices/discover` endpoint
matches Govee account devices to slots and persists).

Presets gain optional per-role offsets (e.g. fill runs −10 bri relative to key) —
default: all roles identical. Scenes are compositions, not one color blasted everywhere.

---

## 4. The Descent Engine (sleep) & The Ascent (wake)

Replaces v1's two cron jobs with a general **trajectory scheduler**. A trajectory is
a list of anchors `{time, state, curve}` interpolated at 1-min ticks (LAN) / 2-min (Govee).

### 4.1 Default evening descent (Cody's actual routine: in bed 9:30–9:50, lights out ~10)

| # | Time | Anchor | State |
|---|---|---|---|
| 0 | 20:30 | sundown | relax (bri 35 · 2500K) — engine takes the wheel |
| 1 | 21:00 | settle | bri 30 · 2400K |
| 2 | 21:25 | honey | honey (bri 25 · 2200K) — reading light, in bed |
| 3 | 21:50 | fade | begin exponential fade, 40 steps / 10 min |
| 4 | 22:00 | **minimum** | off. `L(θ) = 0` |

Manual change during descent → engine pauses (state: `EXCURSION`), UI shows
`descent paused — resume?` chip. Auto-resumes at the next anchor unless dismissed.

### 4.2 The ascent (wake)

- `wake_target`: 05:50 · `wake_current`: 06:55 · `eta_minutes_per_day`: configurable 0–10 (default 0 = off until Cody arms it)
- Each morning: `wake_current := max(wake_target, wake_current − η)` — persisted.
- Ascent trajectory: from `wake_current − 25min` → `wake_current`: bri 0→60,
  kelvin 2000→4500 (dawn simulation), gentle curve (ease-in).
- UI: the sheet shows current/target/η and a tiny convergence sparkline
  (projected days to target). The red sun in the hero tracks this.

### 4.3 Schedule sheet (`THE DESCENT`)

Bottom sheet listing anchors as a vertical timeline (mono times, ember nodes),
editable times via steppers, wake block below with η stepper, and an
`ENGINE ARMED / DISARMED` master toggle.

---

## 5. AI-Native Surface

### 5.1 `POST /api/lex` — natural language in

Body `{"utterance": "make it feel like a rainy jazz bar"}`. Pipeline:
1. If `LLM_BASE_URL`+`LLM_API_KEY` (or `ANTHROPIC_API_KEY`) present → LLM translates
   utterance → JSON scene `{devices: {key,fill,accent}: {hue,sat,bri,kelvin}, name, ttl?}`
   via a strict system prompt + schema. Applied as an excursion.
2. No key → deterministic fallback: keyword map (warm/cool/dim/bright/candle/ocean/
   jazz/dawn…) so the endpoint always answers.
The UI's custom sheet gains a text field: placeholder `describe the light…`.
Named results can be saved as new minima (`POST /api/minima` persists to config).

### 5.2 The Tex bridge

`~/Tex-main/Lumina/bridge/inbox.jsonl` — the backend tails this file; any line
`{"utterance": …}` or `{"preset": …}` is executed as if from the app. This is the
substrate hook: Tex (or any agent/cron) can drive the room by appending a line —
no HTTP, no auth surface, filesystem as the shared world.
All applied commands are journaled to `bridge/journal.jsonl` (source, θ, timestamp) —
the room's history becomes legible/queryable, and future features (auto-tuning the
descent from actual behavior) read from it.

---

## 6. API v2 (all under `/api`; v1 paths kept as aliases)

- `GET  /api/state` → `{power, mode, active_preset, custom, engine: {armed, phase, trajectory, next_anchor, wake: {...}}, devices: [...]}`
- `GET  /api/presets` · `POST /api/preset/{name}` · `POST /api/off` · `POST /api/custom` (v1 semantics)
- `POST /api/lex` (§5.1) · `POST /api/minima` (save custom as preset)
- `GET/PUT /api/schedule` (anchors, wake config, armed)
- `POST /api/devices/discover` · `POST /api/device/{id}/power` · `POST /api/device/{id}/solo`
- v1 alias: `/state`, `/presets`, `/preset/{name}`, `/off`, `/custom` → same handlers.

## 7. Serving (THE FIX for the dead home-screen app)

v1 died because the iPhone bookmark pointed at the Vite **dev server** (:5174), which
evaporates when the terminal closes. v2: **one FastAPI process on :5174** serves both
the built PWA (static `ui/dist`) and `/api`. A launchd plist
(`com.peachfreq.lumina.plist`, kept in repo under `deploy/`) keeps it alive across
reboots. Port 5174 is retained ON PURPOSE: Cody's existing home-screen icon starts
working again without re-adding. Dev mode (`npm run dev` on :5173) proxies to it.

## 8. Quality bar

- `npm run build` clean; TypeScript strict; no console errors in Safari.
- Every endpoint exercised by a smoke script (`scripts/smoke.sh`) with real curl.
- UI verified at 393×852 via headless browser screenshots against this spec.
- Lighthouse PWA installability passes.
- Works with zero keys (LIFX only, Govee dimmed, lex fallback) — degrades, never breaks.

*v2 of record. The poster is the mood; this document is the law.*
