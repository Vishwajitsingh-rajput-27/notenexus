const log = require('../utils/logger')('aiService');

/**
 * services/aiService.js — NoteNexus AI helpers
 */

const https = require('https');
const { groqCall, extractJSON } = require('../utils/groq');

// ── Gemini embeddings ─────────────────────────────────────────────────────────

const EMBEDDING_MODELS = ['text-embedding-004', 'embedding-001'];

const geminiEmbed = (text) => new Promise((resolve) => {
  const body = JSON.stringify({
    content: { parts: [{ text: text.slice(0, 8_000) }] },
  });

  const tryModel = (index) => {
    if (index >= EMBEDDING_MODELS.length) {
      log.warn('All embedding models failed — using hash fallback');
      const fallback = Array.from({ length: 768 }, (_, i) => {
        let h = 0;
        const seed = text.slice(0, 50) + i;
        for (let j = 0; j < seed.length; j++) {
          h = Math.imul(31, h) + seed.charCodeAt(j) | 0;
        }
        return (h % 1000) / 1000;
      });
      return resolve(fallback);
    }

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${EMBEDDING_MODELS[index]}:embedContent?key=${process.env.GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error || !parsed.embedding?.values) return tryModel(index + 1);
          resolve(parsed.embedding.values);
        } catch {
          tryModel(index + 1);
        }
      });
    });

    req.on('error', () => tryModel(index + 1));
    req.setTimeout(15_000, () => { req.destroy(); tryModel(index + 1); });
    req.write(body);
    req.end();
  };

  tryModel(0);
});

// ── Language detection & translation ─────────────────────────────────────────

const translateToEnglish = async (text) => {
  try {
    const sample = text.slice(0, 500);
    const langRaw = await groqCall(
      `Detect the language of this text and reply with ONLY a JSON object:
{"language":"English","isEnglish":true}
or
{"language":"Arabic","isEnglish":false}

Text: ${sample}`,
      { maxTokens: 100 }
    );

    const langResult = extractJSON(langRaw, 'object');
    if (!langResult || langResult.isEnglish === true) return text;

    log.info('Translating content', { fromLanguage: langResult.language, toLanguage: 'English' });

    const CHUNK_SIZE = 3_000;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    const translated = await Promise.all(
      chunks.map((chunk) =>
        groqCall(
          `Translate the following text to English. Return ONLY the translated text:\n\n${chunk}`,
          { maxTokens: 2048 }
        )
      )
    );

    return translated.join(' ').trim();
  } catch (err) {
    log.error('translateToEnglish failed', err);
    return text;
  }
};

// ── Academic classifier ───────────────────────────────────────────────────────

const detectSubjectChapter = async (text) => {
  const FALLBACK = { subject: 'General', chapter: 'Uncategorized', keywords: [] };
  if (!text || text.trim().length < 10) return FALLBACK;

  try {
    const sample = text.slice(0, 1_200);

    const raw = await groqCall(
      `You are an academic classifier. Read this student note and identify its subject and chapter.
Return ONLY valid JSON with no markdown, no explanation.

Example: {"subject":"Physics","chapter":"Newton Laws","keywords":["force","mass","acceleration"]}

Note:
${sample}

JSON response:`,
      { maxTokens: 200 }
    );

    const parsed = extractJSON(raw, 'object');

    if (!parsed?.subject || parsed.subject === 'Physics') {
      const verify = await groqCall(
        `What academic subject is this note about? Be specific.
Return ONLY JSON: {"subject":"...","chapter":"...","keywords":["...","...","..."]}
Note: ${sample.slice(0, 600)}`,
        { maxTokens: 200 }
      );
      const verified = extractJSON(verify, 'object');
      if (verified?.subject) return verified;
    }

    return parsed?.subject ? parsed : FALLBACK;
  } catch (err) {
    log.error('detectSubjectChapter failed', err);
    return FALLBACK;
  }
};

// ── Study tools ───────────────────────────────────────────────────────────────

const generateSummary = async (text) => {
  try {
    return await groqCall(
      `Create a concise study summary with:
1. Key Concepts (bullet points)
2. Important Definitions
3. Quick Revision Points

Notes:
${text.slice(0, 4_000)}`,
      { maxTokens: 800 }
    );
  } catch {
    return 'Could not generate summary. Please try again.';
  }
};

const generateFlashcards = async (text) => {
  try {
    const raw = await groqCall(
      `Create 10 flashcards from these notes.
Return ONLY a JSON array, no markdown.
Format: [{"question":"...","answer":"..."}]

Notes:
${text.slice(0, 4_000)}`,
      { maxTokens: 1_500 }
    );
    const cards = extractJSON(raw, 'array');
    if (Array.isArray(cards) && cards.length > 0) return cards;
    return [{ question: 'What is the main topic?', answer: text.slice(0, 100) }];
  } catch (err) {
    log.error('generateFlashcards failed', err);
    return [{ question: 'Error', answer: 'Please try again' }];
  }
};

const generateQuestions = async (text) => {
  try {
    const raw = await groqCall(
      `Generate 10 exam practice questions with model answers.
Return ONLY a JSON array, no markdown.
Format: [{"question":"...","type":"short_answer","hint":"...","answer":"..."}]
The "answer" field must be a complete model answer (2-4 sentences).

Notes:
${text.slice(0, 4_000)}`,
      { maxTokens: 2_000 }
    );
    const questions = extractJSON(raw, 'array');
    if (Array.isArray(questions) && questions.length > 0) return questions;
    return [{
      question: 'Summarise the main points',
      type: 'short_answer',
      hint: 'Check notes',
      answer: 'Review your notes for key concepts.',
    }];
  } catch (err) {
    log.error('generateQuestions failed', err);
    return [{ question: 'Error', type: 'short_answer', hint: 'Try again', answer: 'Please try again.' }];
  }
};

const generateMindmap = async (text) => {
  try {
    const raw = await groqCall(
      `Create a mind map from these notes.
Return ONLY a JSON object, no markdown.
Format: {"root":"Main Topic","children":[{"label":"Subtopic","children":[{"label":"Detail"}]}]}

Notes:
${text.slice(0, 3_000)}`,
      { maxTokens: 1_000 }
    );
    const map = extractJSON(raw, 'object');
    if (map?.root) return map;
    return { root: 'Notes', children: [{ label: 'Main Topic', children: [] }] };
  } catch (err) {
    log.error('generateMindmap failed', err);
    return { root: 'Notes', children: [] };
  }
};

const createEmbedding = (text) => geminiEmbed(text);

module.exports = {
  translateToEnglish,
  detectSubjectChapter,
  generateSummary,
  generateFlashcards,
  generateQuestions,
  generateMindmap,
  createEmbedding,
};
