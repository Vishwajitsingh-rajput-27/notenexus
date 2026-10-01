/**
 * Shared Groq API client.
 *
 * Model IDs are configurable because hosted model availability changes over time.
 * The client retries once with a known fallback when Groq reports a model access
 * or deprecation error, so one stale deployment setting cannot break every AI tool.
 */

const https = require('https');

const DEFAULT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const FALLBACK_MODELS = [
  DEFAULT_MODEL,
  process.env.GROQ_FALLBACK_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
].filter((model, index, models) => model && models.indexOf(model) === index);

const isModelAvailabilityError = (message = '') => {
  const text = message.toLowerCase();
  return text.includes('model') && (
    text.includes('does not exist') ||
    text.includes('not found') ||
    text.includes('deprecat') ||
    text.includes('do not have access') ||
    text.includes('access to it')
  );
};

const requestModel = (messages, { maxTokens, temperature, timeoutMs }, model) =>
  new Promise((resolve, reject) => {
    if (!process.env.GROQ_API_KEY) {
      reject(new Error('AI service is not configured: GROQ_API_KEY is missing.'));
      return;
    }

    const body = JSON.stringify({
      model,
      messages,
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
          if (parsed.error) {
            const error = new Error(parsed.error.message || 'Groq request failed');
            error.code = parsed.error.code;
            error.status = res.statusCode;
            reject(error);
            return;
          }
          const text = parsed.choices?.[0]?.message?.content ?? '';
          if (!text.trim()) reject(new Error('AI service returned an empty response.'));
          else resolve(text);
        } catch (err) {
          reject(new Error(`Invalid response from AI service: ${err.message}`));
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

/**
 * @param {Array|string} messages Full messages array or a single prompt string
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=1024]
 * @param {number} [opts.temperature=0.3]
 * @param {string} [opts.model] Optional explicit model override
 * @param {number} [opts.timeoutMs=30000]
 */
const groqCall = async (messages, opts = {}) => {
  const {
    maxTokens = 1024,
    temperature = 0.3,
    model,
    timeoutMs = 30_000,
  } = opts;

  const normalised = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : messages;
  const models = model ? [model, ...FALLBACK_MODELS.filter((candidate) => candidate !== model)] : FALLBACK_MODELS;
  let lastError;

  for (const candidate of models) {
    try {
      return await requestModel(normalised, { maxTokens, temperature, timeoutMs }, candidate);
    } catch (err) {
      lastError = err;
      if (!isModelAvailabilityError(err.message)) throw err;
    }
  }

  throw new Error(`No configured Groq model is available. Tried: ${models.join(', ')}.`);
};

/** Extract a JSON value from model output that may contain markdown fences/prose. */
const extractJSON = (raw, type = 'array') => {
  try {
    const cleaned = (raw ?? '').replace(/```json|```/gi, '').trim();
    if (type === 'array') {
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
    } else {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
    }
    return JSON.parse(cleaned);
  } catch {
    return type === 'array' ? [] : {};
  }
};

module.exports = { groqCall, extractJSON, DEFAULT_MODEL };
