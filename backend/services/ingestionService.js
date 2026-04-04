const log = require('../utils/logger')('ingestion');

/**
 * ingestionService.js  —  NoteNexus
 *
 * YouTube transcript fix
 * ──────────────────────
 * Strategy 1 (primary): HTML-scrape ytInitialPlayerResponse from the YouTube
 *   watch page, extract the timed-text caption URL, fetch it as JSON3.
 *   Zero extra dependencies — uses the BROWSER_HEADERS already defined here.
 *   Works on Render/Vercel because it mimics a real browser page-load.
 *
 * Strategy 2 (fallback): youtubei.js Innertube client.
 *   Sometimes cloud-server IPs get blocked on /youtubei/v1/get_transcript
 *   (the error seen in production). We keep this as a fallback.
 *
 * The rest of `extractFromYouTube` is UNCHANGED from the original design:
 * same URL regex (all 4 formats), same item.text join, same pipeline.
 */

const pdfParse   = require('pdf-parse');
const https      = require('https');
const http       = require('http');
const { URL }    = require('url');
const FormData   = require('form-data');
const cloudinary = require('../config/cloudinary').cloudinary;

// ── Realistic browser headers ─────────────────────────────────────────────────
const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Cache-Control':   'no-cache',
  'Pragma':          'no-cache',
};

// ── Generic file fetcher ──────────────────────────────────────────────────────
const fetchBuffer = (urlStr, extraHeaders = {}) =>
  new Promise((resolve, reject) => {
    try {
      const parsed  = new URL(urlStr);
      const lib     = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        headers:  { 'User-Agent': 'NoteNexus/1.0', ...extraHeaders },
      };
      const request = lib.get(options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchBuffer(res.headers.location, extraHeaders).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching ${urlStr}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (buffer.length === 0) return reject(new Error('Downloaded file is empty'));
          resolve(buffer);
        });
        res.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(60000, () => { request.destroy(); reject(new Error('Request timeout')); });
    } catch (e) { reject(e); }
  });

const fetchYouTube = (urlStr) => fetchBuffer(urlStr, BROWSER_HEADERS);

// ── Groq Vision API ───────────────────────────────────────────────────────────
const groqVision = (base64, mime, prompt) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        { type: 'text', text: prompt },
      ]}],
      max_tokens: 4096,
    });
    const options = {
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(raw);
          if (res.statusCode !== 200) return reject(new Error(`Groq Vision error (${res.statusCode}): ${parsed.error?.message || raw.slice(0,200)}`));
          resolve(parsed.choices?.[0]?.message?.content?.trim() || '');
        } catch (e) { reject(new Error(`Failed to parse Groq Vision response: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Groq Vision timeout')); });
    req.write(body); req.end();
  });

// ── Groq Whisper transcription ────────────────────────────────────────────────
const groqWhisper = (audioBuffer, filename) =>
  new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', audioBuffer, { filename: filename || 'audio.mp3', contentType: 'audio/mpeg' });
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'text');
    const options = {
      hostname: 'api.groq.com', path: '/openai/v1/audio/transcriptions', method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, ...form.getHeaders() },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (res.statusCode !== 200) return reject(new Error(`Whisper error (${res.statusCode}): ${text.slice(0,200)}`));
        if (!text) return reject(new Error('Empty transcription response'));
        resolve(text);
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Whisper timeout')); });
    form.pipe(req);
  });

// ── Tesseract OCR fallback ────────────────────────────────────────────────────
const tesseractOCR = async (imageBuffer) => {
  try {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return text.trim();
  } catch (err) { log.warn('Tesseract OCR failed', err); return ''; }
};

// ── Gemini PDF extractor ──────────────────────────────────────────────────────
const geminiExtractPDF = (pdfBase64) =>
  new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY not set'));
    const body = JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
        { text: 'Extract ALL text from this PDF. Preserve layout. Return only the extracted text, nothing else.' }
      ]}]
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (parsed.error) return reject(new Error(`Gemini error: ${parsed.error.message}`));
          resolve(parsed.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '');
        } catch (e) { reject(new Error(`Gemini parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(body); req.end();
  });

// ── Extract text from PDF ─────────────────────────────────────────────────────
const extractFromPDF = async (pdfUrl) => {
  const buffer = await fetchBuffer(pdfUrl);
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();
    if (text.length > 50) { log.info('PDF embedded text extracted', { chars: text.length }); return text; }
  } catch (err) { log.warn('pdf-parse failed', err); }

  log.info('No embedded text — attempting canvas OCR');
  let canvasAvailable = false; let createCanvas;
  try {
    ({ createCanvas } = require('canvas'));
    const _t = createCanvas(4, 4); _t.getContext('2d');
    canvasAvailable = true;
  } catch (e) { log.warn('Canvas unavailable — falling back to Gemini', e.message); }

  if (canvasAvailable) {
    try {
      let pdfjsLib;
      try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); }
      catch { pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs'); }
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true }).promise;
      const pageTexts = [];
      for (let pg = 1; pg <= Math.min(pdfDoc.numPages, 20); pg++) {
        try {
          const page = await pdfDoc.getPage(pg);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = createCanvas(viewport.width, viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const jpegBuf = canvas.toBuffer('image/jpeg', { quality: 0.92 });
          let pageText = '';
          try { pageText = await groqVision(jpegBuf.toString('base64'), 'image/jpeg', 'Extract ALL text from this page. Return only the text.'); } catch {}
          if (!pageText?.trim()) pageText = await tesseractOCR(jpegBuf);
          if (pageText?.trim()) pageTexts.push(`--- Page ${pg} ---\n${pageText.trim()}`);
          page.cleanup();
        } catch (err) { log.warn(`Page ${pg} render error`, err.message); }
      }
      if (pageTexts.length > 0) return pageTexts.join('\n\n');
    } catch (err) { log.warn('Canvas OCR stage failed', err.message); }
  }

  log.info('Attempting Gemini PDF extraction');
  try {
    const result = await geminiExtractPDF(buffer.toString('base64'));
    if (result?.trim().length > 0) { log.ok('Gemini extraction succeeded', { chars: result.trim().length }); return result.trim(); }
  } catch (geminiErr) { log.warn('Gemini extraction failed', geminiErr.message); }

  throw new Error('Could not extract text — PDF may be scanned without OCR, encrypted, or corrupted.');
};

// ── Extract text from image ───────────────────────────────────────────────────
const extractFromImage = async (imageUrl) => {
  const buffer = await fetchBuffer(imageUrl);
  const base64 = buffer.toString('base64');
  const ext    = imageUrl.split('.').pop().toLowerCase().split('?')[0];
  const mime   = ext === 'png' ? 'image/png' : 'image/jpeg';
  let result = '';
  try { result = await groqVision(base64, mime, 'Extract ALL text from this image. Return only the extracted text.'); } catch (err) { log.warn('Groq Vision failed', err.message); }
  if (!result?.trim()) result = await tesseractOCR(buffer);
  if (!result?.trim()) throw new Error('Could not extract text from image');
  return result.trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// YouTube transcript
// ─────────────────────────────────────────────────────────────────────────────

/**
 * YoutubeTranscript — three-strategy cascade
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOT CAUSE of previous failures:
 *   Render/Vercel cloud IPs are flagged by Google. ANY direct HTTP request to
 *   youtube.com is silently redirected to https://www.google.com/sorry/index
 *   which returns HTTP 429.  No User-Agent spoofing or header trick fixes this
 *   because the block is on the IP level, not the request level.
 *
 * STRATEGY 1 — yt-dlp subprocess (primary, most reliable)
 *   yt-dlp is a battle-hardened downloader that rotates extraction methods,
 *   handles consent cookies, and uses its own HTTP client to bypass bot
 *   detection.  Installed via the Render build command (see render.yaml).
 *   Outputs subtitle files as JSON3 which we parse directly.
 *   Binary path: /usr/local/bin/yt-dlp  (overridable via YTDLP_PATH env var)
 *
 * STRATEGY 2 — Supadata transcript API (fallback, requires SUPADATA_API_KEY)
 *   Free tier: 500 requests/month.  Sign up at https://supadata.ai
 *   Zero dependencies — plain HTTPS request to api.supadata.ai.
 *   Only attempted if process.env.SUPADATA_API_KEY is set.
 *
 * STRATEGY 3 — youtubei.js Innertube (last resort)
 *   Sometimes works if YouTube hasn't flagged the current IP yet.
 *   ESM-only, loaded lazily.
 *
 * All strategies return Array<{ text: string }> — same shape as before.
 */

const { execFile } = require('child_process');
const fs           = require('fs');
const os           = require('os');
const path         = require('path');

// ── Strategy 1: yt-dlp subprocess ────────────────────────────────────────────
/**
 * Run yt-dlp once with a given set of args and resolve with the first .json3
 * file it writes to tmpDir.  Rejects if no file is produced.
 */
const runYtDlp = (videoId, tmpDir, extraArgs = []) =>
  new Promise((resolve, reject) => {
    const ytDlpBin = process.env.YTDLP_PATH || 'yt-dlp';
    execFile(
      ytDlpBin,
      [
        '--write-auto-sub',
        '--skip-download',
        '--sub-format', 'json3',
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        ...extraArgs,
        '-o', path.join(tmpDir, '%(id)s'),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 60_000 },
      (err, _stdout, stderr) => {
        let files = [];
        try { files = fs.readdirSync(tmpDir); } catch {}
        const subFile = files.find(f => f.endsWith('.json3'));
        if (!subFile) {
          return reject(new Error(
            err
              ? `yt-dlp wrote no subtitle file: ${stderr?.slice(0, 200) || err.message}`
              : 'yt-dlp wrote no subtitle file — video may have no captions'
          ));
        }
        resolve(subFile);
      }
    );
  });

const parseYtDlpJson3 = (filePath) => {
  const raw  = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  return (data.events || [])
    .filter(e => e.segs && e.segs.some(s => s.utf8?.trim()))
    .map(e => ({
      text: e.segs.map(s => (s.utf8 || '').replace(/\n/g, ' ')).join('').trim(),
    }))
    .filter(item => item.text);
};

const fetchTranscriptViaYtDlp = async (videoId) => {
  let tmpDir;
  try { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nn-yt-')); }
  catch (e) { throw new Error(`mkdtemp failed: ${e.message}`); }

  const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} };

  try {
    // Pass 1 — try English (en, en-US, en-GB, en-orig) first
    let subFile;
    try {
      subFile = await runYtDlp(videoId, tmpDir, ['--sub-lang', 'en,en-US,en-GB,en-orig']);
      log.info('[YT/yt-dlp] English subtitles found');
    } catch {
      // Pass 2 — no English found; grab whatever language is available
      log.info('[YT/yt-dlp] No English subs — fetching any available language');
      // Clean up any partial files from pass 1 before retrying
      try { fs.readdirSync(tmpDir).forEach(f => fs.unlinkSync(path.join(tmpDir, f))); } catch {}
      subFile = await runYtDlp(videoId, tmpDir); // no --sub-lang = any language
    }

    const segments = parseYtDlpJson3(path.join(tmpDir, subFile));
    cleanup();
    if (!segments.length) throw new Error('yt-dlp subtitle file contained no text segments');
    return segments;
  } catch (err) {
    cleanup();
    throw err;
  }
};

// ── Strategy 2: Supadata transcript API ──────────────────────────────────────
const fetchTranscriptViaSupadata = (videoId) =>
  new Promise((resolve, reject) => {
    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) return reject(new Error('SUPADATA_API_KEY not configured — skipping'));

    const options = {
      hostname: 'api.supadata.ai',
      path:     `/v1/youtube/transcript?videoId=${videoId}&lang=en&text=false`,
      method:   'GET',
      headers:  { 'x-api-key': apiKey, 'Accept': 'application/json' },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode !== 200)
            return reject(new Error(`Supadata error (${res.statusCode}): ${body?.message || 'unknown'}`));
          // Supadata returns { content: [{ text, offset, duration }] }
          const segments = (body.content || [])
            .map(item => ({ text: (item.text || '').trim() }))
            .filter(item => item.text);
          if (!segments.length) return reject(new Error('Supadata returned empty transcript'));
          resolve(segments);
        } catch (e) {
          reject(new Error(`Failed to parse Supadata response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Supadata request timeout')); });
    req.end();
  });

// ── Strategy 3: youtubei.js Innertube (last resort) ──────────────────────────
let _yt = null;
const fetchTranscriptViaInnertube = async (videoId) => {
  if (!_yt) {
    const { Innertube } = await import('youtubei.js');
    _yt = await Innertube.create({ generate_session_locally: true });
  }
  const info           = await _yt.getInfo(videoId);
  const transcriptData = await info.getTranscript();
  const body           = transcriptData?.transcript?.content?.body ?? transcriptData?.content?.body;
  if (!body) throw new Error('No transcript available for this YouTube video');
  const segments = body.initial_segments ?? body.segments ?? [];
  if (!segments.length) throw new Error('No transcript available for this YouTube video');
  return segments.map(s => ({
    text: (
      s?.snippet?.text ??
      s?.transcriptSegmentRenderer?.snippet?.runs?.map(r => r.text).join('') ??
      ''
    ).trim(),
  })).filter(item => item.text);
};

// ── Combined facade — tries strategies in order ───────────────────────────────
const YoutubeTranscript = {
  fetchTranscript: async (videoId) => {
    const errors = {};

    // 1. yt-dlp
    try {
      log.info(`[YT] Strategy 1: yt-dlp for ${videoId}`);
      const r = await fetchTranscriptViaYtDlp(videoId);
      log.ok(`[YT] yt-dlp succeeded — ${r.length} segments`);
      return r;
    } catch (e) {
      errors.ytdlp = e.message;
      log.warn(`[YT] yt-dlp failed: ${e.message}`);
    }

    // 2. Supadata API
    try {
      log.info(`[YT] Strategy 2: Supadata API for ${videoId}`);
      const r = await fetchTranscriptViaSupadata(videoId);
      log.ok(`[YT] Supadata succeeded — ${r.length} segments`);
      return r;
    } catch (e) {
      errors.supadata = e.message;
      log.warn(`[YT] Supadata failed: ${e.message}`);
    }

    // 3. Innertube
    try {
      log.info(`[YT] Strategy 3: Innertube for ${videoId}`);
      const r = await fetchTranscriptViaInnertube(videoId);
      log.ok(`[YT] Innertube succeeded — ${r.length} segments`);
      return r;
    } catch (e) {
      errors.innertube = e.message;
      log.error('[YT] All 3 strategies failed', errors);
      throw new Error(
        `Could not fetch YouTube transcript.\n` +
        `yt-dlp: ${errors.ytdlp}\n` +
        `Supadata: ${errors.supadata}\n` +
        `Innertube: ${errors.innertube}`
      );
    }
  },
};

// ── Translate transcript text to English via Groq ─────────────────────────────
/**
 * Detects the language of the text and, if it is not English, translates it
 * to English using Groq (llama-3.3-70b-versatile, already configured).
 *
 * Strategy:
 *  1. Send the first 500 characters to Groq for language detection.
 *  2. If English → return the original text unchanged (fast, no token cost).
 *  3. If non-English → split the full text into ~3 000-char chunks and
 *     translate each chunk with a single Groq call, then join them.
 *     Chunking avoids hitting Groq's context limits on very long transcripts.
 */
const { groqCall } = require('../utils/groq');

const CHUNK_SIZE = 3_000; // characters per translation chunk

const detectLanguage = async (sample) => {
  try {
    const reply = await groqCall(
      [
        {
          role: 'system',
          content:
            'You are a language detector. Respond with ONLY the ISO 639-1 language code ' +
            '(e.g. "en", "hi", "es", "fr", "zh", "ar"). No other text.',
        },
        { role: 'user', content: sample.slice(0, 500) },
      ],
      { maxTokens: 5, temperature: 0 }
    );
    return reply.trim().toLowerCase().slice(0, 2); // e.g. "hi"
  } catch (err) {
    log.warn('[YT/translate] Language detection failed — assuming English', err.message);
    return 'en';
  }
};

const translateChunk = (chunk, sourceLang) =>
  groqCall(
    [
      {
        role: 'system',
        content:
          `You are a professional translator. Translate the following ${sourceLang} text to English. ` +
          'Preserve the meaning exactly. Output ONLY the translated text — no commentary, no explanations.',
      },
      { role: 'user', content: chunk },
    ],
    { maxTokens: 4_096, temperature: 0.1, timeoutMs: 60_000 }
  );

const translateToEnglish = async (text, sourceLang) => {
  log.info(`[YT/translate] Translating from "${sourceLang}" to English (${text.length} chars)`);

  // Split into chunks at word boundaries
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    // Back up to the nearest space so we don't split mid-word
    if (end < text.length) {
      const spaceIdx = text.lastIndexOf(' ', end);
      if (spaceIdx > start) end = spaceIdx;
    }
    chunks.push(text.slice(start, end).trim());
    start = end + 1;
  }

  log.info(`[YT/translate] Translating ${chunks.length} chunk(s) via Groq`);

  // Translate chunks sequentially to avoid hammering the rate limit
  const translated = [];
  for (let i = 0; i < chunks.length; i++) {
    log.info(`[YT/translate] Chunk ${i + 1}/${chunks.length}`);
    const result = await translateChunk(chunks[i], sourceLang);
    translated.push(result.trim());
  }

  const joined = translated.join(' ');
  log.ok(`[YT/translate] Translation complete — ${joined.length} chars`);
  return joined;
};

// ── Extract text from YouTube ─────────────────────────────────────────────────
const extractFromYouTube = async (youtubeUrl) => {
  // Supports all 4 YouTube URL formats:
  //   youtube.com/watch?v=ID   — standard watch page
  //   youtube.com/embed/ID     — embedded iframes
  //   youtube.com/shorts/ID    — YouTube Shorts
  //   youtu.be/ID              — shortened links
  const idMatch = youtubeUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (!idMatch) {
    throw new Error(
      'Invalid YouTube URL. Supported formats:\n' +
      '  https://youtube.com/watch?v=VIDEO_ID\n' +
      '  https://youtube.com/embed/VIDEO_ID\n' +
      '  https://youtube.com/shorts/VIDEO_ID\n' +
      '  https://youtu.be/VIDEO_ID'
    );
  }
  const videoId = idMatch[1];

  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  const rawText    = transcript.map((item) => item.text).join(' ');

  // ── Language detection + translation ──────────────────────────────────────
  const lang = await detectLanguage(rawText);
  if (lang === 'en') {
    log.info('[YT/translate] Transcript is already English — no translation needed');
    return rawText;
  }

  log.info(`[YT/translate] Detected language: "${lang}" — translating to English`);
  return translateToEnglish(rawText, lang);
};

// ── Extract text from voice ───────────────────────────────────────────────────
const extractFromVoice = async (audioUrl) => {
  const buffer   = await fetchBuffer(audioUrl);
  const filename = audioUrl.split('/').pop().split('?')[0] || 'audio.mp3';
  return groqWhisper(buffer, filename);
};

// ── Extract images from PDF pages (non-fatal) ─────────────────────────────────
const extractImagesFromPDF = async (pdfUrl, options = {}) => {
  const { maxPages = 20 } = options;
  const results = { pageImages: [], embeddedImages: [] };
  let pdfjsLib;
  try {
    try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); }
    catch { pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs'); }
  } catch (err) { log.warn('pdfjs-dist unavailable — skipping image extraction', err.message); return results; }
  let buffer;
  try { buffer = await fetchBuffer(pdfUrl); } catch (err) { log.warn('Could not fetch PDF', err.message); return results; }
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true }).promise;
  let createCanvas;
  try { ({ createCanvas } = require('canvas')); const _t = createCanvas(4, 4); _t.getContext('2d'); }
  catch { log.warn('Canvas unavailable — skipping page image extraction'); return results; }
  for (let pg = 1; pg <= Math.min(pdfDoc.numPages, maxPages); pg++) {
    try {
      const page = await pdfDoc.getPage(pg);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
      const uploadResult = await new Promise((resolve, reject) => {
        const { Readable } = require('stream');
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'image', format: 'jpg', folder: 'notenexus/pdf-pages' },
          (err, result) => { if (err) reject(err); else resolve(result); }
        );
        Readable.from(jpegBuffer).pipe(stream);
      });
      results.pageImages.push(uploadResult.secure_url);
      page.cleanup();
    } catch (err) { log.warn(`Page ${pg} image render failed`, err.message); }
  }
  log.ok('Page images uploaded', { count: results.pageImages.length });
  return results;
};

module.exports = { extractFromImage, extractFromPDF, extractFromYouTube, extractFromVoice, extractImagesFromPDF };
