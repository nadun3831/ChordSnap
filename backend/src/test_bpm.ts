import path from 'path';
import { RealChordEngine } from './engine/RealChordEngine';

async function main() {
  const songPath = path.join(__dirname, '..', '..', 'test_song.mp3');
  console.log('Testing BPM detection on:', songPath);
  
  // Create engine and mock the log to capture beats
  const engine = new RealChordEngine();
  
  try {
    const result = await engine.analyze(songPath);
    console.log('BPM result:', result.bpm);
    console.log('Key result:', result.key);
    console.log('Chords count:', result.chords.length);
    console.log('Chords:', result.chords.slice(0, 15));
  } catch (err) {
    console.error('Error running engine:', err);
  }
}

main();
