const log = require('../utils/logger')('tutor');
/**
 * routes/tutor.js — AI Tutor + Quiz generator + General-purpose assistant
 *
 * Upgrade: the bot can now answer ANY question — not just notes-related ones.
 * When a user asks something, it:
 *   1. Semantically searches the user's notes for relevant context.
 *   2. If relevant notes are found (score >= 0.65), injects them as context.
 *   3. Falls back gracefully to pure general knowledge when no notes match.
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { groqCall, extractJSON } = require('../utils/groq');
const { semanticSearch }        = require('../services/vectorService');

// ── System prompts ────────────────────────────────────────────────────────────

const GENERAL_SYSTEM_PROMPT = `You are NoteNexus AI, a smart, friendly assistant built into the NoteNexus study platform.

You can answer ANYTHING the user asks — study questions, general knowledge, coding, maths, science, history, creative writing, advice, or casual conversation.

Guidelines:
- Answer every question directly and helpfully, regardless of whether it relates to the user's notes.
- Be concise by default (under 250 words), but go deeper if the user asks.
- Use clear language; match your tone to the user's style (casual vs formal).
- If you are unsure about something, say so honestly rather than guessing.
- Never refuse a reasonable question by claiming it is "outside your scope".
- You may use markdown for code blocks, bullet points, or math when it helps readability.`;

const NOTES_AWARE_SYSTEM_PROMPT = (notesContext) =>
  `You are NoteNexus AI, a smart, friendly assistant built into the NoteNexus study platform.

You have access to relevant excerpts from the user's own notes (shown below). Use them to give a personalised, accurate answer — but you are not limited to them. If the notes do not fully answer the question, supplement with your own knowledge.

--- USER'S RELEVANT NOTES ---
${notesContext}
--- END OF NOTES ---

Guidelines:
- Prioritise information from the notes when it is relevant and accurate.
- Clearly indicate when you are drawing on the notes vs general knowledge (e.g. "According to your notes..." or "Beyond your notes...").
- Answer ANY question, even if it has nothing to do with the notes.
- Be concise (under 300 words) unless asked to elaborate.
- Never refuse a reasonable question.`;

const TUTOR_SYSTEM_PROMPT = (subject, level) =>
  `You are an expert ${subject} tutor teaching a ${level}-level student on the NoteNexus platform.

Teaching rules:
1. Explain concepts clearly using real-world examples and analogies.
2. After each explanation, ask ONE comprehension check question.
3. If the student answers incorrectly, say "Not quite — " then re-explain with a different example.
4. If correct, say "Excellent! " and give brief praise before moving on.
5. Break complex topics into small digestible steps — never overwhelm.
6. Keep responses under 200 words unless the student asks for more.
7. Use simple language for beginners, technical depth for advanced students.
8. Occasionally suggest: "Try this yourself: [simple exercise]"
9. Be warm, encouraging, and patient at all times.
10. You can answer ANY question the student asks — not just about ${subject}.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fetchRelevantNotes = async (query, userId, topK = 4, minScore = 0.65) => {
  try {
    const results = await semanticSearch(query, userId, topK);
    return results
      .filter((r) => (r.score ?? 0) >= minScore)
      .map((r) => ({
        title: r.metadata?.title || 'Untitled Note',
        text:  (r.metadata?.content || r.metadata?.text || '').slice(0, 800),
        score: r.score,
      }));
  } catch (err) {
    log.warn('fetchRelevantNotes failed (continuing without notes context)', { error: err.message });
    return [];
  }
};

const buildNotesContext = (notes) =>
  notes
    .map((n, i) => `[Note ${i + 1}: "${n.title}"]\n${n.text}`)
    .join('\n\n');

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/tutor/ask
 * General-purpose endpoint — answers ANY question.
 * Automatically enriches with relevant notes context when found.
 *
 * Body: { message, history?, useNotes? }
 */
router.post('/ask', auth, async (req, res) => {
  try {
    const { message, history = [], useNotes = true } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let systemPrompt     = GENERAL_SYSTEM_PROMPT;
    let relevantNotes    = [];
    let notesContextUsed = false;

    if (useNotes) {
      relevantNotes = await fetchRelevantNotes(message, req.user._id.toString());
      if (relevantNotes.length > 0) {
        systemPrompt     = NOTES_AWARE_SYSTEM_PROMPT(buildNotesContext(relevantNotes));
        notesContextUsed = true;
      }
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-20).map((h) => ({
        role:    h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    const reply = await groqCall(messages, { maxTokens: 800, temperature: 0.5 });

    log.info('General ask responded', {
      notesContextUsed,
      notesFound: relevantNotes.length,
      replyLength: reply.length,
    });

    res.json({
      success:         true,
      reply,
      notesContextUsed,
      notesUsed:       relevantNotes.map((n) => ({ title: n.title, score: n.score })),
      usedModel:       'groq/llama-3.3-70b',
    });
  } catch (err) {
    log.error('General ask failed', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tutor/chat
 * Legacy subject-specific tutor — now also handles any question
 * and enriches with notes context when relevant.
 *
 * Body: { message, history?, subject?, level? }
 */
router.post('/chat', auth, async (req, res) => {
  try {
    const {
      message,
      history = [],
      subject = 'General',
      level   = 'beginner',
    } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const relevantNotes    = await fetchRelevantNotes(message, req.user._id.toString());
    const notesContextUsed = relevantNotes.length > 0;

    let systemContent = TUTOR_SYSTEM_PROMPT(subject, level);
    if (notesContextUsed) {
      systemContent +=
        `\n\n--- RELEVANT EXCERPTS FROM THE STUDENT'S NOTES ---\n` +
        buildNotesContext(relevantNotes) +
        `\n--- END OF NOTES ---\n` +
        `\nUse the notes above to personalise your explanation when relevant. ` +
        `Reference them explicitly (e.g. "As you wrote in your notes...").`;
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-20).map((h) => ({
        role:    h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    const reply = await groqCall(messages, { maxTokens: 600, temperature: 0.5 });

    log.info('Tutor responded', {
      subject, level, notesContextUsed,
      notesFound: relevantNotes.length,
      tokens:     reply.length,
    });

    res.json({
      success:         true,
      reply,
      notesContextUsed,
      notesUsed:       relevantNotes.map((n) => ({ title: n.title, score: n.score })),
      usedModel:       'groq/llama-3.3-70b',
    });
  } catch (err) {
    log.error('AI tutor chat failed', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tutor/quiz
 * Generate a 5-question quiz.
 * Body: { subject, topic, level? }
 */
router.post('/quiz', auth, async (req, res) => {
  try {
    const { subject, topic, level = 'beginner' } = req.body;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'subject and topic are required' });
    }

    const raw = await groqCall(
      `Generate a 5-question ${level}-level quiz on "${topic}" in ${subject}.
Return ONLY a valid JSON array, no markdown:
[{"q":"question","options":["A) ...","B) ...","C) ...","D) ..."],"answer":"A","explanation":"..."}]`,
      { maxTokens: 1_500, temperature: 0.4 }
    );

    const quiz = extractJSON(raw, 'array');
    if (!Array.isArray(quiz) || quiz.length === 0) {
      return res.status(500).json({ error: 'Could not generate quiz. Please try again.' });
    }

    log.ok('Quiz generated', { subject, topic, level, questions: quiz.length });
    res.json({ success: true, quiz, topic, subject, level });
  } catch (err) {
    log.error('Quiz generation failed', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
