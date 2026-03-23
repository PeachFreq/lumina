"""
LUMINA — Smart Lighting API
FastAPI backend wrapping lifx.py for LAN-only control.
Run: uvicorn api:app --host 0.0.0.0 --port 8766
"""

import subprocess
import json
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Lumina", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Preset definitions
# ---------------------------------------------------------------------------

PRESETS = {
    "morning": {
        "id": "morning",
        "name": "Morning",
        "description": "warm white 70%, 3000K — waking up",
        "accent": "#F5C882",
        "command": {"hue": 0, "sat": 0, "bri": 70, "kelvin": 3000},
    },
    "reading": {
        "id": "reading",
        "name": "Reading",
        "description": "neutral white 90%, 4500K — focus / book",
        "accent": "#B8CCE4",
        "command": {"hue": 0, "sat": 0, "bri": 90, "kelvin": 4500},
    },
    "relax": {
        "id": "relax",
        "name": "Relax",
        "description": "warm amber 35%, 2500K — evening wind-down",
        "accent": "#E8A64C",
        "command": {"hue": 0, "sat": 0, "bri": 35, "kelvin": 2500},
    },
    "dim": {
        "id": "dim",
        "name": "Dim",
        "description": "warm white 15%, 2700K — very low ambient",
        "accent": "#C49A52",
        "command": {"hue": 0, "sat": 0, "bri": 15, "kelvin": 2700},
    },
    "sleep": {
        "id": "sleep",
        "name": "Sleep",
        "description": "deep red-orange 5%, 2500K — near-dark, low cortisol",
        "accent": "#D4391C",
        "command": {"hue": 15, "sat": 100, "bri": 5, "kelvin": 2500},
    },
    "cinema": {
        "id": "cinema",
        "name": "Cinema",
        "description": "warm ember glow 2%, 2700K — movie theater",
        "accent": "#C47A12",
        "command": {"hue": 35, "sat": 30, "bri": 2, "kelvin": 2700},
    },
    "velvet": {
        "id": "velvet",
        "name": "Velvet",
        "description": "deep fuchsia (#E5006A) 32%, 3500K — mood / CitizenM magenta",
        "accent": "#E5006A",
        "command": {"hue": 330, "sat": 100, "bri": 32, "kelvin": 3500},
    },
}

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

STATE_FILE = Path(__file__).parent / ".lumina_state.json"

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
        return {
            "power": self.power,
            "mode": self.mode,
            "active_preset": self.active_preset,
            "custom": self.custom,
        }

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
        if not self.power:
            self.mode = "off"
        else:
            self.mode = "preset" if self.custom is None else "custom"
        self._save()

state = BulbState()

# ---------------------------------------------------------------------------
# LIFX controller interface
# ---------------------------------------------------------------------------

LIFX_SCRIPT = Path(__file__).parent / "lifx.py"

def run_lifx(*args: str) -> bool:
    """Call lifx.py with arguments. Returns True on success."""
    try:
        result = subprocess.run(
            ["python3", str(LIFX_SCRIPT), *args],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            print(f"lifx.py error: {result.stderr}")
            return False
        return True
    except FileNotFoundError:
        print(f"Warning: {LIFX_SCRIPT} not found — running in demo mode")
        return True
    except Exception as e:
        print(f"lifx.py exception: {e}")
        return False

def apply_color(hue: int, sat: int, bri: int, kelvin: int):
    """Send color command to LIFX bulb."""
    run_lifx("color", str(hue), str(sat), str(bri), str(kelvin))

def apply_power(on: bool):
    """Toggle LIFX bulb power."""
    run_lifx("power", "on" if on else "off")

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/presets")
def get_presets():
    return {
        "presets": [
            {"id": p["id"], "name": p["name"], "description": p["description"], "accent": p["accent"]}
            for p in PRESETS.values()
        ]
    }

@app.get("/state")
def get_state():
    return state.to_dict()

@app.post("/preset/{name}")
def activate_preset(name: str):
    if name not in PRESETS:
        raise HTTPException(status_code=404, detail=f"Unknown preset: {name}")

    preset = PRESETS[name]
    cmd = preset["command"]
    apply_color(cmd["hue"], cmd["sat"], cmd["bri"], cmd["kelvin"])
    if not state.power:
        apply_power(True)
    state.set_preset(name)

    return {"ok": True, **state.to_dict()}

@app.post("/off")
def toggle_power():
    state.toggle_power()
    apply_power(state.power)

    if state.power and state.mode == "preset" and state.active_preset in PRESETS:
        cmd = PRESETS[state.active_preset]["command"]
        apply_color(cmd["hue"], cmd["sat"], cmd["bri"], cmd["kelvin"])

    return {"ok": True, **state.to_dict()}

class CustomCommand(BaseModel):
    hue: int = Field(ge=0, le=360)
    sat: int = Field(ge=0, le=100)
    bri: int = Field(ge=0, le=100)
    kelvin: int = Field(ge=2000, le=6500)

@app.post("/custom")
def set_custom(cmd: CustomCommand):
    apply_color(cmd.hue, cmd.sat, cmd.bri, cmd.kelvin)
    if not state.power:
        apply_power(True)
    state.set_custom(cmd.hue, cmd.sat, cmd.bri, cmd.kelvin)

    return {"ok": True, **state.to_dict()}
