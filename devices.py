"""
Lumina v2 — device abstraction layer (spec §3).

Device (abstract): id, name, kind, online, apply(hue,sat,bri,kelvin), power(on)
  ├─ LifxLanDevice   — subprocess-wraps lifx.py (LAN), exactly as v1 api.py did
  └─ GoveeDevice     — Govee OpenAPI v2 (cloud), per-device rate-limit queue

Registry loads lumina.config.json and exposes group + per-device control.
"""

from __future__ import annotations

import colorsys
import json
import os
import socket
import subprocess
import threading
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

HERE = Path(__file__).parent
CONFIG_FILE = HERE / "lumina.config.json"
LIFX_SCRIPT = HERE / "lifx.py"

GOVEE_BASE = "https://openapi.api.govee.com/router/api/v1"
GOVEE_MIN_INTERVAL = 0.6  # 600ms per-device spacing (spec §3.1)


def _load_govee_key() -> Optional[str]:
    key = os.environ.get("GOVEE_API_KEY")
    if key:
        return key.strip()
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("GOVEE_API_KEY="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if v:
                    return v
    return None


def hsbk_to_rgb_int(hue: int, sat: int, bri: int) -> int:
    """HSB (deg, %, %) -> Govee rgb int. Full-brightness RGB; bri sent separately."""
    r, g, b = colorsys.hsv_to_rgb((hue % 360) / 360.0, sat / 100.0, 1.0)
    return (int(r * 255) << 16) | (int(g * 255) << 8) | int(b * 255)


# ---------------------------------------------------------------------------
# Abstract device
# ---------------------------------------------------------------------------

class Device(ABC):
    def __init__(self, id: str, name: str, kind: str, role: str = "key"):
        self.id = id
        self.name = name
        self.kind = kind
        self.role = role
        self.online = False
        self.enabled = True  # per-device on/off in the rack

    @abstractmethod
    def apply(self, hue: int, sat: int, bri: int, kelvin: int) -> None: ...

    @abstractmethod
    def power(self, on: bool) -> None: ...

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "role": self.role,
            "online": self.online,
            "enabled": self.enabled,
        }


# ---------------------------------------------------------------------------
# LIFX (LAN) — subprocess wrapper identical in behavior to v1 api.py
# ---------------------------------------------------------------------------

class LifxLanDevice(Device):
    def __init__(self, id: str, name: str, role: str = "key"):
        super().__init__(id, name, "lifx", role)
        self.online = LIFX_SCRIPT.exists()

    def _run(self, *args: str) -> bool:
        try:
            result = subprocess.run(
                ["python3", str(LIFX_SCRIPT), *args],
                capture_output=True, text=True, timeout=10,
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

    def apply(self, hue: int, sat: int, bri: int, kelvin: int) -> None:
        self._run("color", str(hue), str(sat), str(bri), str(kelvin))

    def power(self, on: bool) -> None:
        # v1 semantics: 'off' subcommand for off; 'on' happens implicitly via color
        if not on:
            self._run("off")


# ---------------------------------------------------------------------------
# Govee (LAN) — UDP control protocol, primary driver (LAN Control enabled)
# Discovery: multicast scan 239.255.255.250:4001, replies on :4002.
# Control:   JSON UDP to <device_ip>:4003.
# ---------------------------------------------------------------------------

GOVEE_MCAST_ADDR = "239.255.255.250"
GOVEE_SCAN_PORT = 4001
GOVEE_REPLY_PORT = 4002
GOVEE_CTRL_PORT = 4003
GOVEE_LAN_MIN_INTERVAL = 0.1  # 100ms spacing is plenty on LAN


def govee_lan_scan(timeout: float = 3.0) -> list[dict]:
    """UDP multicast scan for Govee LAN-Control devices.
    Returns [{ip, device, sku, ...}] for every lamp that answers."""
    found: list[dict] = []
    seen: set = set()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("", GOVEE_REPLY_PORT))
        sock.settimeout(0.5)
        scan_msg = json.dumps(
            {"msg": {"cmd": "scan", "data": {"account_topic": "reserve"}}}
        ).encode()
        sock.sendto(scan_msg, (GOVEE_MCAST_ADDR, GOVEE_SCAN_PORT))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                data, addr = sock.recvfrom(4096)
            except socket.timeout:
                continue
            try:
                msg = json.loads(data.decode())
                d = msg.get("msg", {}).get("data", {})
                dev_id = d.get("device")
                if dev_id and dev_id not in seen:
                    seen.add(dev_id)
                    found.append({
                        "ip": d.get("ip", addr[0]),
                        "device": dev_id,
                        "sku": d.get("sku"),
                        "bleVersionHard": d.get("bleVersionHard"),
                        "wifiVersionSoft": d.get("wifiVersionSoft"),
                    })
            except Exception:
                continue
        sock.close()
    except Exception as e:
        print(f"govee lan scan error: {e}")
    return found


class GoveeDevice(Device):
    """Govee lamp over LAN UDP. One instance per lamp. Commands enter a
    latest-wins queue drained by a worker thread with 100ms spacing.
    If sends fail repeatedly (DHCP moved the lamp), a re-scan self-heals."""

    def __init__(self, id: str, name: str, role: str,
                 sku: Optional[str] = None, device: Optional[str] = None,
                 ip: Optional[str] = None,
                 api_key: Optional[str] = None):
        super().__init__(id, name, "govee", role)
        self.sku = sku
        self.device = device
        self.ip = ip
        self.api_key = api_key  # optional, unused on LAN path
        self.online = bool(ip)
        self._fail_count = 0

        self._lock = threading.Condition()
        self._pending: Optional[list] = None  # latest-wins: list of msg dicts
        self._worker = threading.Thread(target=self._drain, daemon=True,
                                        name=f"govee-{id}")
        self._worker.start()

    # -- queue ------------------------------------------------------------

    def _enqueue(self, msgs: list) -> None:
        with self._lock:
            self._pending = msgs  # coalesce: replace anything unsent
            self._lock.notify()

    def _drain(self) -> None:
        last_send = 0.0
        while True:
            with self._lock:
                while self._pending is None:
                    self._lock.wait()
                msgs = self._pending
                self._pending = None
            for msg in msgs:
                wait = last_send + GOVEE_LAN_MIN_INTERVAL - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self._send(msg)
                last_send = time.monotonic()

    def _send(self, msg: dict) -> None:
        if not self.ip:
            return
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2)
            sock.sendto(json.dumps(msg).encode(), (self.ip, GOVEE_CTRL_PORT))
            sock.close()
            self._fail_count = 0
        except Exception as e:
            print(f"govee {self.id}: {e}")
            self._fail_count += 1
            if self._fail_count >= 3:
                self._rescan()

    def _rescan(self) -> None:
        """DHCP may have moved the lamp — try to find it again by device id."""
        self._fail_count = 0
        for f in govee_lan_scan(timeout=2.0):
            if f["device"] == self.device:
                print(f"govee {self.id}: re-found at {f['ip']}")
                self.ip = f["ip"]
                self.online = True
                return
        self.online = False

    # -- Device interface ---------------------------------------------------

    def apply(self, hue: int, sat: int, bri: int, kelvin: int) -> None:
        msgs = [{"msg": {"cmd": "turn", "data": {"value": 1}}},
                {"msg": {"cmd": "brightness",
                         "data": {"value": max(1, min(100, bri))}}}]
        if sat > 0:
            rgb_int = hsbk_to_rgb_int(hue, sat, bri)
            msgs.append({"msg": {"cmd": "colorwc", "data": {
                "color": {"r": (rgb_int >> 16) & 0xFF,
                          "g": (rgb_int >> 8) & 0xFF,
                          "b": rgb_int & 0xFF},
                "colorTemInKelvin": 0}}})
        else:
            msgs.append({"msg": {"cmd": "colorwc", "data": {
                "color": {"r": 0, "g": 0, "b": 0},
                "colorTemInKelvin": max(2000, min(9000, kelvin))}}})
        self._enqueue(msgs)

    def power(self, on: bool) -> None:
        self._enqueue([{"msg": {"cmd": "turn",
                                "data": {"value": 1 if on else 0}}}])


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "devices": [
        {"id": "lifx-bulb", "kind": "lifx", "name": "LIFX BULB", "role": "key"},
        {"id": "govee-table", "kind": "govee", "name": "GOVEE TABLE",
         "role": "accent", "sku": None, "device": None},
        {"id": "govee-floor", "kind": "govee", "name": "GOVEE FLOOR",
         "role": "fill", "sku": None, "device": None},
    ],
    "minima": {},
}


class DeviceRegistry:
    def __init__(self, config_path: Path = CONFIG_FILE):
        self.config_path = config_path
        self.govee_key = _load_govee_key()
        self.devices: dict[str, Device] = {}
        self._solo: Optional[str] = None
        self.config: dict = {}
        self.reload()

    # -- config -------------------------------------------------------------

    def reload(self) -> None:
        if self.config_path.exists():
            try:
                self.config = json.loads(self.config_path.read_text())
            except Exception:
                self.config = dict(DEFAULT_CONFIG)
        else:
            self.config = dict(DEFAULT_CONFIG)
            self.save_config()
        self.devices = {}
        for spec in self.config.get("devices", []):
            kind = spec.get("kind")
            if kind == "lifx":
                dev: Device = LifxLanDevice(spec["id"], spec.get("name", spec["id"]),
                                            spec.get("role", "key"))
            elif kind == "govee":
                dev = GoveeDevice(spec["id"], spec.get("name", spec["id"]),
                                  spec.get("role", "fill"),
                                  sku=spec.get("sku"), device=spec.get("device"),
                                  ip=spec.get("ip"),
                                  api_key=self.govee_key)
            else:
                continue
            self.devices[dev.id] = dev

    def save_config(self) -> None:
        self.config_path.write_text(json.dumps(self.config, indent=2) + "\n")

    # -- group control --------------------------------------------------------

    def _targets(self) -> list[Device]:
        if self._solo and self._solo in self.devices:
            return [self.devices[self._solo]]
        return [d for d in self.devices.values() if d.enabled]

    def apply_all(self, hue: int, sat: int, bri: int, kelvin: int,
                  role_offsets: Optional[dict] = None) -> None:
        for d in self._targets():
            b = bri
            if role_offsets and d.role in role_offsets:
                b = max(0, min(100, bri + role_offsets[d.role].get("bri", 0)))
            d.apply(hue, sat, b, kelvin)

    def power_all(self, on: bool) -> None:
        for d in self._targets():
            d.power(on)

    # -- per-device -----------------------------------------------------------

    def device_power(self, device_id: str, on: bool) -> Device:
        dev = self.devices[device_id]
        dev.enabled = on
        dev.power(on)
        return dev

    def set_solo(self, device_id: Optional[str]) -> None:
        self._solo = device_id if device_id in self.devices else None

    @property
    def solo(self) -> Optional[str]:
        return self._solo

    # -- discovery -------------------------------------------------------------

    def discover(self) -> dict:
        """UDP LAN scan for Govee lamps; match to config slots and persist."""
        found = govee_lan_scan(timeout=3.0)

        slots = [s for s in self.config.get("devices", []) if s.get("kind") == "govee"]
        matched = []
        # First pass: refresh IPs of already-claimed slots (by device id)
        by_id = {f["device"]: f for f in found}
        claimed_ids = set()
        for slot in slots:
            if slot.get("device") and slot["device"] in by_id:
                f = by_id[slot["device"]]
                slot["ip"] = f["ip"]
                slot["sku"] = f.get("sku") or slot.get("sku")
                claimed_ids.add(slot["device"])
                matched.append({"id": slot["id"], "sku": slot["sku"],
                                "device": slot["device"], "ip": slot["ip"],
                                "already": True})
        # Second pass: assign unclaimed found devices to empty slots in order
        avail = [f for f in found if f["device"] not in claimed_ids
                 and f["device"] not in {s.get("device") for s in slots}]
        for slot in slots:
            if slot.get("device"):
                continue
            if not avail:
                break
            f = avail.pop(0)
            slot["sku"] = f.get("sku")
            slot["device"] = f["device"]
            slot["ip"] = f["ip"]
            matched.append({"id": slot["id"], "sku": slot["sku"],
                            "device": slot["device"], "ip": slot["ip"],
                            "already": False})
        self.save_config()
        self.reload()
        return {"ok": True, "matched": matched, "found": len(found),
                "raw": found}

    def to_list(self) -> list[dict]:
        out = []
        for d in self.devices.values():
            item = d.to_dict()
            item["solo"] = (self._solo == d.id)
            out.append(item)
        return out
