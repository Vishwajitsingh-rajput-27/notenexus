const log = require('../utils/logger')('ingestion');

/**
 * ingestionService.js  —  NoteNexus
 *
 * YouTube transcript fix
 * ──────────────────────
 * `youtube-transcript@1.2.1` declares "type":"module" (ESM) in its own
 * package.json but its compiled output uses `exports.xxx = ...` (CommonJS).
 * Node.js therefore throws "exports is not defined in ES module scope" on
 * every call — both require() and dynamic import() fail.
 *
 * Solution: replace it with `youtubei.js` (npm: youtubei.js, GitHub: LuanRT/YouTube.js).
 * This library implements the full YouTube Innertube client correctly:
 *   • Generates valid visitorData tokens locally  →  no 400 failedPrecondition
 *   • Handles the PoToken bot-detection challenge  →  no empty responses
 *   • Tracks the current clientVersion automatically  →  no stale-key errors
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
 * YoutubeTranscript shim backed by youtubei.js
 * ─────────────────────────────────────────────
 * Exposes exactly the same API as the broken `youtube-transcript` package:
 *   { YoutubeTranscript } with a static fetchTranscript(videoId) method
 *   that returns an array of { text: string } items.
 *
 * Why not require('youtube-transcript')?
 *   It declares "type":"module" (ESM) but its dist uses `exports.xxx = ...`
 *   (CommonJS syntax), so Node throws "exports is not defined" on both
 *   require() and dynamic import().  The package is fundamentally broken.
 *
 * Why youtubei.js?
 *   It is a complete Innertube client — generates valid visitorData, handles
 *   PoToken, auto-tracks clientVersion — so it never gets 400/429 from YouTube.
 *   It is ESM-only, which is why we load it via dynamic import().
 *   The Innertube instance is cached so the ~200 ms init cost is paid once.
 */
let _yt = null;
const getYT = async () => {
  if (_yt) return _yt;
  const { Innertube } = await import('youtubei.js');
  _yt = await Innertube.create({ generate_session_locally: true });
  return _yt;
};

const YoutubeTranscript = {
  /**
   * Returns an array of { text } objects — identical shape to what the
   * original youtube-transcript package returned, so all callers work
   * without any other changes.
   */
  fetchTranscript: async (videoId) => {
    const yt             = await getYT();
    const info           = await yt.getInfo(videoId);
    const transcriptData = await info.getTranscript();

    // youtubei.js transcript response tree (stable across v9/v10)
    const body = transcriptData?.transcript?.content?.body ?? transcriptData?.content?.body;
    if (!body) throw new Error('No transcript available for this YouTube video');

    const segments = body.initial_segments ?? body.segments ?? [];
    if (!segments.length) throw new Error('No transcript available for this YouTube video');

    // Map to { text } — same shape as the original youtube-transcript items
    return segments.map(s => ({
      text: (
        s?.snippet?.text ??
        s?.transcriptSegmentRenderer?.snippet?.runs?.map(r => r.text).join('') ??
        ''
      ).trim(),
    })).filter(item => item.text);
  },
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
  return transcript.map((item) => item.text).join(' ');
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
