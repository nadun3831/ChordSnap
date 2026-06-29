import fs from 'fs';
import { ChordDetectionEngine, ChordEvent, AnalysisResult } from './ChordDetectionEngine';

/**
 * RealChordEngine — Beat-aligned chord detection with KEY DETECTION
 *
 * Pipeline:
 *   1. Decode audio to mono PCM
 *   2. Detect tempo (BPM) via onset strength + autocorrelation
 *   3. Build beat grid — exact timestamps where each beat falls
 *   4. Extract chroma (12-bin pitch class energy) per beat
 *   5. DETECT KEY from overall chroma distribution (Krumhansl-Kessler)
 *   6. Filter chord templates to only key-compatible chords
 *   7. Match each bar's chroma against filtered templates
 *   8. Merge consecutive identical chords into timed events
 */

// ─────────────────────────────────────────────
// Note names & constants
// ─────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─────────────────────────────────────────────
// Key Detection — Krumhansl-Kessler key profiles
// These represent how strongly each pitch class correlates
// with a given key. Used to detect the song's key from
// the overall chroma distribution.
// ─────────────────────────────────────────────

// Major key profile (rooted at C)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
// Minor key profile (rooted at C)
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

interface KeyResult {
  root: number;       // 0=C, 1=C#, ..., 11=B
  mode: 'major' | 'minor';
  name: string;       // e.g. "Em", "C"
  correlation: number;
}

/**
 * Detect key using Krumhansl-Kessler algorithm.
 * Correlates overall chroma distribution against rotated key profiles.
 */
function detectKey(overallChroma: number[]): KeyResult {
  // Normalize chroma
  const sum = overallChroma.reduce((s, v) => s + v, 0);
  const chroma = sum > 0 ? overallChroma.map(v => v / sum) : new Array(12).fill(0);

  let bestRoot = 0;
  let bestMode: 'major' | 'minor' = 'major';
  let bestCorr = -Infinity;

  for (let root = 0; root < 12; root++) {
    // Rotate the profile to this root
    for (const [mode, profile] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]] as const) {
      const rotated: number[] = new Array(12);
      for (let i = 0; i < 12; i++) {
        rotated[(i + root) % 12] = profile[i];
      }

      // Pearson correlation between chroma and rotated profile
      const meanC = chroma.reduce((s, v) => s + v, 0) / 12;
      const meanP = rotated.reduce((s, v) => s + v, 0) / 12;

      let num = 0, denC = 0, denP = 0;
      for (let i = 0; i < 12; i++) {
        const dc = chroma[i] - meanC;
        const dp = rotated[i] - meanP;
        num += dc * dp;
        denC += dc * dc;
        denP += dp * dp;
      }

      const corr = (denC > 0 && denP > 0) ? num / Math.sqrt(denC * denP) : 0;

      if (corr > bestCorr) {
        bestCorr = corr;
        bestRoot = root;
        bestMode = mode;
      }
    }
  }

  const name = bestMode === 'minor'
    ? `${NOTE_NAMES[bestRoot]}m`
    : NOTE_NAMES[bestRoot];

  return { root: bestRoot, mode: bestMode, name, correlation: bestCorr };
}

// ─────────────────────────────────────────────
// Diatonic chord sets per key
// Given a key root and mode, return the set of chord labels
// that are diatonic (belong to that key), plus common borrowed chords.
// ─────────────────────────────────────────────

/**
 * Build the set of chords that are valid for a given key.
 *
 * Major key (e.g. C major): I, ii, iii, IV, V, vi  + V7
 *   C: C, Dm, Em, F, G, Am + G7
 *
 * Minor key (e.g. A minor): i, ii°→ii, III, iv, v/V, VI, VII + V7
 *   Am: Am, Bm/Bdim→Bm, C, Dm, Em/E, F, G + E7
 */
function getDiatonicChords(root: number, mode: 'major' | 'minor'): Set<string> {
  const chords = new Set<string>();
  const r = (n: number) => NOTE_NAMES[(root + n) % 12];

  if (mode === 'major') {
    // I (major)
    chords.add(r(0));
    // ii (minor)
    chords.add(`${r(2)}m`);
    // iii (minor)
    chords.add(`${r(4)}m`);
    // IV (major)
    chords.add(r(5));
    // V (major)
    chords.add(r(7));
    // vi (minor)
    chords.add(`${r(9)}m`);
    // V7 (dominant 7th) — very common
    chords.add(`${r(7)}7`);
    // I7 — common passing chord
    chords.add(`${r(0)}7`);
    // IV as minor (borrowed from parallel minor) — occasional
    chords.add(`${r(5)}m`);
    // bVII (borrowed) — common in pop
    chords.add(r(10));
  } else {
    // i (minor)
    chords.add(`${r(0)}m`);
    // ii° — we approximate as ii minor
    chords.add(`${r(2)}m`);
    // III (major — relative major)
    chords.add(r(3));
    // iv (minor)
    chords.add(`${r(5)}m`);
    // v (minor — natural minor)
    chords.add(`${r(7)}m`);
    // V (major — harmonic minor, very common)
    chords.add(r(7));
    // VI (major)
    chords.add(r(8));
    // VII (major — natural minor)
    chords.add(r(10));
    // V7 (dominant 7th — very common in minor)
    chords.add(`${r(7)}7`);
    // i as major (picardy third, passing)
    chords.add(r(0));
    // iv as major — sometimes used
    chords.add(r(5));
    // II (borrowed, Neapolitan area)
    chords.add(r(2));
  }

  return chords;
}

// ─────────────────────────────────────────────
// Chord Templates — weighted profiles
// Indices: [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
// ─────────────────────────────────────────────

const CHORD_TYPES: Record<string, number[]> = {
  'maj': [1.5, 0, 0, 0, 1.0, 0, 0, 1.2, 0, 0, 0, 0],
  'm':   [1.5, 0, 0, 1.0, 0, 0, 0, 1.2, 0, 0, 0, 0],
  '7':   [1.5, 0, 0, 0, 1.0, 0, 0, 1.2, 0, 0, 0.7, 0],
  'm7':  [1.5, 0, 0, 1.0, 0, 0, 0, 1.2, 0, 0, 0.7, 0],
};

interface ChordTemplate {
  label: string;
  rootNote: number;
  profile: number[];
}

function buildAllTemplates(): ChordTemplate[] {
  const templates: ChordTemplate[] = [];
  for (const [typeName, baseProfile] of Object.entries(CHORD_TYPES)) {
    for (let root = 0; root < 12; root++) {
      const rotated = new Array(12);
      for (let i = 0; i < 12; i++) {
        rotated[(i + root) % 12] = baseProfile[i];
      }
      const label = typeName === 'maj'
        ? NOTE_NAMES[root]
        : `${NOTE_NAMES[root]}${typeName}`;
      templates.push({ label, rootNote: root, profile: rotated });
    }
  }
  return templates;
}

const ALL_TEMPLATES = buildAllTemplates();

// ─────────────────────────────────────────────
// Similarity & matching
// ─────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function normalizeChroma(chroma: number[]): number[] {
  const max = Math.max(...chroma);
  if (max < 0.001) return new Array(12).fill(0);
  return chroma.map(v => v / max);
}

/**
 * Match chroma against ONLY the chords allowed by the key.
 * This is the key improvement — we don't consider G#m in a song in Em, etc.
 */
function matchChordInKey(
  chroma: number[],
  allowedChords: Set<string>,
): { label: string; confidence: number } {
  const normalized = normalizeChroma(chroma);
  let bestLabel = 'N';
  let bestScore = -1;

  // Filter templates to only allowed chords
  for (const tmpl of ALL_TEMPLATES) {
    if (!allowedChords.has(tmpl.label)) continue;

    const score = cosineSimilarity(normalized, tmpl.profile);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = tmpl.label;
    }
  }

  return { label: bestLabel, confidence: Math.max(0, Math.min(1, bestScore)) };
}

// ─────────────────────────────────────────────
// Beat detection
// ─────────────────────────────────────────────

const FRAME_SIZE = 1024;
const HOP = 512;
const MIN_BPM = 40;
const MAX_BPM = 220;
const MIN_CONFIDENCE = 0.55;

function computeOnsetEnvelope(samples: Float32Array, sampleRate: number): { envelope: number[]; times: number[] } {
  const envelope: number[] = [];
  const times: number[] = [];
  
  const frameSize = 2048;
  const hop = 512;

  let prevEnergy = 0;

  // Start offset at 1 to allow high-pass difference
  for (let offset = 1; offset + frameSize <= samples.length; offset += hop) {
    let energy = 0;
    for (let i = 0; i < frameSize; i++) {
      // First-order difference acts as a simple high-pass filter
      const diffSample = samples[offset + i] - samples[offset + i - 1];
      energy += diffSample * diffSample;
    }
    energy = Math.sqrt(energy / frameSize); // RMS Energy of high-passed frame

    // Log compression
    const logEnergy = Math.log1p(energy * 1000);
    const logPrevEnergy = Math.log1p(prevEnergy * 1000);

    // Onset strength is the difference
    const diff = logEnergy - logPrevEnergy;
    envelope.push(diff > 0 ? diff : 0);
    times.push((offset + frameSize / 2) / sampleRate);

    prevEnergy = energy;
  }

  // Smooth the envelope with a moving average filter (~50ms window) to reduce noise
  const smoothed: number[] = [];
  const windowSize = 5;
  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    let count = 0;
    for (let w = -Math.floor(windowSize / 2); w <= Math.floor(windowSize / 2); w++) {
      const idx = i + w;
      if (idx >= 0 && idx < envelope.length) {
        sum += envelope[idx];
        count++;
      }
    }
    smoothed.push(sum / count);
  }

  return { envelope: smoothed, times };
}

function detectBPM(envelope: number[], sampleRate: number): number {
  const hopDuration = HOP / sampleRate;
  const minLag = Math.floor(60 / (MAX_BPM * hopDuration));
  const maxLag = Math.floor(60 / (MIN_BPM * hopDuration));
  const N = envelope.length;

  const mean = envelope.reduce((s, v) => s + v, 0) / N;
  const normed = envelope.map(v => v - mean);

  // 1. Calculate autocorrelation for all valid lags
  const corrArray = new Array(maxLag + 2).fill(0);
  for (let lag = minLag; lag <= Math.min(maxLag, N - 1); lag++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < N - lag; i++) {
      corr += normed[i] * normed[i + lag];
      count++;
    }
    corrArray[lag] = count > 0 ? corr / count : 0;
  }

  // 2. Find local peaks (local maxima) in the autocorrelation curve with quadratic interpolation
  interface AutocorrPeak {
    lag: number;
    corr: number;
    exactLag: number;
  }
  const peaks: AutocorrPeak[] = [];
  for (let lag = minLag + 1; lag < Math.min(maxLag, N - 1); lag++) {
    if (corrArray[lag] > corrArray[lag - 1] && corrArray[lag] > corrArray[lag + 1]) {
      const y0 = corrArray[lag - 1];
      const y1 = corrArray[lag];
      const y2 = corrArray[lag + 1];

      let p = 0;
      const denom = 2 * (y0 - 2 * y1 + y2);
      if (Math.abs(denom) > 1e-9) {
        p = (y0 - y2) / denom;
      }
      const exactLag = lag + p;
      peaks.push({ lag, corr: y1, exactLag });
    }
  }

  // Fallback if no local peaks found
  if (peaks.length === 0) {
    let bestLag = minLag;
    let bestCorr = -Infinity;
    for (let lag = minLag; lag <= Math.min(maxLag, N - 1); lag++) {
      if (corrArray[lag] > bestCorr) {
        bestCorr = corrArray[lag];
        bestLag = lag;
      }
    }
    const bpm = 60 / (bestLag * hopDuration);
    return Math.round(bpm * 100) / 100;
  }

  // Sort peaks by correlation strength
  peaks.sort((a, b) => b.corr - a.corr);
  const maxCorr = peaks[0].corr;

  console.log('   🔍 Strong Autocorrelation Peaks:');
  for (const p of peaks.slice(0, 5)) {
    const bpmVal = 60 / (p.exactLag * hopDuration);
    console.log(`      BPM ${bpmVal.toFixed(2)} (Corr: ${p.corr.toFixed(5)} | Ratio: ${(p.corr / maxCorr).toFixed(2)})`);
  }

  // Keep strong candidate peaks (at least 35% of the maximum correlation to allow octave checking)
  const strongPeaks = peaks.filter(p => p.corr >= maxCorr * 0.35);

  // 3. Harmonic / Octave Correction:
  // Prefer faster candidate tempos if they have a harmonic relationship with a slower strong candidate
  let bestPeak = strongPeaks[0];

  for (const p of strongPeaks) {
    for (const slower of strongPeaks) {
      if (slower.exactLag > p.exactLag) {
        const ratio = slower.exactLag / p.exactLag;
        const isHarmonic = 
          Math.abs(ratio - 1.5) < 0.1 ||
          Math.abs(ratio - 2.0) < 0.1 ||
          Math.abs(ratio - 3.0) < 0.1;

        const bpmVal = 60 / (p.exactLag * hopDuration);
        if (isHarmonic && bpmVal >= 65 && bpmVal <= 180) {
          if (p.exactLag < bestPeak.exactLag) {
            bestPeak = p;
          }
        }
      }
    }
  }

  const bpm = 60 / (bestPeak.exactLag * hopDuration);
  return Math.round(bpm * 100) / 100;
}

function buildBeatGrid(
  envelope: number[],
  times: number[],
  bpm: number,
  totalDuration: number,
): number[] {
  const beatInterval = 60 / bpm;
  const maxOnset = Math.max(...envelope);
  const threshold = maxOnset * 0.15;

  // 1. Find all candidate onset peaks
  interface Peak {
    time: number;
    value: number;
  }
  const peaks: Peak[] = [];
  for (let i = 1; i < envelope.length - 1; i++) {
    if (envelope[i] > envelope[i - 1] && envelope[i] > envelope[i + 1] && envelope[i] > threshold) {
      peaks.push({ time: times[i], value: envelope[i] });
    }
  }

  // 2. Find the first strong beat offset in the first 15 seconds
  let firstBeatOffset = 0;
  const earlySection = Math.min(15, totalDuration);
  const earlyPeaks = peaks.filter(p => p.time < earlySection);
  if (earlyPeaks.length > 0) {
    earlyPeaks.sort((a, b) => b.value - a.value);
    firstBeatOffset = earlyPeaks[0].time;
  } else {
    // Fallback to first above threshold
    for (let i = 0; i < envelope.length; i++) {
      if (envelope[i] > threshold) {
        firstBeatOffset = times[i];
        break;
      }
    }
  }

  // 3. Project the grid backward to the start of the song
  let startOffset = firstBeatOffset;
  while (startOffset - beatInterval >= 0) {
    startOffset -= beatInterval;
  }

  // 4. Generate the constant-tempo beat grid
  const beats: number[] = [];
  let currentTime = startOffset;
  while (currentTime < totalDuration) {
    beats.push(Math.round(currentTime * 100) / 100);
    currentTime += beatInterval;
  }

  return beats;
}

// ─────────────────────────────────────────────
// Segment-based Chroma Extraction
// ─────────────────────────────────────────────

function extractAverageChroma(
  samples: Float32Array,
  sampleRate: number,
  startTime: number,
  endTime: number,
  Meyda: any,
): number[] {
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.min(samples.length, Math.floor(endTime * sampleRate));
  
  if (endSample - startSample < 1024) {
    return new Array(12).fill(0);
  }

  const segment = samples.slice(startSample, endSample);
  const frameSize = 4096;
  const hop = 2048;
  
  Meyda.bufferSize = frameSize;
  Meyda.sampleRate = sampleRate;
  
  const sumChroma = new Array(12).fill(0);
  let count = 0;

  for (let offset = 0; offset + frameSize <= segment.length; offset += hop) {
    const frame = segment.slice(offset, offset + frameSize);
    
    // Calculate energy to discard silent frames
    let energy = 0;
    for (let i = 0; i < frame.length; i++) {
      energy += frame[i] * frame[i];
    }
    energy /= frame.length;
    if (energy < 1e-6) continue;

    try {
      const chroma = Meyda.extract('chroma', frame);
      if (chroma && chroma.length === 12) {
        for (let k = 0; k < 12; k++) {
          sumChroma[k] += chroma[k];
        }
        count++;
      }
    } catch {
      // Ignore frame extraction error
    }
  }

  if (count === 0) return new Array(12).fill(0);
  return sumChroma.map(val => val / count);
}

// ─────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────

export class RealChordEngine implements ChordDetectionEngine {
  readonly name = 'RealChordEngine (Beat + Key Detection)';

  async analyze(audioPath: string): Promise<AnalysisResult> {
    console.log(`🎵 RealChordEngine: Analyzing ${audioPath}`);
    const startTime = Date.now();

    // ── 1. Read & decode audio ──
    const fileBuffer = fs.readFileSync(audioPath);
    const { default: decode } = await import('audio-decode');
    const audioData = await decode(fileBuffer);

    const sampleRate = audioData.sampleRate;
    let samples: Float32Array;
    if (audioData.channelData.length > 1) {
      const left = audioData.channelData[0];
      const right = audioData.channelData[1];
      samples = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        samples[i] = (left[i] + right[i]) / 2;
      }
    } else {
      samples = audioData.channelData[0];
    }

    const totalDuration = samples.length / sampleRate;
    console.log(`   Decoded: ${totalDuration.toFixed(1)}s, ${sampleRate}Hz`);

    // ── 2. Detect tempo (BPM) ──
    const { envelope, times: onsetTimes } = computeOnsetEnvelope(samples, sampleRate);
    const bpm = detectBPM(envelope, sampleRate);
    console.log(`   🥁 Detected BPM: ${bpm}`);

    // ── 3. Build beat grid ──
    const beats = buildBeatGrid(envelope, onsetTimes, bpm, totalDuration);
    console.log(`   🎯 Beat grid: ${beats.length} beats (interval: ${(60 / bpm).toFixed(3)}s)`);

    // ── 4. Extract chroma per bar & half-bar ──
    const Meyda = require('meyda');
    const BEATS_PER_BAR = 4;
    
    interface BarChroma {
      barIndex: number;
      startTime: number;
      endTime: number;
      beats: number[];
      chromaWhole: number[];
      chromaFirstHalf: number[];
      chromaSecondHalf: number[];
    }

    const barChromas: BarChroma[] = [];
    const overallChroma = new Array(12).fill(0);

    for (let i = 0; i < beats.length; i += BEATS_PER_BAR) {
      const barBeats = beats.slice(i, i + BEATS_PER_BAR);
      if (barBeats.length === 0) continue;

      const startTime = barBeats[0];
      const endTime = (i + BEATS_PER_BAR < beats.length) ? beats[i + BEATS_PER_BAR] : totalDuration;
      
      // Determine half-bar middle timestamp
      let midTime = (startTime + endTime) / 2;
      if (barBeats.length >= 3) {
        midTime = barBeats[2];
      }

      // Average chroma over the whole bar and each half-bar segment
      const chromaWhole = extractAverageChroma(samples, sampleRate, startTime, endTime, Meyda);
      const chromaFirstHalf = extractAverageChroma(samples, sampleRate, startTime, midTime, Meyda);
      const chromaSecondHalf = extractAverageChroma(samples, sampleRate, midTime, endTime, Meyda);

      barChromas.push({
        barIndex: i / BEATS_PER_BAR,
        startTime,
        endTime,
        beats: barBeats,
        chromaWhole,
        chromaFirstHalf,
        chromaSecondHalf,
      });

      // Accumulate for overall key detection
      for (let k = 0; k < 12; k++) {
        overallChroma[k] += chromaWhole[k];
      }
    }

    console.log(`   Processed chroma for ${barChromas.length} bars`);

    // ── 5. DETECT KEY ──
    const key = detectKey(overallChroma);
    console.log(`   🎼 Detected Key: ${key.name} (correlation: ${key.correlation.toFixed(3)})`);

    // ── 6. Build allowed chord set ──
    const allowedChords = getDiatonicChords(key.root, key.mode);
    console.log(`   🎹 Allowed chords: ${Array.from(allowedChords).join(', ')}`);

    // ── 7. Detect and apply chords to bars/half-bars ──
    const events: ChordEvent[] = [];
    let eventIndex = 0;

    for (const bc of barChromas) {
      const matchWhole = matchChordInKey(bc.chromaWhole, allowedChords);
      const matchFirst = matchChordInKey(bc.chromaFirstHalf, allowedChords);
      const matchSecond = matchChordInKey(bc.chromaSecondHalf, allowedChords);

      // Split bar if the halves differ, have sufficient confidence, and are recognized
      const shouldSplit =
        matchFirst.label !== matchSecond.label &&
        matchFirst.label !== 'N' &&
        matchSecond.label !== 'N' &&
        matchFirst.confidence >= MIN_CONFIDENCE &&
        matchSecond.confidence >= MIN_CONFIDENCE;

      if (shouldSplit) {
        events.push({
          id: `beat-${eventIndex}`,
          time_seconds: Math.round(bc.startTime * 100) / 100,
          chord_label: matchFirst.label,
          confidence: Math.round(matchFirst.confidence * 100) / 100,
        });
        eventIndex++;

        const midTime = bc.beats.length >= 3 ? bc.beats[2] : (bc.startTime + bc.endTime) / 2;
        events.push({
          id: `beat-${eventIndex}`,
          time_seconds: Math.round(midTime * 100) / 100,
          chord_label: matchSecond.label,
          confidence: Math.round(matchSecond.confidence * 100) / 100,
        });
        eventIndex++;
      } else {
        let label = matchWhole.label;
        if (label === 'N') {
          label = key.name; // Fallback to key root
        }
        events.push({
          id: `beat-${eventIndex}`,
          time_seconds: Math.round(bc.startTime * 100) / 100,
          chord_label: label,
          confidence: Math.round(matchWhole.confidence * 100) / 100,
        });
        eventIndex++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ RealChordEngine: ${events.length} chords, Key=${key.name}, BPM=${bpm}, in ${elapsed}s`);

    return { chords: events, bpm, key: key.name };
  }
}
