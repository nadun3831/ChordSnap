/**
 * ChordDetectionEngine interface
 * 
 * Abstraction layer for chord detection backends.
 * Implement this interface to swap between:
 * - MockEngine (for development/testing)
 * - KlangioEngine (paid API - production)
 * - PythonPipelineEngine (self-hosted librosa/madmom)
 */

export interface ChordEvent {
  id: string;
  time_seconds: number;
  chord_label: string;
  confidence: number;
}

export interface AnalysisResult {
  chords: ChordEvent[];
  bpm: number;
  key?: string;
}

export interface ChordDetectionEngine {
  /** Analyze an audio file and return time-stamped chord events + metadata */
  analyze(audioPath: string): Promise<AnalysisResult>;
  /** Display name of the engine */
  readonly name: string;
}
