"""
Lumina v2 — the Descent Engine & the Ascent (spec §4).

A trajectory is a list of anchors {time, name, state, curve} interpolated at
1-minute ticks via apscheduler. Manual changes during a descent create an
EXCURSION (engine pauses until the next anchor or explicit resume).
The ascent runs wake_current-25min → wake_current (bri 0→60, K 2000→4500,
ease-in) and migrates wake_current toward wake_target by eta_minutes_per_day.
"""

from __future__ import annotations

import json
import math
import threading
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Callable, Optional

from apscheduler.schedulers.background import BackgroundScheduler

HERE = Path(__file__).parent
ENGINE_STATE_FILE = HERE / ".lumina_engine.json"

# Default evening descent — spec §4.1
DEFAULT_ANCHORS = [
    {"time": "20:30", "name": "sundown",
     "state": {"hue": 0, "sat": 0, "bri": 35, "kelvin": 2500}, "curve": "linear"},
    {"time": "21:00", "name": "settle",
     "state": {"hue": 0, "sat": 0, "bri": 30, "kelvin": 2400}, "curve": "linear"},
    {"time": "21:25", "name": "honey",
     "state": {"hue": 45, "sat": 70, "bri": 25, "kelvin": 2200}, "curve": "linear"},
    {"time": "21:50", "name": "fade",
     "state": {"hue": 45, "sat": 70, "bri": 25, "kelvin": 2200}, "curve": "exp"},
    {"time": "22:00", "name": "minimum",
     "state": {"hue": 45, "sat": 70, "bri": 0, "kelvin": 2200}, "curve": "linear"},
]

DEFAULT_WAKE = {
    "wake_target": "05:50",
    "wake_current": "06:55",
    "eta_minutes_per_day": 0,   # off until Cody arms it
    "last_migrated": None,      # ISO date of last morning migration
}

ASCENT_MINUTES = 25
ASCENT_FROM = {"bri": 0, "kelvin": 2000}
ASCENT_TO = {"bri": 60, "kelvin": 4500}


def _parse_hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _fmt_hm(minutes: int) -> str:
    minutes = max(0, minutes) % 1440
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


class Engine:
    """Trajectory scheduler. Calls back into the app to actually move lights."""

    def __init__(self,
                 apply_cb: Callable[[int, int, int, int], None],
                 power_cb: Callable[[bool], None],
                 journal_cb: Optional[Callable[[dict], None]] = None):
        self._apply = apply_cb
        self._power = power_cb
        self._journal = journal_cb or (lambda e: None)
        self._lock = threading.Lock()

        self.armed = True
        self.anchors = [dict(a) for a in DEFAULT_ANCHORS]
        self.wake = dict(DEFAULT_WAKE)
        self.phase = "idle"          # idle | descent | ascent | excursion
        self.excursion_until: Optional[str] = None  # "HH:MM" of next anchor
        self._last_state: Optional[dict] = None
        self._powered_off_at_min = False

        self._load()
        self.scheduler = BackgroundScheduler()
        self.scheduler.add_job(self.tick, "cron", minute="*", id="engine_tick")

    # -- persistence ---------------------------------------------------------

    def _load(self) -> None:
        if ENGINE_STATE_FILE.exists():
            try:
                d = json.loads(ENGINE_STATE_FILE.read_text())
                self.armed = d.get("armed", True)
                self.anchors = d.get("anchors", self.anchors)
                self.wake = {**DEFAULT_WAKE, **d.get("wake", {})}
            except Exception:
                pass

    def _save(self) -> None:
        ENGINE_STATE_FILE.write_text(json.dumps({
            "armed": self.armed,
            "anchors": self.anchors,
            "wake": self.wake,
        }, indent=2))

    # -- lifecycle -------------------------------------------------------------

    def start(self) -> None:
        self.scheduler.start()

    def shutdown(self) -> None:
        try:
            self.scheduler.shutdown(wait=False)
        except Exception:
            pass

    # -- public control -----------------------------------------------------------

    def set_armed(self, armed: bool) -> None:
        with self._lock:
            self.armed = armed
            if not armed:
                self.phase = "idle"
                self.excursion_until = None
            self._save()

    def update_schedule(self, anchors: Optional[list] = None,
                        wake: Optional[dict] = None,
                        armed: Optional[bool] = None) -> None:
        with self._lock:
            if anchors is not None:
                self.anchors = sorted(anchors, key=lambda a: _parse_hm(a["time"]))
            if wake is not None:
                self.wake = {**self.wake, **wake}
            if armed is not None:
                self.armed = armed
            self._save()

    def notice_manual_change(self) -> None:
        """Manual override during a descent/ascent → excursion (spec §4.1)."""
        with self._lock:
            if self.phase in ("descent", "ascent"):
                self.phase = "excursion"
                nxt = self._next_anchor_after(self._now_minutes())
                self.excursion_until = nxt["time"] if nxt else None
                self._journal({"event": "excursion",
                               "resume_at": self.excursion_until})

    def resume(self) -> None:
        with self._lock:
            if self.phase == "excursion":
                self.phase = "idle"
                self.excursion_until = None

    # -- trajectory math -----------------------------------------------------------

    @staticmethod
    def _now_minutes(now: Optional[datetime] = None) -> int:
        now = now or datetime.now()
        return now.hour * 60 + now.minute

    def _next_anchor_after(self, mins: int) -> Optional[dict]:
        for a in self.anchors:
            if _parse_hm(a["time"]) > mins:
                return a
        return None

    def _segment_at(self, mins: int) -> Optional[tuple]:
        """Return (prev_anchor, next_anchor, progress 0..1) if inside descent window."""
        times = [_parse_hm(a["time"]) for a in self.anchors]
        if not times or mins < times[0] or mins > times[-1]:
            return None
        for i in range(len(times) - 1):
            if times[i] <= mins <= times[i + 1]:
                span = times[i + 1] - times[i]
                p = 0.0 if span == 0 else (mins - times[i]) / span
                return self.anchors[i], self.anchors[i + 1], p
        return None

    @staticmethod
    def _interp(a: dict, b: dict, p: float, curve: str) -> dict:
        if curve == "exp":
            # exponential fade: multiplier decays toward 0
            k = math.exp(-4.0 * p)  # ~0.018 at p=1
            f = (k - math.exp(-4.0)) / (1 - math.exp(-4.0))
        elif curve == "ease-in":
            f = 1 - p * p
        else:
            f = 1 - p
        # f = weight of 'a'; 1-f = weight of 'b'
        out = {}
        for key in ("hue", "sat", "bri", "kelvin"):
            out[key] = round(a[key] * f + b[key] * (1 - f))
        return out

    def _ascent_window(self) -> tuple[int, int]:
        end = _parse_hm(self.wake["wake_current"])
        return end - ASCENT_MINUTES, end

    def _ascent_state_at(self, mins: int) -> Optional[dict]:
        start, end = self._ascent_window()
        if mins < start or mins > end:
            return None
        p = (mins - start) / max(1, end - start)
        pe = p * p  # ease-in
        return {"hue": 0, "sat": 0,
                "bri": round(ASCENT_FROM["bri"] + (ASCENT_TO["bri"] - ASCENT_FROM["bri"]) * pe),
                "kelvin": round(ASCENT_FROM["kelvin"] + (ASCENT_TO["kelvin"] - ASCENT_FROM["kelvin"]) * pe)}

    # -- wake migration (the learning rate) --------------------------------------

    def _migrate_wake(self, today: date) -> None:
        eta = self.wake.get("eta_minutes_per_day", 0) or 0
        if eta <= 0:
            return
        if self.wake.get("last_migrated") == today.isoformat():
            return
        cur = _parse_hm(self.wake["wake_current"])
        tgt = _parse_hm(self.wake["wake_target"])
        new = max(tgt, cur - eta)
        self.wake["wake_current"] = _fmt_hm(new)
        self.wake["last_migrated"] = today.isoformat()
        self._save()
        self._journal({"event": "wake_migration",
                       "wake_current": self.wake["wake_current"], "eta": eta})

    # -- the tick -------------------------------------------------------------------

    def tick(self, now: Optional[datetime] = None) -> None:
        now = now or datetime.now()
        mins = self._now_minutes(now)
        with self._lock:
            if not self.armed:
                self.phase = "idle"
                return

            # excursion: auto-resume only when we reach the next anchor
            if self.phase == "excursion":
                if self.excursion_until is not None and mins >= _parse_hm(self.excursion_until):
                    self.phase = "idle"
                    self.excursion_until = None
                    self._journal({"event": "excursion_auto_resume"})
                else:
                    return

            # ascent window?
            astate = self._ascent_state_at(mins)
            if astate is not None:
                start, end = self._ascent_window()
                if mins == end:
                    self._migrate_wake(now.date())
                self.phase = "ascent"
                self._emit(astate, source="ascent")
                return

            # descent window?
            seg = self._segment_at(mins)
            if seg is not None:
                a, b, p = seg
                st = self._interp(a["state"], b["state"], p, a.get("curve", "linear"))
                self.phase = "descent"
                if st["bri"] <= 0:
                    if not self._powered_off_at_min:
                        self._power(False)
                        self._powered_off_at_min = True
                        self._journal({"event": "minimum", "theta": st})
                else:
                    self._powered_off_at_min = False
                    self._emit(st, source="descent")
                return

            self.phase = "idle"
            self._powered_off_at_min = False

    def _emit(self, st: dict, source: str) -> None:
        if st == self._last_state:
            return
        self._last_state = dict(st)
        self._apply(st["hue"], st["sat"], st["bri"], st["kelvin"])
        self._journal({"event": "engine_step", "source": source, "theta": st})

    # -- readout for /api/state --------------------------------------------------

    def to_dict(self) -> dict:
        mins = self._now_minutes()
        nxt = self._next_anchor_after(mins)
        cur = _parse_hm(self.wake["wake_current"])
        tgt = _parse_hm(self.wake["wake_target"])
        eta = self.wake.get("eta_minutes_per_day", 0) or 0
        days_to_target = math.ceil((cur - tgt) / eta) if eta > 0 and cur > tgt else 0
        return {
            "armed": self.armed,
            "phase": self.phase,
            "excursion_until": self.excursion_until,
            "trajectory": self.anchors,
            "next_anchor": nxt,
            "wake": {**self.wake, "days_to_target": days_to_target,
                     "ascent_start": _fmt_hm(cur - ASCENT_MINUTES)},
        }
