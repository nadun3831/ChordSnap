import fs from 'fs';
import { ChordDetectionEngine, ChordEvent } from './ChordDetectionEngine';

/**
 * RealChordEngine — Actual audio analysis using Meyda chroma features
 * and chord template matching.
 *
 * Pipeline:
 *   1. Decode audio file to mono PCM (Float32Array)
 *   2. Process in overlapping frames (bufferSize=4096, hop=2048)
 *   3. Extract chroma (12-bin pitch class energy) per frame via Meyda
 *   4. Match each chroma vector against chord templates using cosine similarity
 *   5. Smooth results over a window to reduce noise
 *   6. Merge consecutive identical chords into timed events
 */

// ─────────────────────────────────────────────
// Chord Templates — binary profiles for each chord type, rooted at C (index 0)
// Indices: [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
// ─────────────────────────────────────────────

const CHORD_TYPES: Record<string, number[]> = {
  // Major triad: root, M3, P5
  'maj': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  // Minor triad: root, m3, P5
  'm':   [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  // Dominant 7th: root, M3, P5, m7
  '7':   [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  // Major 7th: root, M3, P5, M7
  'maj7':[1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
  // Minor 7th: root, m3, P5, m7
  'm7':  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
  // Diminished: root, m3, dim5
  'dim': [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  // Augmented: root, M3, aug5
  'aug': [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  // Suspended 4th: root, P4, P5
  'sus4':[1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
  // Suspended 2nd: root, M2, P5
  'sus2':[1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Pre-compute all 108 chord templates (9 types × 12 roots)
interface ChordTemplate {
  label: string;
  profile: number[];
}

function buildAllTemplates(): ChordTemplate[] {
  const templates: ChordTemplate[] = [];
  for (const [typeName, baseProfile] of Object.entries(CHORD_TYPES)) {
    for (let root = 0; root < 12; root++) {
      // Rotate the profile by `root` semitones
      const profile = new Array(12);
      for (let i = 0; i < 12; i++) {
        profile[(i + root) % 12] = baseProfile[i];
      }
      const label = typeName === 'maj'
        ? NOTE_NAMES[root]
        : `${NOTE_NAMES[root]}${typeName}`;
      templates.push({ label, profile });
    }
  }
  return templates;
}

const ALL_TEMPLATES = buildAllTemplates();

// ─────────────────────────────────────────────
// Similarity & matching helpers
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

function matchChord(chroma: number[]): { label: string; confidence: number } {
  let bestLabel = 'N'; // N = no chord / silence
  let bestScore = -1;

  for (const tmpl of ALL_TEMPLATES) {
    const score = cosineSimilarity(chroma, tmpl.profile);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = tmpl.label;
    }
  }

  return { label: bestLabel, confidence: bestScore };
}

// ─────────────────────────────────────────────
// Engine implementation
// ─────────────────────────────────────────────

const BUFFER_SIZE = 4096;   // FFT window size (power of 2)
const HOP_SIZE = 2048;      // Hop between frames
const SMOOTHING_WINDOW = 8; // Median filter width (in frames) to stabilize detections
const MIN_CONFIDENCE = 0.65; // Below this → "N" (no chord)
const MIN_CHORD_DURATION = 0.4; // Minimum seconds for a chord event

export class RealChordEngine implements ChordDetectionEngine {
  readonly name = 'RealChordEngine (Meyda Chroma)';

  async analyze(audioPath: string): Promise<ChordEvent[]> {
    console.log(`🎵 RealChordEngine: Analyzing ${audioPath}`);
    const startTime = Date.now();

    // ── 1. Read & decode audio ──
    const fileBuffer = fs.readFileSync(audioPath);
    // audio-decode is ESM-only, use dynamic import
    const { default: decode } = await import('audio-decode');
    const audioData = await decode(fileBuffer);

    const sampleRate = audioData.sampleRate;
    // Mix to mono if stereo
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
    console.log(`   Decoded: ${totalDuration.toFixed(1)}s, ${sampleRate}Hz, ${samples.length} samples`);

    // ── 2. Extract chroma features per frame ──
    const Meyda = require('meyda');
    Meyda.bufferSize = BUFFER_SIZE;
    Meyda.sampleRate = sampleRate;

    interface FrameResult {
      timeSec: number;
      chroma: number[];
    }

    const frameResults: FrameResult[] = [];

    for (let offset = 0; offset + BUFFER_SIZE <= samples.length; offset += HOP_SIZE) {
      const frame = samples.slice(offset, offset + BUFFER_SIZE);

      // Check if frame is mostly silence (skip)
      let energy = 0;
      for (let i = 0; i < frame.length; i++) {
        energy += frame[i] * frame[i];
      }
      energy = energy / frame.length;

      if (energy < 1e-6) {
        // Very quiet / silence
        frameResults.push({
          timeSec: offset / sampleRate,
          chroma: new Array(12).fill(0),
        });
        continue;
      }

      try {
        const chroma = Meyda.extract('chroma', frame);
        if (chroma && chroma.length === 12) {
          frameResults.push({
            timeSec: offset / sampleRate,
            chroma: Array.from(chroma),
          });
        }
      } catch {
        // Skip frames that fail extraction
      }
    }

    console.log(`   Extracted ${frameResults.length} chroma frames`);

    // ── 3. Match each frame to a chord ──
    interface FrameChord {
      timeSec: number;
      label: string;
      confidence: number;
    }

    const rawChords: FrameChord[] = frameResults.map(fr => {
      const maxChroma = Math.max(...fr.chroma);
      if (maxChroma < 0.01) {
        return { timeSec: fr.timeSec, label: 'N', confidence: 0 };
      }
      const match = matchChord(fr.chroma);
      if (match.confidence < MIN_CONFIDENCE) {
        return { timeSec: fr.timeSec, label: 'N', confidence: match.confidence };
      }
      return { timeSec: fr.timeSec, label: match.label, confidence: match.confidence };
    });

    // ── 4. Smooth with majority voting over sliding window ──
    const smoothed: FrameChord[] = rawChords.map((fc, idx) => {
      const halfW = Math.floor(SMOOTHING_WINDOW / 2);
      const start = Math.max(0, idx - halfW);
      const end = Math.min(rawChords.length, idx + halfW + 1);

      // Count chord labels in window
      const counts: Record<string, { count: number; totalConf: number }> = {};
      for (let j = start; j < end; j++) {
        const lbl = rawChords[j].label;
        if (!counts[lbl]) counts[lbl] = { count: 0, totalConf: 0 };
        counts[lbl].count++;
        counts[lbl].totalConf += rawChords[j].confidence;
      }

      // Pick label with highest count (majority vote)
      let bestLabel = fc.label;
      let bestCount = 0;
      let bestConf = 0;
      for (const [lbl, data] of Object.entries(counts)) {
        if (data.count > bestCount || (data.count === bestCount && data.totalConf > bestConf)) {
          bestLabel = lbl;
          bestCount = data.count;
          bestConf = data.totalConf;
        }
      }

      return {
        timeSec: fc.timeSec,
        label: bestLabel,
        confidence: bestConf / bestCount,
      };
    });

    // ── 5. Merge consecutive identical chords into events ──
    const events: ChordEvent[] = [];
    let eventIndex = 0;

    if (smoothed.length > 0) {
      let currentLabel = smoothed[0].label;
      let currentStart = smoothed[0].timeSec;
      let confSum = smoothed[0].confidence;
      let confCount = 1;

      for (let i = 1; i < smoothed.length; i++) {
        if (smoothed[i].label !== currentLabel) {
          // Emit previous chord event (skip silence and very short events)
          const duration = smoothed[i].timeSec - currentStart;
          if (currentLabel !== 'N' && duration >= MIN_CHORD_DURATION) {
            events.push({
              id: `real-${eventIndex}`,
              time_seconds: Math.round(currentStart * 100) / 100,
              chord_label: currentLabel,
              confidence: Math.round((confSum / confCount) * 100) / 100,
            });
            eventIndex++;
          }

          currentLabel = smoothed[i].label;
          currentStart = smoothed[i].timeSec;
          confSum = 0;
          confCount = 0;
        }
        confSum += smoothed[i].confidence;
        confCount++;
      }

      // Emit last chord
      const lastDuration = totalDuration - currentStart;
      if (currentLabel !== 'N' && lastDuration >= MIN_CHORD_DURATION) {
        events.push({
          id: `real-${eventIndex}`,
          time_seconds: Math.round(currentStart * 100) / 100,
          chord_label: currentLabel,
          confidence: Math.round((confSum / confCount) * 100) / 100,
        });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ RealChordEngine: Detected ${events.length} chord events in ${elapsed}s`);

    return events;
  }
}
