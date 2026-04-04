// routes/copilot.js — AI Study Copilot
const express      = require('express');
const router       = express.Router();
const auth         = require('../middleware/auth');
const Note         = require('../models/Note');
const UserProfile  = require('../models/UserProfile');
const StudySession = require('../models/StudySession');
const { groqCall, extractJSON } = require('../utils/groq');
const { checkPlan } = require('../middleware/checkPlan');
const { semanticSearch } = require('../services/vectorService');
const log = require('../utils/logger')('copilot');

// ── POST /api/copilot/chat — General AI chat with notes context ───────────
// FIX: This endpoint was missing — frontend StudyCopilot calls it
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Try to fetch relevant notes for context (non-fatal)
    let notesContext = '';
    let notesUsed = [];
    try {
      const results = await semanticSearch(message, req.user._id.toString(), 4);
      const relevant = results.filter(r => (r.score ?? 0) >= 0.6);
      if (relevant.length > 0) {
        notesContext = relevant
          .map(r => `[${r.metadata?.title || 'Note'}]: ${(r.metadata?.content || '').slice(0, 500)}`)
          .join('\n\n');
        notesUsed = relevant.map(r => ({ title: r.metadata?.title, score: r.score }));
      }
    } catch (err) {
      log.warn('Copilot notes search failed (non-fatal)', err.message);
    }

    const systemPrompt = notesContext
      ? `You are NoteNexus Study Copilot, an intelligent AI assistant for students.
You have access to excerpts from the student's own notes below. Use them to give personalised, accurate answers.

--- STUDENT'S NOTES ---
${notesContext}
--- END NOTES ---

Guidelines:
- Prioritise the student's notes when relevant.
- Supplement with your general knowledge when the notes don't fully answer.
- Be concise (under 300 words) unless asked for more detail.
- Answer anything the student asks — not just study-related questions.
- Never refuse a reasonable question.`
      : `You are NoteNexus Study Copilot, an intelligent AI assistant for students.
You can answer any question — study-related or general knowledge.
Be helpful, clear and concise (under 250 words). Never refuse a reasonable request.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16).map(h => ({
        role:    h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content),
      })),
      { role: 'user', content: message },
    ];

    const reply = await groqCall(messages, { maxTokens: 800, temperature: 0.5 });

    res.json({
      success: true,
      reply,
      notesContextUsed: notesUsed.length > 0,
      notesUsed,
    });
  } catch (err) {
    log.error('Copilot chat failed', err);
    res.status(500).json({ error: err.message || 'Copilot chat failed' });
  }
});

// ── POST /api/copilot/analyze ─────────────────────────────────────────────
router.post('/analyze', auth, checkPlan('canUseCopilot'), async (req, res) => {
  try {
    const { subject } = req.body;
    if (!subject) return res.status(400).json({ error: 'subject is required' });

    const notes = await Note.find({ userId: req.user._id, subject }).limit(20);
    if (!notes.length) return res.status(400).json({ error: `No notes found for ${subject}. Upload some notes first.` });

    const combinedText = notes.map(n => `[${n.title}]: ${n.content}`).join('\n\n').slice(0, 8000);

    const raw = await groqCall(
      `You are an expert academic coach analyzing a student's notes for ${subject}.
Analyze these notes and return ONLY valid JSON (no markdown):
{
  "coveredTopics": ["topic1"],
  "weakTopics": [{"topic": "...", "reason": "..."}],
  "missingTopics": ["topic1"],
  "priorities": [{"rank": 1, "topic": "...", "urgency": "high|medium|low", "reason": "..."}],
  "overallCoverage": 65,
  "recommendation": "2-3 sentence overall recommendation"
}
Student Notes:\n${combinedText}`,
      { maxTokens: 2000, temperature: 0.3 }
    );

    const analysis = extractJSON(raw, 'object');
    if (!analysis || !analysis.coveredTopics) return res.status(500).json({ error: 'Analysis failed. Try again.' });

    await StudySession.create({ userId: req.user._id, eventType: 'copilot_run', subject, xpAwarded: 40, metadata: { notesAnalyzed: notes.length } });
    await UserProfile.findOneAndUpdate({ userId: req.user._id }, { $inc: { xp: 40 } }, { upsert: true });

    res.json({ success: true, analysis, notesAnalyzed: notes.length, subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/copilot/prep-kit ────────────────────────────────────────────
router.post('/prep-kit', auth, checkPlan('canUseCopilot'), async (req, res) => {
  try {
    const { subject, weakTopics = [], examDate } = req.body;
    if (!subject) return res.status(400).json({ error: 'subject is required' });

    const notes = await Note.find({ userId: req.user._id, subject }).limit(15);
    const combinedText = notes.map(n => n.content).join('\n\n').slice(0, 6000);
    const daysLeft = examDate ? Math.ceil((new Date(examDate) - new Date()) / 86400000) : 7;

    const raw = await groqCall(
      `Create an exam prep kit for ${subject}. Exam in ${daysLeft} days. Weak topics: ${weakTopics.join(', ') || 'none'}.
Return ONLY valid JSON:
{
  "studySchedule": [{"day": 1, "topic": "...", "tasks": ["..."], "duration": "2 hours"}],
  "highPriorityQuestions": [{"question": "...", "type": "MCQ", "difficulty": "Medium", "options": ["A)..."], "answer": "..."}],
  "formulaSheet": ["formula1"],
  "lastMinuteTips": ["tip1"],
  "predictedTopics": [{"topic": "...", "probability": "high", "reason": "..."}]
}
Student notes:\n${combinedText}`,
      { maxTokens: 3000, temperature: 0.3 }
    );

    const prepKit = extractJSON(raw, 'object');
    if (!prepKit) return res.status(500).json({ error: 'Could not generate prep kit. Try again.' });

    res.json({ success: true, prepKit, subject, daysLeft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/copilot/daily-question ──────────────────────────────────────
router.get('/daily-question', auth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id });
    const weakTopics = profile?.weakTopics?.slice(0, 3) || [];
    if (!weakTopics.length) return res.json({ question: null, message: 'Take a quiz to get personalized daily questions!' });

    const target = weakTopics[Math.floor(Math.random() * weakTopics.length)];
    const raw = await groqCall(
      `Generate ONE challenging question about "${target.topic}" in ${target.subject}.
Return ONLY JSON: {"question":"...","type":"MCQ","options":["A)...","B)...","C)...","D)..."],"answer":"...","explanation":"..."}`,
      { maxTokens: 400 }
    );

    const question = extractJSON(raw, 'object');
    res.json({ success: true, question, topic: target.topic, subject: target.subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
