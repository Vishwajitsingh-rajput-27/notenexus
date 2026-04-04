const log = require('../utils/logger')('examPredictor');
/**
 * routes/examPredictor.js — AI exam question predictor
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const Note    = require('../models/Note');
const { groqCall, extractJSON } = require('../utils/groq');

// POST /api/exam/predict
router.post('/predict', auth, async (req, res) => {
  try {
    const { noteContent, subject = 'General', examType = 'mixed', count = 10 } = req.body;

    if (!noteContent || noteContent.length < 50) {
      return res.status(400).json({ error: 'Please provide more content (at least 50 characters)' });
    }

    const raw = await groqCall(
      `You are an expert ${subject} examiner. Analyse this content and generate ${count} highly likely exam questions.
Exam type: ${examType}

Rules:
- Base questions ONLY on the content provided
- For MCQ: include 4 options like ["A) ...", "B) ...", "C) ...", "D) ..."]
- For short/long: options array should be empty []
- Always include a clear model answer
- Mix difficulty: Easy, Medium, Hard

Return ONLY a valid JSON array, no markdown:
[{"question":"...","type":"MCQ","difficulty":"Easy","topic":"...","options":["A)...","B)...","C)...","D)..."],"answer":"The correct answer is B) ... because ..."}]

Content:
${noteContent.slice(0, 4_000)}`,
      { maxTokens: 3_000 }
    );

    const questions = extractJSON(raw, 'array');

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({ error: 'Could not generate questions. Try with more detailed notes.' });
    }

    const stats = questions.reduce((acc, q) => {
      acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1;
      return acc;
    }, {});

    log.ok('Exam questions generated', { subject, examType, count: questions.length, stats });
    res.json({
      success:   true,
      questions,
      meta:      { subject, examType, count: questions.length, usedModel: 'groq/llama-3.3-70b', stats },
    });
  } catch (err) {
    log.error('Exam prediction failed', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exam/subjects
router.get('/subjects', auth, async (req, res) => {
  try {
    const subjects = await Note.distinct('subject', { userId: req.user._id });
    res.json({ subjects: subjects.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
