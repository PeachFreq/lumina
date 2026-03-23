/**
 * LUMINA API Client
 * Communicates with the FastAPI backend on port 8766.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8766";

export interface Preset {
  id: string;
  name: string;
  description: string;
  accent: string;
}

export interface BulbState {
  power: boolean;
  mode: "preset" | "custom" | "off";
  active_preset: string | null;
  custom: { hue: number; sat: number; bri: number; kelvin: number } | null;
}

export interface MutationResult extends BulbState {
  ok: boolean;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

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

export async function setCustom(params: {
  hue: number;
  sat: number;
  bri: number;
  kelvin: number;
}): Promise<MutationResult> {
  return request<MutationResult>("/custom", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
