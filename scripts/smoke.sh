#!/bin/bash
# Lumina v2 smoke test — exercises every endpoint with real curl (spec §8).
# Usage: scripts/smoke.sh [base_url]   (default http://127.0.0.1:5174)
set -u

BASE="${1:-http://127.0.0.1:5174}"
FAIL=0
PASS=0

check() {  # check <name> <json> <python-assertion>
  local name="$1" body="$2" expr="$3"
  if python3 -c "
import json, sys
d = json.loads(sys.argv[1])
assert ($expr)
" "$body" 2>/tmp/lumina_smoke_err; then
    echo "PASS  $name"
    PASS=$((PASS+1))
  else
    echo "FAIL  $name"
    echo "      body: ${body:0:300}"
    cat /tmp/lumina_smoke_err | sed 's/^/      /'
    FAIL=$((FAIL+1))
  fi
}

get()  { curl -sf "$BASE$1"; }
post() { curl -sf -X POST "$BASE$1" -H 'Content-Type: application/json' ${2:+-d "$2"}; }
put()  { curl -sf -X PUT  "$BASE$1" -H 'Content-Type: application/json' -d "$2"; }

echo "== Lumina v2 smoke @ $BASE =="

# --- v2 core ---
B=$(get /api/state) || { echo "FAIL  server unreachable"; exit 1; }
check "GET /api/state" "$B" "'power' in d and 'engine' in d and 'devices' in d and len(d['devices'])==3"
check "engine block" "$B" "'armed' in d['engine'] and 'trajectory' in d['engine'] and 'wake' in d['engine']"

B=$(get /api/presets)
check "GET /api/presets" "$B" "any(p['id']=='honey' for p in d['presets']) and any(p['id']=='velvet' for p in d['presets'])"

B=$(post /api/preset/relax)
check "POST /api/preset/relax" "$B" "d['ok'] and d['active_preset']=='relax' and d['mode']=='preset'"

B=$(post /api/preset/nope 2>/dev/null); RC=$?
[ $RC -ne 0 ] && { echo "PASS  POST /api/preset/nope -> 404"; PASS=$((PASS+1)); } || { echo "FAIL  unknown preset should 404"; FAIL=$((FAIL+1)); }

B=$(post /api/custom '{"hue":200,"sat":50,"bri":40,"kelvin":3500}')
check "POST /api/custom" "$B" "d['ok'] and d['mode']=='custom' and d['custom']['hue']==200"

B=$(post /api/off)
check "POST /api/off (toggle)" "$B" "d['ok'] and 'power' in d"
post /api/off > /dev/null  # toggle back

B=$(post /api/lex '{"utterance":"make it feel like a rainy jazz bar"}')
check "POST /api/lex jazz" "$B" "d['ok'] and 'scene' in d and 'via' in d"

B=$(post /api/lex '{"utterance":"warm please"}')
check "POST /api/lex warm" "$B" "d['ok']"

B=$(post /api/minima '{"name":"smoke-test","command":{"hue":10,"sat":20,"bri":30,"kelvin":2500}}')
check "POST /api/minima" "$B" "d['ok'] and d['id']=='smoke-test'"

B=$(get /api/presets)
check "saved minimum appears" "$B" "any(p['id']=='smoke-test' for p in d['presets'])"

B=$(get /api/schedule)
check "GET /api/schedule" "$B" "d['trajectory'][0]['time']=='21:00' and d['wake']['wake_target']=='05:50'"
check "4 default anchors" "$B" "len(d['trajectory'])==4 and d['trajectory'][-1]['name']=='minimum'"

B=$(put /api/schedule '{"armed":false}')
check "PUT /api/schedule disarm" "$B" "d['ok'] and d['engine']['armed']==False"
B=$(put /api/schedule '{"armed":true,"wake":{"eta_minutes_per_day":5}}')
check "PUT /api/schedule arm+eta" "$B" "d['engine']['armed']==True and d['engine']['wake']['eta_minutes_per_day']==5"
put /api/schedule '{"wake":{"eta_minutes_per_day":0}}' > /dev/null

B=$(post /api/engine/resume)
check "POST /api/engine/resume" "$B" "d['ok']"

B=$(post /api/devices/discover)
check "POST /api/devices/discover (no key ok)" "$B" "'ok' in d"

B=$(post /api/device/govee-table/power '{"on":false}')
check "POST device power off" "$B" "d['ok'] and d['device']['enabled']==False"
B=$(post /api/device/govee-table/power '{"on":true}')
check "POST device power on" "$B" "d['ok'] and d['device']['enabled']==True"

B=$(post /api/device/lifx-bulb/solo '{"solo":true}')
check "POST device solo on" "$B" "d['ok'] and d['solo']=='lifx-bulb'"
B=$(post /api/device/lifx-bulb/solo '{"solo":false}')
check "POST device solo off" "$B" "d['ok'] and d['solo'] is None"

# --- v1 aliases ---
B=$(get /state)
check "GET /state (v1)" "$B" "'power' in d and 'engine' not in d"
B=$(get /presets)
check "GET /presets (v1)" "$B" "any(p['id']=='sleep' for p in d['presets'])"
B=$(post /preset/honey)
check "POST /preset/honey (v1)" "$B" "d['ok'] and d['active_preset']=='honey'"
B=$(post /custom '{"hue":0,"sat":0,"bri":35,"kelvin":2500}')
check "POST /custom (v1)" "$B" "d['ok'] and d['mode']=='custom'"
B=$(post /off)
check "POST /off (v1)" "$B" "d['ok']"
post /off > /dev/null

# --- bridge ---
mkdir -p "$(dirname "$0")/../bridge"
echo '{"preset":"relax"}' >> "$(dirname "$0")/../bridge/inbox.jsonl"
sleep 2
B=$(get /api/state)
check "bridge inbox preset applied" "$B" "d['active_preset']=='relax' and d['mode']=='preset'"
JOURNAL="$(dirname "$0")/../bridge/journal.jsonl"
if [ -s "$JOURNAL" ] && grep -q '"source": "bridge"' "$JOURNAL"; then
  echo "PASS  bridge journal written"; PASS=$((PASS+1))
else
  echo "FAIL  bridge journal missing bridge entries"; FAIL=$((FAIL+1))
fi

# --- static / SPA ---
ROOT=$(curl -sf "$BASE/")
if echo "$ROOT" | grep -qi -e lumina -e '<html'; then
  echo "PASS  GET / (index or fallback page)"; PASS=$((PASS+1))
else
  echo "FAIL  GET / returned unexpected body"; FAIL=$((FAIL+1))
fi
SPA=$(curl -sf "$BASE/some/client/route")
if echo "$SPA" | grep -qi '<html'; then
  echo "PASS  SPA fallback route"; PASS=$((PASS+1))
else
  echo "FAIL  SPA fallback"; FAIL=$((FAIL+1))
fi
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/nonexistent")
if [ "$CODE" = "404" ]; then
  echo "PASS  unknown /api/* -> 404 (not SPA)"; PASS=$((PASS+1))
else
  echo "FAIL  /api/nonexistent returned $CODE"; FAIL=$((FAIL+1))
fi

echo "== $PASS passed, $FAIL failed =="
[ $FAIL -eq 0 ] || exit 1
