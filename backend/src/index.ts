import express from 'express';
import cors from 'cors';
import path from 'path';
import songsRouter from './routes/songs';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded audio files statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/songs', songsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ChordSnap API',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║        🎵 ChordSnap API Server        ║
  ║       Running on port ${PORT}            ║
  ║   http://localhost:${PORT}/health        ║
  ╚═══════════════════════════════════════╝
  `);
});

export default app;
