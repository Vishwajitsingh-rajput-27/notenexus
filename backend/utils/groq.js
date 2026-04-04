/**
 * utils/groq.js — Shared Groq API client
 *
 * A single, well-tested implementation used by every route that needs
 * to call the Groq inference API.  Previously, groqCall() was copy-pasted
 * into whatsapp.js, tutor.js, studyPlanner.js, and examPredictor.js with
 * subtly different timeout/temperature values.
 */

const https = require('https');

/**
 * Call the Groq chat-completions endpoint.
 *
 * @param {Array|string} messages  - Full messages array OR a single string prompt
 *                                   (a string is wrapped in [{ role:'user', content }])
 * @param {object}       [opts]
 * @param {number}       [opts.maxTokens=1024]
 * @param {number}       [opts.temperature=0.3]
 * @param {string}       [opts.model='llama-3.3-70b-versatile']
 * @param {number}       [opts.timeoutMs=30000]
 * @returns {Promise<string>}
 */
const groqCall = (messages, opts = {}) => {
  const {
    maxTokens   = 1024,
    temperature = 0.3,
    model       = 'llama-3.3-70b-versatile',
    timeoutMs   = 30_000,
  } = opts;

  // Allow callers to pass a plain string instead of a messages array
  const normalised = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : messages;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: normalised,
      max_tokens: maxTokens,
      temperature,
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.choices?.[0]?.message?.content ?? '';
          resolve(text);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Groq request timed out after ${timeoutMs}ms`));
    });
    req.write(body);
    req.end();
  });
};

/**
 * Extract a JSON value from a raw string that may contain markdown fences
 * or surrounding prose.
 *
 * @param {string} raw
 * @param {'array'|'object'} [type='array']
 * @returns {Array|object}
 */
const extractJSON = (raw, type = 'array') => {
  try {
    const cleaned = (raw ?? '').replace(/```json|```/gi, '').trim();
    if (type === 'array') {
      const start = cleaned.indexOf('[');
      const end   = cleaned.lastIndexOf(']');
      if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
    } else {
      const start = cleaned.indexOf('{');
      const end   = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
    }
    return JSON.parse(cleaned);
  } catch {
    return type === 'array' ? [] : {};
  }
};

module.exports = { groqCall, extractJSON };
