/*
 Re-encode all WAV files in the project to 44.1kHz mono 16-bit PCM using ffmpeg-static + fluent-ffmpeg
 Usage: npm run reencode
*/
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(typeof ffmpegPath === 'string' ? ffmpegPath : String(ffmpegPath || ''));

const ROOT = path.resolve('c:/Users/admin/rapid audio studio/studio audio samples');
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

async function* walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function reencodeWav(src, dst) {
  return new Promise((resolve, reject) => {
    ffmpeg(src)
      .output(dst)
      .audioChannels(1)
      .audioFrequency(44100)
      .audioCodec('pcm_s16le')
      .on('start', (cmd) => {
        console.log(`[ffmpeg] ${cmd}`);
      })
      .on('error', (err) => {
        reject(err);
      })
      .on('end', () => {
        resolve();
      })
      .run();
  });
}

async function main() {
  console.log(`Re-encoding WAVs under: ${ROOT}`);
  let total = 0;
  let ok = 0;
  let fail = 0;

  for await (const file of walk(ROOT)) {
    if (!file.toLowerCase().endsWith('.wav')) continue;
    total++;
    const tmp = path.join(os.tmpdir(), `reenc-${Date.now()}-${path.basename(file)}`);
    try {
      console.log(`Re-encoding -> 44.1kHz mono s16: ${file}`);
      await reencodeWav(file, tmp);
      await fsp.copyFile(tmp, file);
      await fsp.rm(tmp, { force: true });
      ok++;
    } catch (err) {
      console.error(`Failed: ${file}`, err);
      try { await fsp.rm(tmp, { force: true }); } catch {}
      fail++;
    }
  }

  console.log(`Done. Total: ${total}, OK: ${ok}, Failed: ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});