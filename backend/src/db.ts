/**
 * Simple JSON file-based database for ChordSnap
 * Avoids native module dependencies (no Python/node-gyp needed)
 */

import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'chordsnap-data.json');

export interface SongRecord {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  duration: number;
  status: 'uploading' | 'processing' | 'done' | 'failed';
  genre: string;
  created_at: string;
  updated_at: string;
}

export interface ChordEventRecord {
  id: string;
  song_id: string;
  time_seconds: number;
  chord_label: string;
  confidence: number;
  is_user_edited: number;
}

interface DbData {
  songs: SongRecord[];
  chord_events: ChordEventRecord[];
}

function loadDb(): DbData {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('DB load warning, starting fresh:', err);
  }
  return { songs: [], chord_events: [] };
}

function saveDb(data: DbData): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Song operations ---

export function insertSong(song: SongRecord): void {
  const data = loadDb();
  data.songs.push(song);
  saveDb(data);
}

export function getSong(id: string): SongRecord | undefined {
  const data = loadDb();
  return data.songs.find(s => s.id === id);
}

export function getAllSongs(): SongRecord[] {
  const data = loadDb();
  return data.songs.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function updateSong(id: string, updates: Partial<SongRecord>): boolean {
  const data = loadDb();
  const index = data.songs.findIndex(s => s.id === id);
  if (index === -1) return false;
  data.songs[index] = { ...data.songs[index], ...updates, updated_at: new Date().toISOString() };
  saveDb(data);
  return true;
}

export function deleteSong(id: string): boolean {
  const data = loadDb();
  const initialLen = data.songs.length;
  data.songs = data.songs.filter(s => s.id !== id);
  data.chord_events = data.chord_events.filter(c => c.song_id !== id);
  saveDb(data);
  return data.songs.length < initialLen;
}

// --- Chord event operations ---

export function insertChordEvents(events: ChordEventRecord[]): void {
  const data = loadDb();
  data.chord_events.push(...events);
  saveDb(data);
}

export function getChordsBySong(songId: string): ChordEventRecord[] {
  const data = loadDb();
  return data.chord_events
    .filter(c => c.song_id === songId)
    .sort((a, b) => a.time_seconds - b.time_seconds);
}

export function updateChordEvent(songId: string, eventId: string, chordLabel: string): boolean {
  const data = loadDb();
  const index = data.chord_events.findIndex(c => c.id === eventId && c.song_id === songId);
  if (index === -1) return false;
  data.chord_events[index].chord_label = chordLabel;
  data.chord_events[index].is_user_edited = 1;
  saveDb(data);
  return true;
}
