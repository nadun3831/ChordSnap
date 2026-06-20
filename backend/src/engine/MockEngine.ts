import { v4 as uuidv4 } from 'uuid';
import { ChordDetectionEngine, ChordEvent } from './ChordDetectionEngine';

/**
 * MockEngine — generates realistic chord progressions for testing.
 * 
 * Produces common pop/rock progressions (I-V-vi-IV, ii-V-I, etc.)
 * with randomized timing to simulate a real chord detection result.
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

export class MockEngine implements ChordDetectionEngine {
  readonly name = 'MockEngine (Development)';

  async analyze(audioPath: string): Promise<ChordEvent[]> {
    // Simulate processing time (1-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Pick a random progression
    const progression = COMMON_PROGRESSIONS[Math.floor(Math.random() * COMMON_PROGRESSIONS.length)];

    // Generate a realistic song duration (2-5 minutes)
    const songDuration = 120 + Math.random() * 180;

    // Generate chord events across the song duration
    const events: ChordEvent[] = [];
    let currentTime = 0;
    let chordIndex = 0;

    while (currentTime < songDuration) {
      // Each chord lasts 1.5 to 4 seconds (typical bar duration at various tempos)
      const chordDuration = 1.5 + Math.random() * 2.5;
      const chord = progression[chordIndex % progression.length];

      events.push({
        id: uuidv4(),
        time_seconds: Math.round(currentTime * 100) / 100,
        chord_label: chord,
        confidence: 0.75 + Math.random() * 0.25, // 75-100% confidence
      });

      currentTime += chordDuration;
      chordIndex++;
    }

    return events;
  }
}
