const log = require('../utils/logger')('examPredictor');
/**
 * routes/examPredictor.js — AI exam question predictor
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const Note    = require('../models/Note');
const { groqCall, extractJSON, DEFAULT_MODEL } = require('../utils/groq');

const fallbackQuestions = (content, subject, examType, count) => {
  const points = content.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  return Array.from({ length: Math.min(Math.max(Number(count) || 10, 3), 20) }, (_, index) => {
    const point = points[index % Math.max(points.length, 1)] || content.slice(0, 180);
    return {
      question: `Explain and apply this ${subject} concept: ${point}`,
      type: examType === 'multiple_choice' ? 'MCQ' : examType,
      difficulty: index % 3 === 0 ? 'Easy' : index % 3 === 1 ? 'Medium' : 'Hard',
      topic: subject,
      options: examType === 'multiple_choice' ? [`A) ${point}`, 'B) A related concept', 'C) An unrelated concept', 'D) None of the above'] : [],
      answer: point,
    };
  });
};

// POST /api/exam/predict
router.post('/predict', auth, async (req, res) => {
  const { noteContent, subject = 'General', examType = 'mixed', count = 10 } = req.body;
  try {
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
      meta:      { subject, examType, count: questions.length, usedModel: `groq/${DEFAULT_MODEL}`, stats },
    });
  } catch (err) {
    log.error('Exam prediction failed', err);
    const questions = fallbackQuestions(noteContent, subject, examType, count);
    res.json({
      success: true,
      questions,
      meta: { subject, examType, count: questions.length, fallback: true, stats: {} },
    });
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
