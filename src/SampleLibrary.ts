import * as Tone from "tone";

// Instruments (10 total)
export const INSTRUMENTS = [
  "piano",
  "guitar",
  "kalimba",
  "synth_bass",
  "violin",
  "flute",
  "saxophone",
  "trumpet",
  "organ",
  "marimba",
] as const;
export type InstrumentName = typeof INSTRUMENTS[number];

// Notes: two-octave range, 24 notes total (C2 → B3)
// If you want 3 octaves (C2 → B4), extend this array accordingly.
export const NOTES_24 = [
  "C2","C#2","D2","D#2","E2","F2","F#2","G2","G#2","A2","A#2","B2",
  "C3","C#3","D3","D#3","E3","F3","F#3","G3","G#3","A3","A#3","B3",
] as const;
export type NoteName = typeof NOTES_24[number];

// Default base URLs for jsDelivr CDN (explicit main branch)
const PRIMARY_BASE = "https://cdn.jsdelivr.net/gh/shankarelavarasan/studio-samples@main/";
const SECONDARY_BASE = "https://cdn.jsdelivr.net/gh/elavarasan-shankar/studio-samples@main/";

// Dual base URLs per instrument (primary, fallback)
export const PER_INST_BASES: Record<InstrumentName, string[]> = {
  piano: [PRIMARY_BASE, SECONDARY_BASE],
  guitar: [PRIMARY_BASE, SECONDARY_BASE],
  kalimba: [PRIMARY_BASE, SECONDARY_BASE],
  synth_bass: [PRIMARY_BASE, SECONDARY_BASE],
  violin: [PRIMARY_BASE, SECONDARY_BASE],
  flute: [PRIMARY_BASE, SECONDARY_BASE],
  saxophone: [PRIMARY_BASE, SECONDARY_BASE],
  trumpet: [PRIMARY_BASE, SECONDARY_BASE],
  organ: [PRIMARY_BASE, SECONDARY_BASE],
  marimba: [PRIMARY_BASE, SECONDARY_BASE],
};

// Optional explicit per-instrument URL overrides (primary preference)
export const EXPLICIT_URLS: Partial<Record<InstrumentName, Partial<Record<NoteName, string>>>> = {};
export function setExplicitUrls(inst: InstrumentName, urls: Partial<Record<NoteName, string>>) {
  EXPLICIT_URLS[inst] = urls;
}

// Build candidate URLs for a note (primary first, then fallback)
export function getNoteUrlCandidates(inst: InstrumentName, note: NoteName): string[] {
  const bases = PER_INST_BASES[inst] || [PRIMARY_BASE];
  const explicit = EXPLICIT_URLS[inst]?.[note];
  const candidates: string[] = [];
  if (explicit) {
    candidates.push(explicit);
  }
  for (const base of bases) {
    candidates.push(`${base}${inst}/${encodeURIComponent(note)}.wav`);
  }
  return candidates;
}

// Create a Tone.Sampler without preloading; notes can be added on-demand with fallback
export function makeSampler(_inst: InstrumentName): Tone.Sampler {
  return new Tone.Sampler({
    // no initial urls; we will add per-note dynamically using sampler.add()
    onload: () => {},
    onerror: (err) => console.error(`sampler load error`, err),
  }).toDestination();
}

// HEAD-check a single URL
async function head(url: string): Promise<{ ok: boolean; status: number }>{
  try {
    const res = await fetch(url, { method: "HEAD" });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// Try primary then fallback; returns first working URL and its index (0 = explicit/primary, >0 = fallback)
export async function resolveNoteUrlWithFallback(inst: InstrumentName, note: NoteName): Promise<{ url: string | null; index: number; statuses: number[] }>{
  const candidates = getNoteUrlCandidates(inst, note);
  const statuses: number[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const r = await head(candidates[i]);
    statuses.push(r.status);
    if (r.ok) {
      return { url: candidates[i], index: i, statuses };
    }
  }
  return { url: null, index: -1, statuses };
}

// Validate across all notes for one instrument and report detailed fallback status
export async function validateInstrument(inst: InstrumentName): Promise<{ okCount: number; missingCount: number; lines: string[] }>{
  let okCount = 0;
  const lines: string[] = [];
  for (const note of NOTES_24) {
    const r = await resolveNoteUrlWithFallback(inst, note);
    if (r.url) {
      okCount++;
      const label = r.index === 0 ? "Primary/Explicit OK" : r.index === 1 ? "Primary OK" : "Fallback OK";
      lines.push(`${note}: 200 ${label}`);
    } else {
      const primaryStatus = r.statuses[0] ?? 0;
      const fallbackStatus = r.statuses[1] ?? 0;
      lines.push(`${note}: Primary ${primaryStatus} · Fallback ${fallbackStatus} · NOT OK`);
    }
  }
  return { okCount, missingCount: NOTES_24.length - okCount, lines };
}