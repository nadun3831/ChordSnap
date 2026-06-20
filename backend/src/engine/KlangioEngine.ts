import { ChordDetectionEngine, ChordEvent } from './ChordDetectionEngine';

/**
 * KlangioEngine — Stub for Klangio Music Analysis API integration.
 * 
 * To use this engine:
 * 1. Get an API key from https://klang.io/api/
 * 2. Set the KLANGIO_API_KEY environment variable
 * 3. Switch the engine in index.ts from MockEngine to KlangioEngine
 * 
 * API Documentation: https://klang.io/api/docs
 * 
 * The Klangio API accepts audio files and returns chord progressions
 * with timestamps, key detection, BPM, and more.
 */

export class KlangioEngine implements ChordDetectionEngine {
  readonly name = 'Klangio API';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.KLANGIO_API_KEY || '';
    if (!this.apiKey) {
      console.warn(
        '⚠️  KlangioEngine: No API key provided. Set KLANGIO_API_KEY environment variable.'
      );
    }
  }

  async analyze(audioPath: string): Promise<ChordEvent[]> {
    if (!this.apiKey) {
      throw new Error(
        'Klangio API key not configured. Set KLANGIO_API_KEY environment variable or pass it to the constructor.'
      );
    }

    // TODO: Implement actual Klangio API call
    // 
    // Steps:
    // 1. Upload the audio file to Klangio API
    //    POST https://api.klang.io/v1/transcriptions
    //    Content-Type: multipart/form-data
    //    Authorization: Bearer <API_KEY>
    //    Body: { file: <audio_file>, type: "chords" }
    //
    // 2. Poll for results
    //    GET https://api.klang.io/v1/transcriptions/{id}
    //    Wait until status === "completed"
    //
    // 3. Parse the chord data from the response
    //    Map Klangio's chord format to our ChordEvent interface
    //
    // Example response structure:
    // {
    //   "chords": [
    //     { "start": 0.0, "end": 1.8, "chord": "C:maj" },
    //     { "start": 1.8, "end": 3.6, "chord": "G:maj" },
    //     ...
    //   ]
    // }

    throw new Error('KlangioEngine not yet implemented. Use MockEngine for development.');
  }
}
