"""
LUMINA v2 — "The Descent"
FastAPI backend: multi-device registry, trajectory engine, lex, Tex bridge,
and static serving of the built PWA — one process on :5174 (spec §7).

Run: .venv/bin/python -m uvicorn api:app --host 0.0.0.0 --port 5174
"""

from __future__ import annotations

import json
import math
import os
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from devices import DeviceRegistry
from engine import Engine

HERE = Path(__file__).parent
STATE_FILE = HERE / ".lumina_state.json"
BRIDGE_DIR = HERE / "bridge"
INBOX_FILE = BRIDGE_DIR / "inbox.jsonl"
JOURNAL_FILE = BRIDGE_DIR / "journal.jsonl"
UI_DIST = HERE / "ui" / "dist"

# ---------------------------------------------------------------------------
# Presets (minima) — v1 built-ins + user minima persisted in lumina.config.json
# ---------------------------------------------------------------------------

PRESETS = {
    "morning": {
        "id": "morning", "name": "Morning",
        "description": "warm white 70%, 3000K — waking up", "accent": "#F5C882",
        "command": {"hue": 0, "sat": 0, "bri": 70, "kelvin": 3000},
    },
    "reading": {
        "id": "reading", "name": "Reading",
        "description": "neutral white 90%, 4500K — focus / book", "accent": "#B8CCE4",
        "command": {"hue": 0, "sat": 0, "bri": 90, "kelvin": 4500},
    },
    "relax": {
        "id": "relax", "name": "Relax",
        "description": "warm amber 35%, 2500K — evening wind-down", "accent": "#E8A64C",
        "command": {"hue": 0, "sat": 0, "bri": 35, "kelvin": 2500},
    },
    "honey": {
        "id": "honey", "name": "Honey",
        "description": "amber-gold 25%, 2200K — warm reggae evening", "accent": "#D4A034",
        "command": {"hue": 45, "sat": 70, "bri": 25, "kelvin": 2200},
    },
    "sleep": {
        "id": "sleep", "name": "Sleep",
        "description": "deep red-orange 5%, 2500K — near-dark, low cortisol",
        "accent": "#D4391C",
        "command": {"hue": 15, "sat": 100, "bri": 5, "kelvin": 2500},
    },
    "cinema": {
        "id": "cinema", "name": "Cinema",
        "description": "warm ember glow 2%, 2700K — movie theater", "accent": "#C47A12",
        "command": {"hue": 35, "sat": 30, "bri": 2, "kelvin": 2700},
    },
    "velvet": {
        "id": "velvet", "name": "Velvet",
        "description": "deep fuchsia (#E5006A) 32%, 3500K — mood / CitizenM magenta",
        "accent": "#E5006A",
        "command": {"hue": 330, "sat": 100, "bri": 32, "kelvin": 3500},
    },
}

registry = DeviceRegistry()


def all_presets() -> dict:
    merged = dict(PRESETS)
    for name, p in (registry.config.get("minima") or {}).items():
        merged[name] = {
            "id": name, "name": p.get("name", name.title()),
            "description": p.get("description", "saved minimum"),
            "accent": p.get("accent", "#5B7BB4"),
            "command": p["command"],
        }
    return merged


# ---------------------------------------------------------------------------
# Journal (bridge/journal.jsonl) — spec §5.2
# ---------------------------------------------------------------------------

_journal_lock = threading.Lock()


def journal(source: str, event: dict) -> None:
    BRIDGE_DIR.mkdir(exist_ok=True)
    line = json.dumps({
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": source,
        **event,
    })
    with _journal_lock:
        with JOURNAL_FILE.open("a") as f:
            f.write(line + "\n")


# ---------------------------------------------------------------------------
# App state (v1-compatible, persisted)
# ---------------------------------------------------------------------------

class BulbState:
    def __init__(self):
        self.power: bool = True
        self.mode: str = "preset"  # "preset" | "custom" | "off"
        self.active_preset: str = "relax"
        self.custom: Optional[dict] = None
        self._load()

    def _load(self):
        if STATE_FILE.exists():
            try:
                data = json.loads(STATE_FILE.read_text())
                self.power = data.get("power", True)
                self.mode = data.get("mode", "preset")
                self.active_preset = data.get("active_preset", "relax")
                self.custom = data.get("custom")
            except Exception:
                pass

    def _save(self):
        STATE_FILE.write_text(json.dumps(self.to_dict(), indent=2))

    def to_dict(self):
        return {"power": self.power, "mode": self.mode,
                "active_preset": self.active_preset, "custom": self.custom}

    def set_preset(self, name: str):
        self.power = True
        self.mode = "preset"
        self.active_preset = name
        self.custom = None
        self._save()

    def set_custom(self, hue: int, sat: int, bri: int, kelvin: int):
        self.power = True
        self.mode = "custom"
        self.custom = {"hue": hue, "sat": sat, "bri": bri, "kelvin": kelvin}
        self._save()

    def toggle_power(self):
        self.power = not self.power
        self.mode = "off" if not self.power else ("preset" if self.custom is None else "custom")
        self._save()


state = BulbState()

# ---------------------------------------------------------------------------
# Light actuation
# ---------------------------------------------------------------------------

def apply_color(hue: int, sat: int, bri: int, kelvin: int):
    registry.apply_all(hue, sat, bri, kelvin)


def apply_power(on: bool):
    registry.power_all(on)


def _engine_apply(hue, sat, bri, kelvin):
    """Engine tick actuation — updates lights AND app state (mode stays preset-ish)."""
    drift.stop()
    apply_color(hue, sat, bri, kelvin)
    state.power = True
    state.mode = "custom"
    state.custom = {"hue": hue, "sat": sat, "bri": bri, "kelvin": kelvin}
    state._save()


def _engine_power(on: bool):
    apply_power(on)
    state.power = on
    if not on:
        state.mode = "off"
    state._save()


engine = Engine(apply_cb=_engine_apply, power_cb=_engine_power,
                journal_cb=lambda e: journal("engine", e))


# ---------------------------------------------------------------------------
# Drift — slow ambient color motion for dynamic presets (our own "scenes").
# Govee LAN can't trigger app scenes (cloud/BLE only), so we render our own:
# a background thread eases the Govee lamps through a curated palette while
# the LIFX key light holds the preset's static anchor color.
# ---------------------------------------------------------------------------

class Drift:
    def __init__(self):
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.active: Optional[str] = None  # preset name driving the drift

    def start(self, name: str, palette: list, leg_seconds: float = 40.0):
        self.stop()
        self._stop.clear()
        self.active = name

        def run():
            i = 0
            while not self._stop.is_set():
                a = palette[i % len(palette)]
                b = palette[(i + 1) % len(palette)]
                steps = max(8, int(leg_seconds))  # ~1 step/sec, imperceptible
                for s in range(steps):
                    if self._stop.is_set():
                        return
                    f = (1 - math.cos(math.pi * s / steps)) / 2  # cosine ease
                    theta = {k: round(a[k] + (b[k] - a[k]) * f)
                             for k in ("hue", "sat", "bri", "kelvin")}
                    for d in registry.devices.values():
                        if d.kind == "govee" and d.enabled and d.online:
                            d.apply(**theta)
                    self._stop.wait(leg_seconds / steps)
                i += 1

        self._thread = threading.Thread(target=run, daemon=True, name="drift")
        self._thread.start()

    def stop(self):
        self._stop.set()
        self.active = None


drift = Drift()

# Curated palettes — tasteful motion, no disco. Hue/sat/bri/kelvin keyframes.
DRIFT_PALETTES = {
    # sunset glow: amber -> coral -> dusty rose -> ember -> back
    "relax": [
        {"hue": 35, "sat": 65, "bri": 35, "kelvin": 2500},
        {"hue": 18, "sat": 72, "bri": 32, "kelvin": 2300},
        {"hue": 350, "sat": 45, "bri": 30, "kelvin": 2400},
        {"hue": 25, "sat": 80, "bri": 33, "kelvin": 2200},
    ],
    # honey: slow pour between golds
    "honey": [
        {"hue": 45, "sat": 70, "bri": 25, "kelvin": 2200},
        {"hue": 38, "sat": 82, "bri": 22, "kelvin": 2100},
        {"hue": 52, "sat": 60, "bri": 26, "kelvin": 2300},
    ],
    # velvet: fuchsia breathing toward violet
    "velvet": [
        {"hue": 330, "sat": 100, "bri": 32, "kelvin": 3500},
        {"hue": 305, "sat": 90, "bri": 28, "kelvin": 3500},
        {"hue": 345, "sat": 95, "bri": 34, "kelvin": 3500},
    ],
}


def do_preset(name: str, source: str = "app") -> dict:
    presets = all_presets()
    if name not in presets:
        raise HTTPException(status_code=404, detail=f"Unknown preset: {name}")
    cmd = presets[name]["command"]
    apply_color(cmd["hue"], cmd["sat"], cmd["bri"], cmd["kelvin"])
    if name in DRIFT_PALETTES and source != "engine":
        drift.start(name, DRIFT_PALETTES[name])
    else:
        drift.stop()
    if not state.power:
        apply_power(True)
    state.set_preset(name)
    if source != "engine":
        engine.notice_manual_change()
    journal(source, {"event": "preset", "preset": name, "theta": cmd})
    return {"ok": True, **state.to_dict()}


def do_custom(hue: int, sat: int, bri: int, kelvin: int, source: str = "app") -> dict:
    drift.stop()
    apply_color(hue, sat, bri, kelvin)
    if not state.power:
        apply_power(True)
    state.set_custom(hue, sat, bri, kelvin)
    if source != "engine":
        engine.notice_manual_change()
    journal(source, {"event": "custom",
                     "theta": {"hue": hue, "sat": sat, "bri": bri, "kelvin": kelvin}})
    return {"ok": True, **state.to_dict()}


def do_off_toggle(source: str = "app") -> dict:
    drift.stop()
    state.toggle_power()
    apply_power(state.power)
    if state.power:
        presets = all_presets()
        if state.mode == "preset" and state.active_preset in presets:
            cmd = presets[state.active_preset]["command"]
            apply_color(cmd["hue"], cmd["sat"], cmd["bri"], cmd["kelvin"])
        elif state.mode == "custom" and state.custom:
            c = state.custom
            apply_color(c["hue"], c["sat"], c["bri"], c["kelvin"])
    engine.notice_manual_change()
    journal(source, {"event": "power_toggle", "power": state.power})
    return {"ok": True, **state.to_dict()}


# ---------------------------------------------------------------------------
# Lex — natural language in (spec §5.1)
# ---------------------------------------------------------------------------

KEYWORD_SCENES = {
    "warm":     {"hue": 30,  "sat": 40,  "bri": 50, "kelvin": 2500, "name": "warm"},
    "cool":     {"hue": 210, "sat": 20,  "bri": 60, "kelvin": 5500, "name": "cool"},
    "dim":      {"hue": 30,  "sat": 30,  "bri": 10, "kelvin": 2200, "name": "dim"},
    "bright":   {"hue": 0,   "sat": 0,   "bri": 95, "kelvin": 4500, "name": "bright"},
    "candle":   {"hue": 35,  "sat": 65,  "bri": 8,  "kelvin": 2000, "name": "candle"},
    "ocean":    {"hue": 195, "sat": 80,  "bri": 45, "kelvin": 4000, "name": "ocean"},
    "jazz":     {"hue": 25,  "sat": 60,  "bri": 20, "kelvin": 2200, "name": "jazz bar"},
    "dawn":     {"hue": 20,  "sat": 45,  "bri": 40, "kelvin": 3000, "name": "dawn"},
    "sunset":   {"hue": 15,  "sat": 75,  "bri": 35, "kelvin": 2200, "name": "sunset"},
    "focus":    {"hue": 0,   "sat": 0,   "bri": 90, "kelvin": 4800, "name": "focus"},
    "cozy":     {"hue": 35,  "sat": 55,  "bri": 25, "kelvin": 2300, "name": "cozy"},
    "romantic": {"hue": 345, "sat": 70,  "bri": 18, "kelvin": 2200, "name": "romantic"},
}

LEX_SYSTEM_PROMPT = """You translate natural-language lighting requests into JSON.
Respond ONLY with a JSON object, no prose, matching this schema:
{"name": "<short scene name>",
 "devices": {"key": {"hue":0-360,"sat":0-100,"bri":0-100,"kelvin":2000-6500},
             "fill": {...same...}, "accent": {...same...}}}
"key" is the main bulb, "fill" a floor lamp, "accent" a table lamp.
Design a cohesive scene for the utterance; roles may differ subtly."""


def _lex_llm(utterance: str) -> Optional[dict]:
    """Try LLM translation. Returns scene dict or None."""
    import requests as _rq
    base = os.environ.get("LLM_BASE_URL")
    key = os.environ.get("LLM_API_KEY")
    anthropic = os.environ.get("ANTHROPIC_API_KEY")
    try:
        if base and key:
            resp = _rq.post(
                f"{base.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": os.environ.get("LLM_MODEL", "gpt-4o-mini"),
                      "messages": [{"role": "system", "content": LEX_SYSTEM_PROMPT},
                                   {"role": "user", "content": utterance}],
                      "temperature": 0.4},
                timeout=20)
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]
        elif anthropic:
            resp = _rq.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": anthropic,
                         "anthropic-version": "2023-06-01"},
                json={"model": os.environ.get("LLM_MODEL", "claude-3-5-haiku-latest"),
                      "max_tokens": 512,
                      "system": LEX_SYSTEM_PROMPT,
                      "messages": [{"role": "user", "content": utterance}]},
                timeout=20)
            resp.raise_for_status()
            text = resp.json()["content"][0]["text"]
        else:
            return None
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception as e:
        print(f"lex LLM failed, falling back: {e}")
        return None


def _lex_fallback(utterance: str) -> dict:
    low = utterance.lower()
    for kw, scene in KEYWORD_SCENES.items():
        if kw in low:
            s = dict(scene)
            name = s.pop("name")
            return {"name": name, "devices": {"key": s, "fill": s, "accent": s},
                    "via": "keyword"}
    # nothing matched → gentle warm default
    s = {"hue": 30, "sat": 30, "bri": 40, "kelvin": 2700}
    return {"name": "ambient", "devices": {"key": s, "fill": s, "accent": s},
            "via": "keyword-default"}


def do_lex(utterance: str, source: str = "app") -> dict:
    scene = _lex_llm(utterance)
    via = "llm"
    if scene is None:
        scene = _lex_fallback(utterance)
        via = scene.pop("via", "keyword")
    devs = scene.get("devices") or {}
    key_state = devs.get("key") or next(iter(devs.values()), None)
    if not key_state:
        raise HTTPException(status_code=422, detail="lex produced no scene")
    # apply per-role where possible
    applied = False
    for dev in registry.devices.values():
        st = devs.get(dev.role) or key_state
        if dev.enabled:
            dev.apply(int(st["hue"]), int(st["sat"]), int(st["bri"]), int(st["kelvin"]))
            applied = True
    if not applied:
        apply_color(int(key_state["hue"]), int(key_state["sat"]),
                    int(key_state["bri"]), int(key_state["kelvin"]))
    state.set_custom(int(key_state["hue"]), int(key_state["sat"]),
                     int(key_state["bri"]), int(key_state["kelvin"]))
    engine.notice_manual_change()  # lex is an excursion (spec §5.1)
    journal(source, {"event": "lex", "utterance": utterance,
                     "scene": scene.get("name"), "via": via, "theta": key_state})
    return {"ok": True, "scene": scene.get("name"), "via": via,
            "devices": devs, **state.to_dict()}


# ---------------------------------------------------------------------------
# Tex bridge — tail bridge/inbox.jsonl (spec §5.2)
# ---------------------------------------------------------------------------

_bridge_stop = threading.Event()


def _bridge_tail():
    BRIDGE_DIR.mkdir(exist_ok=True)
    INBOX_FILE.touch(exist_ok=True)
    pos = INBOX_FILE.stat().st_size  # start at EOF: only new lines
    while not _bridge_stop.is_set():
        try:
            size = INBOX_FILE.stat().st_size
            if size < pos:  # truncated/rotated
                pos = 0
            if size > pos:
                with INBOX_FILE.open("r") as f:
                    f.seek(pos)
                    chunk = f.read()
                    pos = f.tell()
                for line in chunk.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                    except Exception:
                        continue
                    try:
                        if "utterance" in msg:
                            do_lex(str(msg["utterance"]), source="bridge")
                        elif "preset" in msg:
                            do_preset(str(msg["preset"]), source="bridge")
                    except HTTPException as e:
                        journal("bridge", {"event": "error", "detail": e.detail,
                                           "line": line[:200]})
                    except Exception as e:
                        journal("bridge", {"event": "error", "detail": str(e),
                                           "line": line[:200]})
        except Exception as e:
            print(f"bridge tail error: {e}")
        _bridge_stop.wait(1.0)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.start()
    t = threading.Thread(target=_bridge_tail, daemon=True, name="bridge-tail")
    t.start()
    print("Lumina v2 up — descent engine armed" if engine.armed
          else "Lumina v2 up — engine disarmed")
    yield
    _bridge_stop.set()
    engine.shutdown()


app = FastAPI(title="Lumina", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# -- models -----------------------------------------------------------------

class CustomCommand(BaseModel):
    hue: int = Field(ge=0, le=360)
    sat: int = Field(ge=0, le=100)
    bri: int = Field(ge=0, le=100)
    kelvin: int = Field(ge=2000, le=6500)


class LexBody(BaseModel):
    utterance: str


class MinimaBody(BaseModel):
    name: str
    description: Optional[str] = None
    accent: Optional[str] = None
    command: CustomCommand


class ScheduleBody(BaseModel):
    anchors: Optional[list] = None
    wake: Optional[dict] = None
    armed: Optional[bool] = None


class PowerBody(BaseModel):
    on: bool


class SoloBody(BaseModel):
    solo: bool = True


# -- v2 handlers -----------------------------------------------------------

def h_state():
    return {**state.to_dict(),
            "engine": engine.to_dict(),
            "devices": registry.to_list()}


def h_presets():
    return {"presets": [
        {"id": p["id"], "name": p["name"], "description": p["description"],
         "accent": p["accent"], "command": p["command"]}
        for p in all_presets().values()]}


@app.get("/api/state")
def api_state():
    return h_state()


@app.get("/api/presets")
def api_presets():
    return h_presets()


@app.post("/api/preset/{name}")
def api_preset(name: str):
    return do_preset(name)


@app.post("/api/off")
def api_off():
    return do_off_toggle()


@app.post("/api/custom")
def api_custom(cmd: CustomCommand):
    return do_custom(cmd.hue, cmd.sat, cmd.bri, cmd.kelvin)


@app.post("/api/lex")
def api_lex(body: LexBody):
    return do_lex(body.utterance)


@app.post("/api/minima")
def api_minima(body: MinimaBody):
    minima = registry.config.setdefault("minima", {})
    key = body.name.lower().replace(" ", "-")
    minima[key] = {
        "name": body.name,
        "description": body.description or "saved minimum",
        "accent": body.accent or "#5B7BB4",
        "command": body.command.model_dump(),
    }
    registry.save_config()
    journal("app", {"event": "minima_saved", "name": key})
    return {"ok": True, "id": key, "presets": h_presets()["presets"]}


@app.get("/api/schedule")
def api_get_schedule():
    return engine.to_dict()


@app.put("/api/schedule")
def api_put_schedule(body: ScheduleBody):
    engine.update_schedule(anchors=body.anchors, wake=body.wake, armed=body.armed)
    journal("app", {"event": "schedule_updated"})
    return {"ok": True, "engine": engine.to_dict()}


@app.post("/api/engine/resume")
def api_engine_resume():
    engine.resume()
    return {"ok": True, "engine": engine.to_dict()}


@app.post("/api/devices/discover")
def api_discover():
    result = registry.discover()
    journal("app", {"event": "discover", **{k: result[k] for k in ("ok",)}})
    return result


@app.post("/api/device/{device_id}/power")
def api_device_power(device_id: str, body: PowerBody):
    if device_id not in registry.devices:
        raise HTTPException(status_code=404, detail=f"Unknown device: {device_id}")
    dev = registry.device_power(device_id, body.on)
    journal("app", {"event": "device_power", "device": device_id, "on": body.on})
    return {"ok": True, "device": dev.to_dict()}


@app.post("/api/device/{device_id}/solo")
def api_device_solo(device_id: str, body: SoloBody = SoloBody()):
    if device_id not in registry.devices:
        raise HTTPException(status_code=404, detail=f"Unknown device: {device_id}")
    registry.set_solo(device_id if body.solo else None)
    journal("app", {"event": "solo", "device": device_id, "solo": body.solo})
    return {"ok": True, "solo": registry.solo, "devices": registry.to_list()}


# -- v1 alias routes (spec §6) -------------------------------------------------

@app.get("/state")
def v1_state():
    return state.to_dict()  # v1 shape, no engine/devices keys


@app.get("/presets")
def v1_presets():
    return {"presets": [
        {"id": p["id"], "name": p["name"], "description": p["description"],
         "accent": p["accent"]} for p in all_presets().values()]}


@app.post("/preset/{name}")
def v1_preset(name: str):
    return do_preset(name)


@app.post("/off")
def v1_off():
    return do_off_toggle()


@app.post("/custom")
def v1_custom(cmd: CustomCommand):
    return do_custom(cmd.hue, cmd.sat, cmd.bri, cmd.kelvin)


# -- static PWA serving with SPA fallback (spec §7) ------------------------------

@app.get("/", include_in_schema=False)
def root():
    index = UI_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return HTMLResponse("<html><body style='background:#0B0D12;color:#E8E0D0;"
                        "font-family:monospace'><h1>LUMINA</h1>"
                        "<p>Lumina API up, UI not built</p></body></html>")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    candidate = (UI_DIST / path).resolve()
    try:
        candidate.relative_to(UI_DIST.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")
    if candidate.is_file():
        return FileResponse(candidate)
    return root()  # SPA fallback
