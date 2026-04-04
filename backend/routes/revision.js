const express      = require('express');
const asyncHandler = require('express-async-handler');
const auth = require('../middleware/auth');
const {
  generateSummary,
  generateFlashcards,
  generateQuestions,
  generateMindmap,
} = require('../services/aiService');

const router = express.Router();
router.use(auth);

// Helper: accept either `text` or `content` field from the body
const getText = (body) => (body.text || body.content || '').trim();

// ── POST /api/revision — generic handler with ?type=  ─────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const text = getText(req.body);
  const { type } = req.body;
  if (!text || text.length < 20) return res.status(400).json({ message: 'Text too short (min 20 chars)' });

  let result;
  if      (type === 'summary')    result = await generateSummary(text);
  else if (type === 'flashcards') result = await generateFlashcards(text);
  else if (type === 'questions')  result = await generateQuestions(text);
  else if (type === 'mindmap')    result = await generateMindmap(text);
  else return res.status(400).json({ message: 'type must be: summary | flashcards | questions | mindmap' });

  res.json({ type, result });
}));

// ── POST /api/revision/all — generate everything at once ─────────────────
router.post('/all', asyncHandler(async (req, res) => {
  const text = getText(req.body);
  if (!text || text.length < 20) return res.status(400).json({ message: 'Text too short (min 20 chars)' });
  const [summary, flashcards, questions, mindmap] = await Promise.all([
    generateSummary(text),
    generateFlashcards(text),
    generateQuestions(text),
    generateMindmap(text),
  ]);
  res.json({ summary, flashcards, questions, mindmap });
}));

// ── POST /api/revision/flashcards — dedicated route (accepts { content | text }) ─
router.post('/flashcards', asyncHandler(async (req, res) => {
  const text = getText(req.body);
  if (!text || text.length < 20) return res.status(400).json({ message: 'Text too short (min 20 chars)' });
  const result = await generateFlashcards(text);
  res.json({ type: 'flashcards', result });
}));

// ── POST /api/revision/mindmap — dedicated route (accepts { content | text }) ──
router.post('/mindmap', asyncHandler(async (req, res) => {
  const text = getText(req.body);
  if (!text || text.length < 20) return res.status(400).json({ message: 'Text too short (min 20 chars)' });
  const result = await generateMindmap(text);
  res.json({ type: 'mindmap', result });
}));

// ── POST /api/revision/summary ────────────────────────────────────────────
router.post('/summary', asyncHandler(async (req, res) => {
  const text = getText(req.body);
  if (!text || text.length < 20) return res.status(400).json({ message: 'Text too short (min 20 chars)' });
  const result = await generateSummary(text);
  res.json({ type: 'summary', result });
}));

// ── POST /api/revision/questions ──────────────────────────────────────────
router.post('/questions', asyncHandler(async (req, res) => {
  const text = getText(req.body);
  if (!text || text.length < 20) return res.status(400).json({ message: 'Text too short (min 20 chars)' });
  const result = await generateQuestions(text);
  res.json({ type: 'questions', result });
}));

module.exports = router;
