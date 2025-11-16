import * as Tone from "tone";
import {
  INSTRUMENTS,
  NOTES_24,
  type InstrumentName,
  type NoteName,
  makeSampler,
  resolveNoteUrlWithFallback,
} from "./SampleLibrary";

// Instruments and notes
const instruments = INSTRUMENTS;
const notes = [...NOTES_24];

// Create Tone Samplers per instrument using SampleLibrary helpers
const samplers: Record<InstrumentName, Tone.Sampler> = {} as any;
for (const inst of instruments) {
  samplers[inst] = makeSampler(inst);
}

// UI Elements
const instrumentSelect = document.querySelector<HTMLSelectElement>("#instrument")!;
const grid = document.querySelector<HTMLDivElement>("#grid")!;
const unlockBtn = document.querySelector<HTMLButtonElement>("#unlock")!;
const stopAllBtn = document.querySelector<HTMLButtonElement>("#stopAll")!;
const statusEl = document.querySelector<HTMLDivElement>("#status");
const reportEl = document.querySelector<HTMLDivElement>("#report");
const downloadJsonBtn = document.querySelector<HTMLButtonElement>("#downloadJson");
const showChecklistBtn = document.querySelector<HTMLButtonElement>("#showChecklist");
const generateWavsBtn = document.querySelector<HTMLButtonElement>("#generateWavs");
const downloadGeneratedBtn = document.querySelector<HTMLButtonElement>("#downloadGenerated");
const ghOwnerInput = document.querySelector<HTMLInputElement>("#ghOwner");
const ghRepoInput = document.querySelector<HTMLInputElement>("#ghRepo");
const ghBranchInput = document.querySelector<HTMLInputElement>("#ghBranch");
const ghTokenInput = document.querySelector<HTMLInputElement>("#ghToken");
const ghInstrumentSelect = document.querySelector<HTMLSelectElement>("#ghInstrument");
const ghFilesInput = document.querySelector<HTMLInputElement>("#ghFiles");
const uploadGithubBtn = document.querySelector<HTMLButtonElement>("#uploadGithub");
statusEl && (statusEl.textContent = "Set instrument to test, press Unlock Audio, then play a note. If samples are not yet pushed to either repo, you will see NOT OK (404)." );

// Fallback synth so users hear sound even if samples aren’t uploaded yet
const fallbackSynth = new Tone.Synth({
  oscillator: { type: "sine" },
  envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.2 },
}).toDestination();

// Cache of per-note availability and resolved URLs
const availability: Record<InstrumentName, Record<string, boolean>> = {} as any;
const resolvedUrl: Record<InstrumentName, Record<string, string>> = {} as any;
for (const inst of instruments) { availability[inst] = {}; resolvedUrl[inst] = {}; }

// Populate instrument dropdown
for (const inst of instruments) {
  const opt = document.createElement("option");
  opt.value = inst;
  opt.textContent = inst.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  instrumentSelect.appendChild(opt);
}

instrumentSelect.value = "piano";

// Build note grid
function renderGrid() {
  grid.innerHTML = "";
  for (const note of notes) {
    const btn = document.createElement("button");
    btn.className = "note-btn";
    btn.textContent = note;
    btn.addEventListener("mousedown", () => play(note));
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); play(note); }, { passive: false });
    btn.addEventListener("mouseup", () => release(note));
    btn.addEventListener("touchend", () => release(note));
    grid.appendChild(btn);
  }
}

renderGrid();

// Audio unlocking for mobile/Chrome policies
unlockBtn.addEventListener("click", async () => {
  await Tone.start();
  console.log("Audio context unlocked");
});

// Ensure the note is available; resolve URL with fallback and add to sampler when found
async function ensureAvailability(inst: InstrumentName, note: NoteName) {
  if (availability[inst][note] === undefined) {
    const r = await resolveNoteUrlWithFallback(inst, note);
    if (r.url) {
      availability[inst][note] = true;
      resolvedUrl[inst][note] = r.url;
      try {
        await (samplers[inst] as any).add(note, r.url);
      } catch (e) {
        console.warn("sampler.add failed, will still try triggerAttack with resolved URL", e);
      }
      const label = r.index === 0 ? "Primary/Explicit OK" : r.index === 1 ? "Primary OK" : "Fallback OK";
      if (statusEl) statusEl.textContent = `Resolved ${inst} ${note}: ${label}`;
    } else {
      availability[inst][note] = false;
      const primaryStatus = r.statuses[0] ?? 0;
      const fallbackStatus = r.statuses[1] ?? 0;
      if (statusEl) statusEl.textContent = `Sample missing ${inst} ${note}: Primary ${primaryStatus} · Fallback ${fallbackStatus}`;
    }
  }
  return !!availability[inst][note];
}

// Playback helpers
async function play(note: string) {
  const inst = instrumentSelect.value as InstrumentName;
  const sampler = samplers[inst];
  // Ensure audio is unlocked
  if ((Tone.context as any).state !== "running") {
    await Tone.start();
  }
  const available = await ensureAvailability(inst, note as NoteName);
  if (available) {
    // triggerAttack using note name; sampler already has the buffer via add()
    sampler.triggerAttack(note);
  } else {
    // Play a short tone so UI is not silent while samples are missing
    fallbackSynth.triggerAttackRelease(note, "8n");
  }
  const btns = Array.from(grid.querySelectorAll<HTMLButtonElement>(".note-btn"));
  const target = btns.find(b => b.textContent === note);
  target?.classList.add("playing");
}

function release(note: string) {
  const inst = instrumentSelect.value as InstrumentName;
  const sampler = samplers[inst];
  // Only release if sample is available (fallback plays short notes)
  if (availability[inst][note]) {
    sampler.triggerRelease(note);
  }
  const btns = Array.from(grid.querySelectorAll<HTMLButtonElement>(".note-btn"));
  const target = btns.find(b => b.textContent === note);
  target?.classList.remove("playing");
}

stopAllBtn.addEventListener("click", () => {
  for (const inst of instruments) {
    samplers[inst].releaseAll?.(0);
  }
});

// Quick demo play after unlock
unlockBtn.addEventListener("click", () => {
  const inst = instrumentSelect.value as InstrumentName;
  samplers[inst].triggerAttackRelease("C3", "1n");
});

// Validate All: scans all notes for the selected instrument and prints a report
const validateAllBtn = document.querySelector<HTMLButtonElement>("#validateAll");
validateAllBtn?.addEventListener("click", async () => {
  const inst = instrumentSelect.value as InstrumentName;
  if (reportEl) reportEl.textContent = `Validating ${inst}…`;
  const lines: string[] = [];
  let okCount = 0;
  for (const note of notes) {
    const r = await resolveNoteUrlWithFallback(inst, note as NoteName);
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
  const header = `Report for ${inst}: ${okCount} OK, ${notes.length - okCount} missing`;
  if (reportEl) reportEl.textContent = `${header}\n` + lines.join("\n");
});

function buildUrlPackJson() {
  return JSON.stringify({
    primaryBase: "https://cdn.jsdelivr.net/gh/shankarelavarasan/studio-samples@main/",
    fallbackBase: "https://cdn.jsdelivr.net/gh/elavarasan-shankar/studio-samples@main/",
    notes,
    instruments: Object.fromEntries(instruments.map(inst => [
      inst,
      { urls: Object.fromEntries(notes.map(n => [n, `${inst}/${n}.wav`])) }
    ]))
  }, null, 2);
}

function download(filename: string, text: string) {
  const a = document.createElement("a");
  a.setAttribute("href", `data:application/json;charset=utf-8,${encodeURIComponent(text)}`);
  a.setAttribute("download", filename);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

downloadJsonBtn?.addEventListener("click", () => {
  const json = buildUrlPackJson();
  download("instrument-pack.json", json);
  statusEl && (statusEl.textContent = "Downloaded instrument-pack.json. Upload WAVs to the specified folders in your GitHub repo.");
});

showChecklistBtn?.addEventListener("click", () => {
  const checklist = [
    "1) Choose your Primary repo: shankarelavarasan/studio-samples@main",
    "2) (Optional) Prepare Fallback repo: elavarasan-shankar/studio-samples@main",
    "3) Create folders: piano, guitar, kalimba, synth_bass, violin, flute, saxophone, trumpet, organ, marimba",
    "4) Upload 24 WAVs per instrument: C2..B3. Use actual filenames with #, e.g., C#2.wav",
    "5) After push, test a few URLs directly in browser (C2, F#2) to confirm 200 OK",
    "6) Back to app: Unlock Audio → Select instrument → Validate All",
    "7) Expect: Primary OK or Fallback OK. If NOT OK, check filename casing, folder names, branch/tag (@main), and CDN cache",
  ].join("\n");
  reportEl && (reportEl.textContent = checklist);
  statusEl && (statusEl.textContent = "Upload checklist shown. Follow steps and push your WAVs.");
});

// Populate upload instrument dropdown
if (ghInstrumentSelect) {
  ghInstrumentSelect.innerHTML = "";
  for (const inst of instruments) {
    const opt = document.createElement("option");
    opt.value = inst;
    opt.textContent = inst;
    ghInstrumentSelect.appendChild(opt);
  }
}

async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  // Convert to base64
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function uploadToGithub(owner: string, repo: string, branch: string, token: string, path: string, contentB64: string) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const body = {
    message: `Add sample ${path}`,
    content: contentB64,
    branch,
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  });
  return res;
}

uploadGithubBtn?.addEventListener("click", async () => {
  if (!ghOwnerInput || !ghRepoInput || !ghBranchInput || !ghTokenInput || !ghInstrumentSelect || !ghFilesInput) {
    statusEl && (statusEl.textContent = "Upload controls not ready.");
    return;
  }
  const owner = ghOwnerInput.value.trim();
  const repo = ghRepoInput.value.trim();
  const branch = ghBranchInput.value.trim() || "main";
  const token = ghTokenInput.value.trim();
  const instrument = ghInstrumentSelect.value.trim();
  const files = ghFilesInput.files;

  if (!owner || !repo || !token || !instrument || !files || files.length === 0) {
    statusEl && (statusEl.textContent = "Fill owner, repo, branch, token, instrument and select WAV files.");
    return;
  }

  statusEl && (statusEl.textContent = `Uploading ${files.length} file(s) to ${owner}/${repo}@${branch}/${instrument}/…`);

  const results: string[] = [];
  for (const file of Array.from(files)) {
    try {
      const base64 = await fileToBase64(file);
      // Use original filename as-is to preserve '#' and casing
      const filename = file.name;
      const path = `${instrument}/${filename}`;
      const res = await uploadToGithub(owner, repo, branch, token, path, base64);
      if (res.ok) {
        const json = await res.json();
        results.push(`OK: ${filename} → ${json.content?.path || path}`);
      } else {
        const text = await res.text();
        results.push(`ERR ${res.status}: ${filename} → ${text}`);
      }
    } catch (e: any) {
      results.push(`ERR: ${file.name} → ${e?.message || e}`);
    }
  }

  const header = `Upload complete: ${results.filter(r => r.startsWith('OK')).length} OK, ${results.filter(r => r.startsWith('ERR')).length} ERR`;
  reportEl && (reportEl.textContent = `${header}\n` + results.join("\n"));
  statusEl && (statusEl.textContent = "Upload finished. Now Validate All after jsDelivr refresh.");
});

// Generate short WAV buffers for all notes using Tone.js Offline rendering
async function generateTestWavs(): Promise<Record<string, Blob>> {
  const result: Record<string, Blob> = {};
  for (const note of notes) {
    // Render 1 second per note using a basic synth
    const buffer = await Tone.Offline(async () => {
      const synth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 },
      }).toDestination();
      synth.triggerAttackRelease(note, 0.8, 0);
    }, 1);
    // Convert AudioBuffer to WAV Blob
    const wavBlob = audioBufferToWavBlob(buffer);
    result[note] = wavBlob;
  }
  return result;
}

function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [] as Float32Array[];
  let offset = 0;

  // RIFF header
  writeString(view, offset, "RIFF"); offset += 4;
  view.setUint32(offset, length - 8, true); offset += 4;
  writeString(view, offset, "WAVE"); offset += 4;
  writeString(view, offset, "fmt "); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // PCM
  view.setUint16(offset, 1, true); offset += 2; // format
  view.setUint16(offset, numOfChan, true); offset += 2;
  view.setUint32(offset, audioBuffer.sampleRate, true); offset += 4;
  view.setUint32(offset, audioBuffer.sampleRate * numOfChan * 2, true); offset += 4;
  view.setUint16(offset, numOfChan * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString(view, offset, "data"); offset += 4;
  view.setUint32(offset, audioBuffer.length * numOfChan * 2, true); offset += 4;

  // Interleave channels
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }
  let pos = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numOfChan; ch++) {
      let sample = channels[ch][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadBlobToGitHub({ owner, repo, branch, token, path, contentBase64 }:{ owner:string; repo:string; branch:string; token:string; path:string; contentBase64:string; }){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `Add ${path}`,
      content: contentBase64,
      branch,
    }),
  });
  const ok = res.ok;
  const status = res.status;
  const text = await res.text();
  return { ok, status, text };
}

generateWavsBtn?.addEventListener("click", async () => {
  statusEl && (statusEl.textContent = "Generating 24 test WAVs…");
  try {
    const blobs = await generateTestWavs();
    (window as any).__generatedWavs = blobs;
    statusEl && (statusEl.textContent = "Generated 24 test WAVs (sine). You can upload them or play after pushing.");
    reportEl && (reportEl.textContent = "Generated: " + Object.keys(blobs).join(", "));
  } catch (e:any) {
    statusEl && (statusEl.textContent = "Failed to generate WAVs: " + e?.message);
  }
});
const downloadGeneratedFilesBtn = document.querySelector<HTMLButtonElement>("#downloadGeneratedFiles");
downloadGeneratedFilesBtn?.addEventListener("click", async () => {
  try {
    const blobs: Record<string, Blob> = (window as any).__generatedWavs || {};
    const notesPresent = Object.keys(blobs);
    if (notesPresent.length === 0) {
      statusEl && (statusEl.textContent = "No generated WAVs found. Click ‘Generate 24 Test WAVs’ first.");
      return;
    }
    statusEl && (statusEl.textContent = `Downloading ${notesPresent.length} WAV files…`);
    for (const note of notesPresent) {
      const blob = blobs[note];
      downloadBlob(`piano/${note}.wav`, blob);
      await new Promise(r => setTimeout(r, 25)); // small delay to let browser process multiple downloads
    }
    statusEl && (statusEl.textContent = "Downloaded all WAV files. If your browser blocked popups, allow downloads.");
  } catch (e:any) {
    statusEl && (statusEl.textContent = "Failed to download files: " + (e?.message || e));
  }
});

downloadGeneratedBtn?.addEventListener("click", async () => {
  try {
    const blobs: Record<string, Blob> = (window as any).__generatedWavs || {};
    const notesPresent = Object.keys(blobs);
    if (notesPresent.length === 0) {
      statusEl && (statusEl.textContent = "No generated WAVs found. Click ‘Generate 24 Test WAVs’ first.");
      return;
    }
    statusEl && (statusEl.textContent = `Preparing ZIP for ${notesPresent.length} WAVs…`);
    const files = [] as { name: string; data: Uint8Array }[];
    for (const note of notesPresent) {
      const blob = blobs[note];
      const data = await blobToUint8Array(blob);
      files.push({ name: `piano/${note}.wav`, data });
    }
    const zipBytes = buildZip(files);
    const zipBlob = new Blob([zipBytes], { type: "application/zip" });
    downloadBlob("piano-24-wavs.zip", zipBlob);
    statusEl && (statusEl.textContent = "Downloaded piano-24-wavs.zip. Unzip into your piano folder and push with Bash.");
  } catch (e:any) {
    statusEl && (statusEl.textContent = "Failed to prepare ZIP: " + (e?.message || e));
  }
});

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 0);
}