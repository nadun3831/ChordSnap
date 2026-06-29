import { ChordDetectionEngine, ChordEvent, AnalysisResult } from './ChordDetectionEngine';
import fs from 'fs';
import crypto from 'crypto';

/**
 * MockEngine — generates realistic chord progressions for testing.
 * 
 * Produces common pop/rock progressions (I-V-vi-IV, ii-V-I, etc.)
 * with deterministic timing and chord selection based on the audio file's MD5 hash.
 */

const COMMON_PROGRESSIONS = [
  // Pop: I-V-vi-IV in various keys
  ['C', 'G', 'Am', 'F'],
  ['G', 'D', 'Em', 'C'],
  ['D', 'A', 'Bm', 'G'],
  ['A', 'E', 'F#m', 'D'],
  // Jazz-influenced
  ['Cmaj7', 'Dm7', 'G7', 'Cmaj7'],
  ['Am7', 'Dm7', 'G7', 'Cmaj7'],
  ['Dm7', 'G7', 'Cmaj7', 'Fmaj7'],
  // Rock
  ['E', 'A', 'B', 'E'],
  ['Am', 'F', 'C', 'G'],
  // Blues
  ['A7', 'D7', 'A7', 'E7'],
];

// Helper: Mulberry32 seedable pseudo-random number generator
function createRand(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockEngine implements ChordDetectionEngine {
  readonly name = 'MockEngine (Development)';

  async analyze(audioPath: string): Promise<AnalysisResult> {
    // Simulate processing time (1-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    let seed = 0;
    let fileHash = 'default';
    try {
      if (fs.existsSync(audioPath)) {
        const fileBuffer = fs.readFileSync(audioPath);
        fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        // Convert first 8 characters of MD5 hash to a 32-bit integer seed
        seed = parseInt(fileHash.substring(0, 8), 16);
      } else {
        // Fallback seed based on filepath string hash
        let hashVal = 0;
        for (let i = 0; i < audioPath.length; i++) {
          hashVal = (hashVal << 5) - hashVal + audioPath.charCodeAt(i);
          hashVal |= 0;
        }
        seed = Math.abs(hashVal);
        fileHash = seed.toString(16);
      }
    } catch (err) {
      console.warn('Error reading or hashing file, using static seed fallback:', err);
      seed = 987654321;
      fileHash = 'fallback';
    }

    const rand = createRand(seed);

    // Pick a progression using seeded random
    const progressionIndex = Math.floor(rand() * COMMON_PROGRESSIONS.length);
    const progression = COMMON_PROGRESSIONS[progressionIndex];

    // Generate a realistic song duration (2-5 minutes, deterministic based on seed)
    const songDuration = 120 + rand() * 180;

    // Generate a mock BPM (80-140 BPM, rounded to nearest whole number)
    const bpm = Math.round(80 + rand() * 60);

    // Generate a mock Key name
    const keys = ['C', 'G', 'D', 'A', 'Am', 'Em', 'Dm'];
    const key = keys[Math.floor(rand() * keys.length)];

    // Generate chord events across the song duration
    const events: ChordEvent[] = [];
    let currentTime = 0;
    let chordIndex = 0;

    while (currentTime < songDuration) {
      // Each chord lasts 1.5 to 4 seconds (typical bar duration at various tempos)
      const chordDuration = 1.5 + rand() * 2.5;
      const chord = progression[chordIndex % progression.length];

      events.push({
        id: `mock-${fileHash.substring(0, 8)}-${chordIndex}`,
        time_seconds: Math.round(currentTime * 100) / 100,
        chord_label: chord,
        confidence: Math.round((0.75 + rand() * 0.25) * 100) / 100, // 75-100% confidence, rounded
      });

      currentTime += chordDuration;
      chordIndex++;
    }

    return {
      chords: events,
      bpm,
      key,
    };
  }
}
