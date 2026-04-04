const express      = require('express');
const asyncHandler = require('express-async-handler');
const auth         = require('../middleware/auth');
const Note         = require('../models/Note');
const { semanticSearch } = require('../services/vectorService');

const router = express.Router();
router.use(auth);

// POST /api/search
// FIX: Falls back to MongoDB text search when Pinecone is unavailable
router.post('/', asyncHandler(async (req, res) => {
  const { query, topK = 8 } = req.body;
  if (!query?.trim()) return res.status(400).json({ message: 'Query is required' });

  let results = [];
  let usedFallback = false;

  try {
    results = await semanticSearch(query, req.user._id.toString(), topK);
  } catch (err) {
    // Pinecone down or misconfigured — use MongoDB keyword search
    usedFallback = true;
    const notes = await Note.find({
      userId: req.user._id,
      $or: [
        { title:    { $regex: query, $options: 'i' } },
        { content:  { $regex: query, $options: 'i' } },
        { subject:  { $regex: query, $options: 'i' } },
        { chapter:  { $regex: query, $options: 'i' } },
        { keywords: { $in: [new RegExp(query, 'i')] } },
      ],
    }).limit(topK).select('-content');

    results = notes.map(n => ({
      score:    1,
      metadata: {
        noteId:  n._id.toString(),
        title:   n.title,
        subject: n.subject,
        chapter: n.chapter,
      },
    }));
  }

  res.json({ query, results, count: results.length, usedFallback });
}));

module.exports = router;
