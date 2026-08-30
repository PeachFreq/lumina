/**
 * LUMINA API Client — v2 contract (spec §6).
 * All paths under /api; the UI must degrade gracefully when the backend is down.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api";

/* ─── Types ─── */

export interface Preset {
  id: string;
  name: string;
  description: string;
  accent: string;
}

export interface CustomValues {
  hue: number;
  sat: number;
  bri: number;
  kelvin: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  kind: string;
  role?: string;
  online: boolean;
  enabled: boolean;
  solo?: boolean;
}

export interface WakeConfig {
  wake_target: string; // "05:50"
  wake_current: string; // "06:55"
  eta_minutes_per_day: number;
}

export interface Anchor {
  time: string; // "20:30"
  anchor: string; // "sundown"
  preset?: string | null;
  bri?: number;
  kelvin?: number;
}

export interface EngineState {
  armed: boolean;
  phase: "idle" | "descending" | "ascending" | "excursion" | string;
  next_anchor?: string | null;
  step?: number;
  total_steps?: number;
  eta?: number;
  bri_from?: number;
  bri_to?: number;
  wake?: WakeConfig;
}

export interface BulbState {
  power: boolean;
  mode: "preset" | "custom" | "off" | string;
  active_preset: string | null;
  custom: CustomValues | null;
  engine?: EngineState | null;
  devices?: DeviceInfo[] | null;
}

export interface MutationResult extends BulbState {
  ok?: boolean;
}

export interface Schedule {
  anchors: Anchor[];
  wake: WakeConfig;
  armed: boolean;
}

export interface LexResult {
  ok?: boolean;
  name?: string;
  applied?: boolean;
  state?: BulbState;
}

/* ─── Core request helper ─── */

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `API error ${res.status}`);
  }
  return res.json();
}

/* ─── v1-compatible endpoints ─── */

export async function getPresets(): Promise<Preset[]> {
  const data = await request<{ presets: Preset[] }>("/presets");
  return data.presets;
}

export async function getState(): Promise<BulbState> {
  return request<BulbState>("/state");
}

export async function activatePreset(name: string): Promise<MutationResult> {
  return request<MutationResult>(`/preset/${encodeURIComponent(name)}`, {
    method: "POST",
  });
}

export async function togglePower(): Promise<MutationResult> {
  return request<MutationResult>("/off", { method: "POST" });
}

export async function setCustom(params: CustomValues): Promise<MutationResult> {
  return request<MutationResult>("/custom", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/* ─── v2 endpoints ─── */

export async function postLex(utterance: string): Promise<LexResult> {
  return request<LexResult>("/lex", {
    method: "POST",
    body: JSON.stringify({ utterance }),
  });
}

export async function getSchedule(): Promise<Schedule> {
  return request<Schedule>("/schedule");
}

export async function putSchedule(schedule: Schedule): Promise<Schedule> {
  return request<Schedule>("/schedule", {
    method: "PUT",
    body: JSON.stringify(schedule),
  });
}

export async function discoverDevices(): Promise<{ devices: DeviceInfo[] }> {
  return request<{ devices: DeviceInfo[] }>("/devices/discover", { method: "POST" });
}

export async function setDevicePower(id: string, on: boolean): Promise<MutationResult> {
  return request<MutationResult>(`/device/${encodeURIComponent(id)}/power`, {
    method: "POST",
    body: JSON.stringify({ on }),
  });
}

export async function soloDevice(id: string): Promise<MutationResult> {
  return request<MutationResult>(`/device/${encodeURIComponent(id)}/solo`, {
    method: "POST",
  });
}

/* ─── Mock fallbacks (backend unreachable) ─── */

export const MOCK_DEVICES: DeviceInfo[] = [
  { id: "lifx-bulb", name: "LIFX BULB", kind: "lifx", role: "key", online: true, enabled: true },
  { id: "govee-table", name: "GOVEE TABLE", kind: "govee", role: "accent", online: false, enabled: true },
  { id: "govee-floor", name: "GOVEE FLOOR", kind: "govee", role: "fill", online: false, enabled: true },
];

export const DEFAULT_ANCHORS: Anchor[] = [
  { time: "21:00", anchor: "sundown", preset: "relax", bri: 35, kelvin: 2500 },
  { time: "21:30", anchor: "honey", preset: "honey", bri: 25, kelvin: 2200 },
  { time: "21:50", anchor: "fade", preset: null, bri: 10, kelvin: 2000 },
  { time: "22:00", anchor: "minimum", preset: "sleep", bri: 0, kelvin: 2000 },
];

export const DEFAULT_WAKE: WakeConfig = {
  wake_target: "05:50",
  wake_current: "06:55",
  eta_minutes_per_day: 0,
};

export const DEFAULT_SCHEDULE: Schedule = {
  anchors: DEFAULT_ANCHORS,
  wake: DEFAULT_WAKE,
  armed: false,
};
