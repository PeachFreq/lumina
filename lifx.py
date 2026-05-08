#!/usr/bin/env python3
"""
lifx.py — LIFX LAN controller for Tex / Cody's bedroom bulb.

Usage:
    python3 lifx.py <preset>
    python3 lifx.py <preset> [brightness%]
    python3 lifx.py color <hue_deg> <sat%> <bright%> <kelvin>
    python3 lifx.py list

Presets:
    morning   warm white, 70%   — waking up
    reading   neutral white, 90% — focus/book
    relax     warm amber, 35%   — evening wind-down
    sleep     deep red-orange, 5% — near-dark, low cortisol
    dim       warm, 15%          — very low ambient
    off       turns bulb off

Preset values can be edited in the PRESETS dict below.
"""

import socket
import struct
import sys
import time

LIFX_IP   = "192.168.68.56"
LIFX_PORT = 56700
SOURCE    = 0x12345678

# Presets: (hue 0-65535, saturation 0-65535, brightness 0-65535, kelvin)
# Hue: 0=red, 10922=orange, 21845=yellow, 32768=green, 43690=cyan, 54613=blue, 60074=indigo, 65535=red again
# For white tones set saturation=0 and use kelvin only
PRESETS = {
    "morning": {
        "hue": 0,
        "sat": 0,
        "bri": int(65535 * 0.70),
        "kelvin": 3000,
        "desc": "warm white 70% — waking up",
    },
    "reading": {
        "hue": 0,
        "sat": 0,
        "bri": int(65535 * 0.90),
        "kelvin": 4500,
        "desc": "neutral white 90% — focus/book",
    },
    "relax": {
        "hue": 0,
        "sat": 0,
        "bri": int(65535 * 0.35),
        "kelvin": 2500,
        "desc": "warm amber 35% — evening wind-down",
    },
    "sleep": {
        "hue": 4000,         # deep red-orange
        "sat": 60000,
        "bri": int(65535 * 0.05),
        "kelvin": 2500,
        "desc": "deep red-orange 5% — near-dark, low cortisol",
    },
    "honey": {
        "hue": int(45 / 360 * 65535),
        "sat": int(65535 * 0.70),
        "bri": int(65535 * 0.25),
        "kelvin": 2200,
        "desc": "amber-gold 25% — warm reggae evening",
    },
    "cinema": {
        "hue": int(30 / 360 * 65535),
        "sat": int(65535 * 0.20),
        "bri": int(65535 * 0.02),
        "kelvin": 2700,
        "desc": "ember glow 2% — movie theater",
    },
    "velvet": {
        "hue": int(332 / 360 * 65535),  # ~#E5006A citizenM magenta
        "sat": 65535,
        "bri": int(65535 * 0.32),
        "kelvin": 3500,
        "desc": "deep fuchsia 32% — mood lighting",
    },
}


def build_header(size, msg_type, tagged=True, res_required=False, ack_required=False, sequence=0):
    header = bytearray(36)
    struct.pack_into('<H', header, 0, size)
    protocol = 0x0400 | (0x1000 if tagged else 0) | (0x3000 if tagged else 0x1000)
    struct.pack_into('<H', header, 2, 0x3400 if tagged else 0x1400)
    struct.pack_into('<I', header, 4, SOURCE)
    # target (6 bytes) left as 0 = broadcast
    header[22] = (0x01 if res_required else 0) | (0x02 if ack_required else 0)
    header[23] = sequence
    struct.pack_into('<H', header, 32, msg_type)
    return header


def send_udp(payload: bytes, expect_reply=False, timeout=2.0):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.settimeout(timeout)
    s.sendto(payload, (LIFX_IP, LIFX_PORT))
    if expect_reply:
        try:
            data, _ = s.recvfrom(1024)
            s.close()
            return data
        except socket.timeout:
            s.close()
            return None
    s.close()
    return None


def set_color(hue, sat, bri, kelvin, duration_ms=500):
    """Send SetColor (type 102) message."""
    payload = bytearray(13)
    payload[0] = 0  # reserved
    struct.pack_into('<H', payload, 1, hue)
    struct.pack_into('<H', payload, 3, sat)
    struct.pack_into('<H', payload, 5, bri)
    struct.pack_into('<H', payload, 7, kelvin)
    struct.pack_into('<I', payload, 9, duration_ms)
    size = 36 + len(payload)
    header = build_header(size, 102, tagged=True, ack_required=False)
    send_udp(bytes(header) + bytes(payload))


def set_power(on: bool, duration_ms=500):
    """Send SetLightPower (type 117) message."""
    payload = bytearray(6)
    struct.pack_into('<H', payload, 0, 65535 if on else 0)
    struct.pack_into('<I', payload, 2, duration_ms)
    size = 36 + len(payload)
    header = build_header(size, 117, tagged=True)
    send_udp(bytes(header) + bytes(payload))


def apply_preset(name: str, brightness_override: float = None):
    if name == "off":
        set_power(False)
        print("Light off.")
        return

    p = PRESETS.get(name)
    if p is None:
        print(f"Unknown preset '{name}'. Run 'list' to see options.")
        sys.exit(1)

    bri = p["bri"]
    if brightness_override is not None:
        bri = int(65535 * max(0.0, min(1.0, brightness_override / 100.0)))

    set_power(True, duration_ms=300)
    time.sleep(0.15)
    set_color(p["hue"], p["sat"], bri, p["kelvin"])
    pct = round(bri / 65535 * 100)
    print(f"Set '{name}': {p['desc']} (brightness: {pct}%)")


def print_list():
    print("Available presets:")
    for name, p in PRESETS.items():
        pct = round(p["bri"] / 65535 * 100)
        print(f"  {name:<10} {p['desc']}")
    print("  off        turns bulb off")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    cmd = args[0].lower()

    if cmd == "list":
        print_list()

    elif cmd == "color":
        if len(args) < 5:
            print("Usage: lifx.py color <hue_deg 0-360> <sat% 0-100> <bri% 0-100> <kelvin>")
            sys.exit(1)
        hue = int(float(args[1]) / 360 * 65535)
        sat = int(float(args[2]) / 100 * 65535)
        bri = int(float(args[3]) / 100 * 65535)
        kelvin = int(args[4])
        set_power(True, 300)
        time.sleep(0.15)
        set_color(hue, sat, bri, kelvin)
        print(f"Custom color set: hue={args[1]}° sat={args[2]}% bri={args[3]}% kelvin={kelvin}K")

    elif cmd == "off":
        set_power(False)
        print("Light off.")

    else:
        # preset [brightness%]
        bri_override = None
        if len(args) >= 2:
            try:
                bri_override = float(args[1].rstrip('%'))
            except ValueError:
                print(f"Invalid brightness value: {args[1]}")
                sys.exit(1)
        apply_preset(cmd, bri_override)


if __name__ == "__main__":
    main()
