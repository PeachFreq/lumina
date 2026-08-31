# Lumina device quirks — read before adding/editing presets

Living log of hardware-specific lighting behavior discovered by testing
against the real lamps. Update this whenever a new quirk is found so we
don't re-derive the same lessons.

## Govee H6022 ("table" lamp, govee-table, 192.168.68.74)

The H6022 renders colors noticeably less saturated / more washed-white
than the H6076 floor lamp or the LIFX bulb, given the IDENTICAL
hue/sat/bri/kelvin command. This affected Relax, Honey, and Velvet
presets (2026-08-30 testing with Cody).

Theories tried and REJECTED (didn't reliably fix it, don't retry blindly):
- Forcing sat=100 alone (devices.py `GOVEE_WASHOUT_SKU_BIAS["H6022"]`) —
  helps some but not sufficient on its own.
- Scaling brightness DOWN to compensate — made washout worse, not better.
- Flooring brightness UP to compensate — no reliable improvement either.
  Brightness is not the controlling variable for this lamp's whitewash.

What DOES work: per-preset, per-device empirical overrides. Cody found
by eye that Honey's table lamp (hue 35, sat 100, bri 25, kelvin 2200)
looked more like true "honey warmth" than Relax's own table lamp command
(hue 30, sat 65, bri 35, kelvin 2500) — and vice versa, Relax's command
looked better on the table lamp than Honey's own command did. So as of
2026-08-30 the two presets literally swap table-lamp commands via
`device_overrides` in api.py's PRESETS dict:

    "relax":  device_overrides={"govee-table": Honey's command}
    "honey":  device_overrides={"govee-table": Relax's command}

**Process for new presets**: never assume the table lamp will look right
just because floor lamp + LIFX look right. Always fire the preset and
independently eyeball the table lamp. If it's off, don't reach for a
formula — try swapping in another preset's command (or a fresh
hue/sat/bri combo) and confirm visually with Cody before locking it in.

### Velvet (RESOLVED 2026-08-30)

Floor lamp + LIFX bulb: correct, plush fuchsia (#E5006A reference).
Table lamp: fixed by Cody hand-tuning it directly via the Govee app to
RGB(255,0,79) — "more velvety, more red." Queried live over LAN
(devStatus UDP) to capture the exact value, then reverse-engineered
which hue input reproduces it through our apply() pipeline: hue=347,
sat=100 (forced anyway by GOVEE_WASHOUT_SKU_BIAS), bri=20 → outputs
RGB(255,0,80), matching almost exactly. Locked into
`device_overrides["govee-table"]` for the velvet preset.

Lesson: when Cody adjusts a lamp by hand (app or physical control) and
says "use what I just set," query the lamp's live state directly via
`devStatus` UDP (see script pattern below) rather than guessing — it's
authoritative and fast.

```python
import socket, json
def govee_query(ip, port=4003, timeout=2.0):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    sock.bind(("", 4002))
    sock.sendto(json.dumps({"msg": {"cmd": "devStatus", "data": {}}}).encode(), (ip, port))
    try:
        data, _ = sock.recvfrom(4096)
        return json.loads(data.decode())
    finally:
        sock.close()
```

## Relax's non-table-lamp values (kept, confirmed good 2026-08-30)
hue 30, sat 65, bri 35, kelvin 2500 — LIFX + floor lamp both good.

## Cinema (confirmed good 2026-08-30)
hue 22, sat 95, bri 2, kelvin 2700 — no complaints on any lamp.

## Architecture note
`devices.py`: `GoveeDevice.apply()` reads `GOVEE_WASHOUT_SKU_BIAS` keyed
by SKU for blanket per-model corrections (currently just force-full-sat
on H6022). `registry.apply_all()` takes a `device_overrides` dict keyed
by device id (e.g. `"govee-table"`) that fully replaces hue/sat/bri/kelvin
for that one device, layered on top of the SKU bias. `do_preset()` in
api.py passes a preset's `device_overrides` key through automatically.

## Master brightness slider (2026-08-30, corrected same day)
First pass was a MULTIPLIER (`brightness_scale`, 1-100% of preset's own
bri) — Cody caught two real problems: (1) it defaulted to showing 100%
even when the room's actual brightness was something like 35%, which is
meaningless, and (2) a multiplier can never exceed 1.0x, so you could
never make Relax brighter than Relax's own designed ceiling — defeating
the stated purpose ("turn UP the brightness while in Relax mode").

Fixed to `state.master_brightness`: an ABSOLUTE room brightness 1-100,
not a scale factor. On every preset/custom apply, master_brightness
SNAPS to that preset's own design bri (so the number on screen always
reflects true current room brightness). Dragging the slider computes
`scale = master_brightness / design_bri` and applies that ratio to
every device's bri (including per-device overrides), which can push
lamps brighter than the preset's own default — verified: Relax design
bri 35, slider pushed to 80 → table lamp 25→57, floor lamp 35→80,
color/hue unchanged, relative balance between lamps preserved. Also
verified downward (slider to 15 → table 11, floor 15) and confirmed the
snap-to-design-value behavior on preset re-activation.

State persists across restarts (`master_brightness`, `last_theta`,
`last_device_overrides` all written to `.lumina_state.json`). Endpoint:
`POST /api/brightness {"level": N}` (renamed from the old `{"scale": N}`
shape — if any external caller/bridge script used the old shape, update
it). UI component `BrightnessSlider.tsx` unchanged visually, but the
frontend now seeds its displayed value from the tapped preset's own
`bri` immediately on tap (so it doesn't wait on a network round-trip to
show the right number), and lives BELOW the preset grid (Cody's
requested position — originally placed above by mistake).

## Brightness slider rubber-banding bug (2026-08-30)
Cody reported intermittent behavior: drag the slider to a new value,
release, and it would sometimes instantly snap back to the pre-drag
value — not every time, which made it hard to describe. Root-caused to
TWO independent race conditions, both fixed same day:

1. Frontend polls `/api/state` every 30s and was unconditionally
   overwriting the slider's displayed value with whatever it got back.
   If that poll happened to land in the ~100-300ms window right after a
   drag (before/during the debounced POST to `/api/brightness`), the
   poll's stale response would win the race and visually yank the
   slider back. Fixed with a `brightnessLocalUntil` ref in App.tsx: any
   slider interaction (drag or commit) sets a 2.5s local-authority
   window during which incoming poll data is ignored for that one
   field. This is exactly the kind of bug that looks "flaky" because
   it's genuinely nondeterministic — timing-dependent, not logic-wrong
   on every call.

2. The brightness endpoint never told the Descent engine "this was a
   manual change" the way preset taps and custom-apply do
   (`engine.notice_manual_change()`). If you dragged the slider while
   the engine was mid-descent/ascent, its next 60s tick could silently
   reassert the trajectory's own brightness on top of your slider
   value — a second, independent way to produce the same rubber-band
   symptom. Fixed: `set_master_brightness()` now calls
   `engine.notice_manual_change()` (unless `source="engine"`), which
   drops the engine into "excursion" until the next scheduled anchor,
   same as every other manual control already does.

Lesson: intermittent UI "rubber-banding" after a user action is almost
always a stale-response-wins-the-race bug (a slower/older network
response overwriting a newer client-side optimistic update), not a
one-shot logic bug — check every periodic poll and background actor
(engine ticks, other timers) that could write to the same state field.

## Device rack solo bug fix (2026-08-30)
Holding a lamp row for 600ms sets it solo (all other lamps stop
receiving commands). There was no way to undo this from the UI — fixed
by making hold-to-solo a TOGGLE: holding the currently-solo'd lamp again
clears the solo (`POST /api/device/{id}/solo {"solo": false}`).
`registry.set_solo(None)` already supported this on the backend; the
gap was purely that the UI's `handleSolo` always sent `solo: true`.
Frontend now tracks whether the tapped device was already solo'd and
flips the boolean. Verified via direct API calls: solo → un-solo cycle
confirmed working, `registry.solo` correctly returns to `null`.
