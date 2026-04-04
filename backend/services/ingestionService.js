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
 * YoutubeTranscript — HTML-scrape strategy (primary) + youtubei.js (fallback)
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMARY:  Fetch the YouTube watch page, parse ytInitialPlayerResponse from
 *           the page HTML, extract the caption track URL, then fetch the
 *           timed-text JSON directly.  Zero extra npm packages required.
 *           Works on Render/Vercel because it looks exactly like a browser
 *           page-load (uses BROWSER_HEADERS defined above).
 *
 * FALLBACK: youtubei.js Innertube client — kept in case YouTube changes its
 *           page structure.  It is ESM-only so we load it with dynamic import.
 *           Note: Innertube's /youtubei/v1/get_transcript endpoint is sometimes
 *           blocked on cloud IPs, hence it is second rather than primary.
 *
 * Both strategies return the same shape: Array<{ text: string }>
 */

// ── Strategy 1: scrape ytInitialPlayerResponse from the HTML page ─────────────
const fetchTranscriptViaHTML = async (videoId) => {
  const url  = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const html = (await fetchYouTube(url)).toString('utf8');

  // Locate ytInitialPlayerResponse JSON object in the page script
  const marker   = 'ytInitialPlayerResponse=';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) throw new Error('ytInitialPlayerResponse not found in page HTML');

  // Walk forward from the opening brace to find the matching closing brace
  const jsonStart  = html.indexOf('{', markerIdx);
  if (jsonStart === -1) throw new Error('Could not locate JSON in ytInitialPlayerResponse');
  let depth = 0, jsonEnd = jsonStart;
  for (let i = jsonStart; i < html.length; i++) {
    if      (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
  }

  let playerResponse;
  try { playerResponse = JSON.parse(html.slice(jsonStart, jsonEnd + 1)); }
  catch (e) { throw new Error(`Failed to parse ytInitialPlayerResponse: ${e.message}`); }

  // Pull the caption track list
  const captionTracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captionTracks || captionTracks.length === 0)
    throw new Error('No captions/subtitles available for this YouTube video');

  // Prefer: manual English → auto English → any track
  const track =
    captionTracks.find(t => t.languageCode === 'en' && !t.kind) ||
    captionTracks.find(t => t.languageCode === 'en')            ||
    captionTracks[0];

  // Fetch captions as JSON3 (structured timed-text)
  const captionUrl  = `${track.baseUrl}&fmt=json3`;
  const captionData = JSON.parse((await fetchYouTube(captionUrl)).toString('utf8'));

  const events = captionData.events || [];
  return events
    .filter(e => e.segs && e.segs.some(s => s.utf8 && s.utf8.trim()))
    .map(e => ({
      text: e.segs.map(s => (s.utf8 || '').replace(/\n/g, ' ')).join('').trim(),
    }))
    .filter(item => item.text);
};

// ── Strategy 2: youtubei.js Innertube client (ESM, loaded lazily) ─────────────
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

// ── Combined facade ───────────────────────────────────────────────────────────
const YoutubeTranscript = {
  fetchTranscript: async (videoId) => {
    try {
      log.info(`[YT] Trying HTML-scrape strategy for ${videoId}`);
      const result = await fetchTranscriptViaHTML(videoId);
      log.ok(`[YT] HTML-scrape succeeded — ${result.length} segments`);
      return result;
    } catch (htmlErr) {
      log.warn(`[YT] HTML-scrape failed (${htmlErr.message}) — falling back to Innertube`);
      try {
        const result = await fetchTranscriptViaInnertube(videoId);
        log.ok(`[YT] Innertube fallback succeeded — ${result.length} segments`);
        return result;
      } catch (innerErr) {
        log.error('[YT] Both strategies failed', { htmlErr: htmlErr.message, innerErr: innerErr.message });
        throw new Error(
          `Could not fetch transcript for this video.\n` +
          `HTML strategy: ${htmlErr.message}\n` +
          `Innertube strategy: ${innerErr.message}`
        );
      }
    }
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
