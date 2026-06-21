import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import { RealChordEngine } from '../engine/RealChordEngine';
import { ChordDetectionEngine } from '../engine/ChordDetectionEngine';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowedTypes.join(', ')}`));
    }
  },
});

// Use RealChordEngine for actual audio analysis
const engine: ChordDetectionEngine = new RealChordEngine();
console.log(`🎵 Using chord engine: ${engine.name}`);

// ============================================
// POST /songs — Upload audio + start analysis
// ============================================
router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const songId = uuidv4();
    const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '') || 'Untitled';
    const artist = req.body.artist || '';
    const genre = req.body.genre || '';

    // Insert song record
    db.insertSong({
      id: songId,
      title,
      artist,
      audio_url: req.file.filename,
      duration: 0,
      status: 'processing',
      genre,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Start async chord detection
    processChords(songId, req.file.path).catch(err => {
      console.error(`Chord processing failed for song ${songId}:`, err);
      db.updateSong(songId, { status: 'failed' });
    });

    res.status(201).json({
      id: songId,
      title,
      status: 'processing',
      message: 'Audio uploaded. Chord analysis started.',
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Async chord processing
async function processChords(songId: string, audioPath: string) {
  try {
    const chords = await engine.analyze(audioPath);

    // Calculate song duration from the last chord event
    const duration = chords.length > 0
      ? chords[chords.length - 1].time_seconds + 3
      : 0;

    // Insert chord events
    const chordRecords: db.ChordEventRecord[] = chords.map(c => ({
      id: c.id,
      song_id: songId,
      time_seconds: c.time_seconds,
      chord_label: c.chord_label,
      confidence: c.confidence,
      is_user_edited: 0,
    }));

    db.insertChordEvents(chordRecords);

    // Update song status to done
    db.updateSong(songId, { status: 'done', duration });

    console.log(`✅ Song ${songId}: ${chords.length} chords detected in ${duration.toFixed(1)}s`);
  } catch (err) {
    db.updateSong(songId, { status: 'failed' });
    throw err;
  }
}

// ============================================
// GET /songs — List all songs
// ============================================
router.get('/', (req: Request, res: Response) => {
  try {
    const songs = db.getAllSongs();
    res.json({ songs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /songs/:id — Get song details
// ============================================
router.get('/:id', (req: Request, res: Response) => {
  try {
    const song = db.getSong(req.params.id);
    if (!song) {
      res.status(404).json({ error: 'Song not found' });
      return;
    }
    res.json(song);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /songs/:id/chords — Get chord timeline
// ============================================
router.get('/:id/chords', (req: Request, res: Response) => {
  try {
    const song = db.getSong(req.params.id);
    if (!song) {
      res.status(404).json({ error: 'Song not found' });
      return;
    }

    if (song.status !== 'done') {
      res.json({
        status: song.status,
        chords: [],
        message: song.status === 'processing'
          ? 'Chord analysis in progress...'
          : 'Chord analysis failed.',
      });
      return;
    }

    const chords = db.getChordsBySong(req.params.id);
    res.json({ status: 'done', chords });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PATCH /songs/:id/chords/:eventId — Edit chord
// ============================================
router.patch('/:id/chords/:eventId', (req: Request, res: Response) => {
  try {
    const { chord_label } = req.body;
    if (!chord_label) {
      res.status(400).json({ error: 'chord_label is required' });
      return;
    }

    const updated = db.updateChordEvent(req.params.id, req.params.eventId, chord_label);
    if (!updated) {
      res.status(404).json({ error: 'Chord event not found' });
      return;
    }

    res.json({ success: true, chord_label });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// DELETE /songs/:id — Delete a song
// ============================================
router.delete('/:id', (req: Request, res: Response) => {
  try {
    // Get song info before deleting so we can remove the audio file
    const song = db.getSong(req.params.id);

    const deleted = db.deleteSong(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Song not found' });
      return;
    }

    // Delete the uploaded audio file from disk
    if (song?.audio_url) {
      const fs = require('fs');
      const audioPath = path.join(__dirname, '..', '..', 'uploads', song.audio_url);
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
          console.log(`🗑️  Deleted audio file: ${song.audio_url}`);
        }
      } catch (fileErr: any) {
        console.warn(`Warning: Could not delete audio file: ${fileErr.message}`);
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
