/**
 * API Client for ChordSnap backend
 */

import { Platform } from 'react-native';

// For Android emulator, use 10.0.2.2 instead of localhost
// For physical device, use your computer's local IP
const API_BASE = 'http://localhost:3001';

export interface Song {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  duration: number;
  bpm?: number;
  key_name?: string;
  status: 'uploading' | 'processing' | 'done' | 'failed';
  genre: string;
  created_at: string;
  updated_at: string;
}

export interface ChordEvent {
  id: string;
  song_id: string;
  time_seconds: number;
  chord_label: string;
  confidence: number;
  is_user_edited: number;
}

export interface ChordsResponse {
  status: string;
  chords: ChordEvent[];
  message?: string;
}

/**
 * Upload an audio file and start chord analysis
 */
export async function uploadSong(
  fileInput: string | any,
  fileName: string,
  mimeType: string,
  title?: string,
  artist?: string,
): Promise<{ id: string; title: string; status: string }> {
  const formData = new FormData();
  
  if (Platform.OS === 'web' && typeof fileInput !== 'string') {
    formData.append('audio', fileInput, fileName);
  } else {
    formData.append('audio', {
      uri: fileInput,
      name: fileName,
      type: mimeType,
    } as any);
  }

  if (title) formData.append('title', title);
  if (artist) formData.append('artist', artist);

  const response = await fetch(`${API_BASE}/songs`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Upload failed');
  }

  return response.json();
}

/**
 * Get song details by ID
 */
export async function getSong(songId: string): Promise<Song> {
  const response = await fetch(`${API_BASE}/songs/${songId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch song');
  }
  return response.json();
}

/**
 * Get chord timeline for a song
 */
export async function getSongChords(songId: string): Promise<ChordsResponse> {
  const response = await fetch(`${API_BASE}/songs/${songId}/chords`);
  if (!response.ok) {
    throw new Error('Failed to fetch chords');
  }
  return response.json();
}

/**
 * Update a chord label (user correction)
 */
export async function updateChord(
  songId: string,
  eventId: string,
  chordLabel: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/songs/${songId}/chords/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chord_label: chordLabel }),
  });

  if (!response.ok) {
    throw new Error('Failed to update chord');
  }
}

/**
 * List all songs
 */
export async function listSongs(): Promise<Song[]> {
  const response = await fetch(`${API_BASE}/songs`);
  if (!response.ok) {
    throw new Error('Failed to fetch songs');
  }
  const data = await response.json();
  return data.songs;
}

/**
 * Delete a song
 */
export async function deleteSong(songId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/songs/${songId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete song');
  }
}

/**
 * Poll for song status until it's done or failed
 */
export async function pollSongStatus(
  songId: string,
  onProgress?: (status: string) => void,
  intervalMs: number = 1000,
  maxAttempts: number = 120,
): Promise<Song> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const song = await getSong(songId);

    if (onProgress) onProgress(song.status);

    if (song.status === 'done' || song.status === 'failed') {
      return song;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error('Processing timed out');
}
