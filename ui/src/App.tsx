import { useState, useEffect, useCallback, useRef } from "react";
import "./styles/globals.css";
import "./styles/presets.css";
import Masthead from "./components/Masthead";
import UpdateRuleStrip from "./components/UpdateRuleStrip";
import MinimaGrid, { type MinimaData } from "./components/MinimaGrid";
import DeviceRack from "./components/DeviceRack";
import BrightnessSlider from "./components/BrightnessSlider";
import CustomPanel from "./components/CustomPanel";
import ScheduleSheet from "./components/ScheduleSheet";
import {
  activatePreset,
  togglePower,
  setCustom,
  getState,
  setDevicePower,
  soloDevice,
  setMasterBrightness,
  MOCK_DEVICES,
  type BulbState,
  type DeviceInfo,
  type EngineState,
} from "./api";

/* ─── Minima definitions (named wells in parameter space, mirrored for instant UI) ─── */

const MINIMA: MinimaData[] = [
  { id: "morning", name: "MORNING", desc: "warm white", accent: "#F5C882", hue: 40, sat: 0, bri: 70, kelvin: 3000 },
  { id: "daylight", name: "DAYLIGHT", desc: "neutral white · brightest, coldest", accent: "#B8CCE4", hue: 220, sat: 0, bri: 90, kelvin: 4500 },
  { id: "relax", name: "RELAX", desc: "warm amber", accent: "#E8A64C", hue: 35, sat: 60, bri: 35, kelvin: 2500 },
  { id: "honey", name: "HONEY", desc: "amber-gold · reading in bed", accent: "#D4A034", hue: 42, sat: 80, bri: 25, kelvin: 2200 },
  { id: "sleep", name: "SLEEP", desc: "red-orange · near dark", accent: "#C43214", hue: 15, sat: 100, bri: 5, kelvin: 2500 },
  { id: "cinema", name: "CINEMA", desc: "ember glow", accent: "#C47A12", hue: 30, sat: 70, bri: 2, kelvin: 2700 },
  { id: "velvet", name: "VELVET", desc: "fuchsia · mood", accent: "#E5006A", hue: 330, sat: 100, bri: 32, kelvin: 3500, featured: true },
];

export default function App() {
  const [activePresetId, setActivePresetId] = useState("relax");
  const [isOn, setIsOn] = useState(true);
  const [isCustom, setIsCustom] = useState(false);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [customValues, setCustomValues] = useState({ hue: 280, sat: 80, bri: 50, kelvin: 3500 });
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>(MOCK_DEVICES);
  const [masterBrightness, setMasterBrightnessState] = useState<number | null>(null);

  // Suppresses the periodic /api/state poll from overwriting the slider
  // with a stale value while the user is actively dragging it, or for a
  // short grace window after release — the POST to /api/brightness and
  // the next scheduled GET /api/state poll can race, and without this
  // guard the poll sometimes wins and the slider visibly "rubber-bands"
  // back to the pre-drag value (bug reported 2026-08-30: intermittent,
  // looked like flakiness but was a real race condition).
  const brightnessLocalUntil = useRef(0);

  /* ─── Sync from backend (mock defaults stand when unreachable) ─── */

  const refresh = useCallback(() => {
    getState()
      .then((s: BulbState) => {
        setIsOn(s.power);
        if (s.active_preset) setActivePresetId(s.active_preset);
        if (s.mode === "custom" && s.custom) {
          setIsCustom(true);
          setCustomValues(s.custom);
        }
        if (s.engine) setEngine(s.engine);
        if (s.devices && s.devices.length) setDevices(s.devices);
        if (typeof s.master_brightness === "number" && Date.now() > brightnessLocalUntil.current) {
          setMasterBrightnessState(s.master_brightness);
        }
      })
      .catch(() => {
        /* Backend unreachable — mock/default state stands */
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  /* ─── Derived status ─── */

  const activeMinimum = MINIMA.find((m) => m.id === activePresetId);
  const statusLabel = !isOn ? "OFF" : isCustom ? "CUSTOM" : activePresetId.toUpperCase();
  const statusBri = isCustom ? customValues.bri : activeMinimum?.bri ?? 0;
  const statusKelvin = isCustom ? customValues.kelvin : activeMinimum?.kelvin ?? 2500;

  /* ─── Handlers (optimistic, fire-and-forget) ─── */

  const handlePreset = useCallback((id: string) => {
    setActivePresetId(id);
    setIsCustom(false);
    setIsOn(true);
    const m = MINIMA.find((x) => x.id === id);
    if (m) {
      setMasterBrightnessState(m.bri); // preset's own design brightness — matches backend snap
      brightnessLocalUntil.current = Date.now() + 2000;
    }
    activatePreset(id).catch(console.error);
  }, []);

  const handleOff = useCallback(() => {
    setIsOn((prev) => !prev);
    togglePower().catch(console.error);
  }, []);

  const handleApplyCustom = useCallback(() => {
    setIsCustom(true);
    setIsOn(true);
    setShowCustomPanel(false);
    setCustom(customValues).catch(console.error);
  }, [customValues]);

  const handleDevicePower = useCallback((id: string, on: boolean) => {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, enabled: on } : d)));
    setDevicePower(id, on).catch(console.error);
  }, []);

  const handleSolo = useCallback((id: string) => {
    setDevices((prev) => {
      const wasSolo = prev.find((d) => d.id === id)?.solo;
      const nextSolo = !wasSolo; // holding an already-solo'd device un-solos it
      soloDevice(id, nextSolo).catch(console.error);
      return prev.map((d) => ({ ...d, solo: nextSolo && d.id === id }));
    });
  }, []);

  const handleBrightnessChange = useCallback((v: number) => {
    // Live drag feedback — also extends the poll-suppression window so a
    // 30s-interval refresh landing mid-drag can't yank the handle back.
    brightnessLocalUntil.current = Date.now() + 2500;
    setMasterBrightnessState(v);
  }, []);

  const handleBrightnessCommit = useCallback((v: number) => {
    brightnessLocalUntil.current = Date.now() + 2500;
    setMasterBrightness(v).catch(console.error);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── Grain overlay (printed-plate texture, kept from v1) ─── */}
      <svg
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 100,
          opacity: 0.04,
        }}
      >
        <filter id="lumina-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#lumina-noise)" />
      </svg>

      {/* ─── Page border frame — 1px --line inset, like a printed plate ───
          borderRadius rounds the frame's own corners so they don't sit
          as sharp 90° angles right where the iPhone's curved screen glass
          starts — at a 6px inset that square corner peeked out past the
          curvature and looked clipped (reported on iPhone 16 Pro, 2026-08-30) */}
      <div
        style={{
          position: "fixed",
          inset: 6,
          border: "1px solid var(--line)",
          borderRadius: 34,
          pointerEvents: "none",
          zIndex: 99,
        }}
      />

      {/* ─── Content column — fixed, non-scrolling (2026-08-30: everything
          fits within the iPhone viewport now that spacing was tightened,
          so scrolling was pure downside — it let an accidental drag shift
          the controls up/down, which Cody didn't want) ─── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          overflow: "hidden",
          touchAction: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "max(env(safe-area-inset-top), 20px) 20px max(env(safe-area-inset-bottom), 12px)",
            maxWidth: 430,
            margin: "0 auto",
            width: "100%",
            height: "100%",
          }}
        >
          <Masthead isOn={isOn} modeLabel={statusLabel} bri={statusBri} kelvin={statusKelvin} />

          <UpdateRuleStrip engine={engine} />

          <MinimaGrid
            minima={MINIMA}
            activeId={activePresetId}
            isOn={isOn}
            isCustom={isCustom}
            onSelect={handlePreset}
          />

          <BrightnessSlider
            value={masterBrightness ?? statusBri}
            onChange={handleBrightnessChange}
            onCommit={handleBrightnessCommit}
            disabled={!isOn}
          />

          <DeviceRack devices={devices} onTogglePower={handleDevicePower} onSolo={handleSolo} />

          {/* ─── Footer controls ─── */}

          <div style={{ animation: "fadeIn 0.6s ease both 0.2s", paddingBottom: 6 }}>
            <button
              onClick={handleOff}
              style={{
                width: "100%",
                padding: "14px 0",
                background: !isOn ? "rgba(255,77,28,0.08)" : "transparent",
                border: `1px solid ${!isOn ? "var(--ember)" : "var(--line)"}`,
                borderRadius: 6,
                color: !isOn ? "var(--ember)" : "var(--text-muted)",
                fontFamily: "'Syne', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.18em",
                cursor: "pointer",
                transition: "all 0.3s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {isOn ? "OFF" : "TAP TO WAKE"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              animation: "fadeIn 0.6s ease both 0.3s",
              paddingBottom: 4,
            }}
          >
            <button
              onClick={() => setShowCustomPanel(true)}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "transparent",
                border: "none",
                color: "var(--text-dim)",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.08em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>↑</span>
              CUSTOM
            </button>
            <button
              onClick={() => setShowSchedule(true)}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "transparent",
                border: "1px solid var(--line)",
                borderRadius: 6,
                color: "var(--blueprint)",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              THE DESCENT
            </button>
          </div>
        </div>
      </div>

      {/* ─── Bottom sheets ─── */}
      <CustomPanel
        isOpen={showCustomPanel}
        values={customValues}
        onChange={setCustomValues}
        onApply={handleApplyCustom}
        onClose={() => setShowCustomPanel(false)}
        onLexApplied={() => {
          setShowCustomPanel(false);
          refresh();
        }}
      />
      <ScheduleSheet isOpen={showSchedule} onClose={() => setShowSchedule(false)} />
    </div>
  );
}
