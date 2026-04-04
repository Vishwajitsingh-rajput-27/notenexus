const log = require('../utils/logger')('notes');
const express      = require('express');
const asyncHandler = require('express-async-handler');
const Note         = require('../models/Note');
const protect      = require('../middleware/auth');
const { upload }   = require('../config/cloudinary');
const {
  extractFromImage,
  extractFromPDF,
  extractFromYouTube,
  extractFromVoice,
  extractImagesFromPDF,
} = require('../services/ingestionService');
const { detectSubjectChapter, translateToEnglish } = require('../services/aiService');
const { storeEmbedding, deleteEmbedding } = require('../services/vectorService');
const { v4: uuidv4 } = require('uuid');
const FileVault = require('../models/FileVault');

const router = express.Router();
router.use(protect);

// ── POST /api/notes/upload ─────────────────────────────────────────────────
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const { sourceType, youtubeUrl, title } = req.body;
  const userId = req.user._id.toString();

  let extractedText   = '';
  let fileUrl         = '';
  let extractedImages = [];

  if (sourceType === 'youtube' && youtubeUrl) {
    extractedText = await extractFromYouTube(youtubeUrl);
    fileUrl       = youtubeUrl;

  } else if (req.file) {
    fileUrl = req.file.path; // Cloudinary secure_url

    if (sourceType === 'pdf') {
      const [text, imgResult] = await Promise.all([
        extractFromPDF(fileUrl),
        extractImagesFromPDF(fileUrl, { maxPages: 20, extractEmbedded: true })
          .catch((err) => {
            log.warn('extractImagesFromPDF failed (non-fatal)', err.message);
            return { pageImages: [], embeddedImages: [] };
          }),
      ]);
      extractedText   = text;
      extractedImages = [...imgResult.pageImages, ...imgResult.embeddedImages];
    }

    if (sourceType === 'image') extractedText = await extractFromImage(fileUrl);
    if (sourceType === 'voice') extractedText = await extractFromVoice(fileUrl);

  } else {
    return res.status(400).json({ message: 'Provide a file or YouTube URL' });
  }

  if (!extractedText || !extractedText.trim()) {
    return res.status(422).json({ message: 'Could not extract text from source. For scanned PDFs, ensure GEMINI_API_KEY is set.' });
  }

  const englishText = await translateToEnglish(extractedText);
  const meta        = await detectSubjectChapter(englishText);
  const noteId      = uuidv4();
  const autoTitle   = title || `${meta.subject} — ${meta.chapter}`;
  const wordCount   = englishText.trim().split(/\s+/).filter(Boolean).length;

  const note = await Note.create({
    userId,
    title:           autoTitle,
    content:         englishText,
    sourceType,
    fileUrl,
    subject:         meta.subject,
    chapter:         meta.chapter,
    keywords:        meta.keywords || [],
    pineconeId:      noteId,
    extractedImages,
    wordCount,
  });

  // Auto-save to FileVault (non-fatal)
  if (req.file && fileUrl) {
    const mime = req.file.mimetype || '';
    let fileType = 'other';
    if (sourceType === 'pdf')   fileType = 'pdf';
    if (sourceType === 'image') fileType = 'image';
    if (sourceType === 'voice') fileType = 'voice';
    // FIX: PDFs are stored as 'raw' on Cloudinary — image transformations don't work on raw resources.
    // Use the fileUrl directly as thumbnail for images; skip thumbnail for PDFs.
    const thumbnail = fileType === 'image' ? fileUrl : '';
    FileVault.create({
      userId: userId.toString(),
      noteId: note._id,
      name: autoTitle,
      fileType, mimeType: mime,
      fileUrl, subject: meta.subject,
      tags: meta.keywords || [],
      size: req.file.size || 0,
      thumbnail,
    }).catch(() => {});
  }

  // Pinecone is non-fatal — if it fails, upload still succeeds
  storeEmbedding(noteId, englishText, {
    userId,
    noteId:    note._id.toString(),
    subject:   meta.subject,
    chapter:   meta.chapter,
    sourceType,
    fileUrl,
    title:     autoTitle,
  }).catch((err) => log.warn('storeEmbedding failed (non-fatal)', err.message));

  res.status(201).json({
    noteId:         note._id,
    title:          autoTitle,
    subject:        meta.subject,
    chapter:        meta.chapter,
    keywords:       meta.keywords,
    sourceType,
    fileUrl,
    extractedImages,
    imageCount:     extractedImages.length,
    preview:        englishText.slice(0, 300),
    wordCount,
  });
}));

// ── GET /api/notes/subjects — MUST be before /:id ─────────────────────────
router.get('/subjects', asyncHandler(async (req, res) => {
  const subjects = await Note.distinct('subject', { userId: req.user._id });
  res.json({ subjects });
}));

// ── GET /api/notes/shared — MUST be before /:id ───────────────────────────
router.get('/shared', asyncHandler(async (req, res) => {
  const notes = await Note.find({ isShared: true })
    .sort({ upvotes: -1 })
    .limit(30)
    .select('-content')
    .populate('userId', 'name');
  res.json({ notes, count: notes.length });
}));

// ── GET /api/notes/:id/images ─────────────────────────────────────────────────
router.get('/:id/images', asyncHandler(async (req, res) => {
  const note = await Note.findOne(
    { _id: req.params.id, userId: req.user._id },
    'extractedImages fileUrl title sourceType'
  );
  if (!note) return res.status(404).json({ message: 'Note not found' });
  res.json({
    noteId: note._id,
    title:  note.title,
    extractedImages: note.extractedImages || [],
    imageCount: (note.extractedImages || []).length,
  });
}));

// ── GET /api/notes ─────────────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { subject, limit = 50 } = req.query;
  const query = { userId: req.user._id };
  if (subject) query.subject = subject;
  const notes = await Note.find(query).sort({ createdAt: -1 }).limit(Number(limit)).select('-content');
  res.json({ notes, count: notes.length });
}));

// ── GET /api/notes/:id ─────────────────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const note = await Note.findOne({ _id: req.params.id, userId: req.user._id });
  if (!note) return res.status(404).json({ message: 'Note not found' });
  res.json(note);
}));

// ── DELETE /api/notes/:id ──────────────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!note) return res.status(404).json({ message: 'Note not found' });
  if (note.pineconeId) deleteEmbedding(note.pineconeId).catch(() => {});
  res.json({ success: true });
}));

// ── PATCH /api/notes/:id/share ─────────────────────────────────────────────
router.patch('/:id/share', asyncHandler(async (req, res) => {
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isShared: req.body.shared },
    { new: true }
  );
  if (!note) return res.status(404).json({ message: 'Note not found' });
  res.json({ isShared: note.isShared });
}));

// ── POST /api/notes/:id/upvote ─────────────────────────────────────────────
router.post('/:id/upvote', asyncHandler(async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ message: 'Note not found' });
  const uid    = req.user._id.toString();
  const already = note.upvotedBy.map(String).includes(uid);
  if (already) {
    note.upvotes   -= 1;
    note.upvotedBy  = note.upvotedBy.filter(id => id.toString() !== uid);
  } else {
    note.upvotes   += 1;
    note.upvotedBy.push(req.user._id);
  }
  await note.save();
  res.json({ upvotes: note.upvotes, upvoted: !already });
}));

module.exports = router;
