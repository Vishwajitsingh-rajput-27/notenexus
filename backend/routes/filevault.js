// routes/filevault.js — Store & retrieve original files (PDF, image, voice, link)
const express     = require('express');
const router      = express.Router();
const auth        = require('../middleware/auth');
const FileVault   = require('../models/FileVault');
const { upload }  = require('../config/cloudinary');
const asyncHandler = require('express-async-handler');

// ── Upload original file ──────────────────────────────────────────────────────
// POST /api/vault/upload
router.post('/upload', auth, upload.single('file'), asyncHandler(async (req, res) => {
  const { name, subject, tags } = req.body;

  if (!req.file && !req.body.url) {
    return res.status(400).json({ error: 'Provide a file or URL' });
  }

  let fileType  = 'other';
  let mimeType  = '';
  let fileUrl   = '';
  let size      = 0;
  let thumbnail = '';

  if (req.body.url) {
    // Link upload
    fileType = 'link';
    fileUrl  = req.body.url;
    mimeType = 'text/uri-list';
  } else {
    fileUrl  = req.file.path;          // Cloudinary secure_url
    mimeType = req.file.mimetype || '';
    size     = req.file.size    || 0;

    if (mimeType === 'application/pdf')         fileType = 'pdf';
    else if (mimeType.startsWith('image/'))     fileType = 'image';
    else if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) fileType = 'voice';
    else                                         fileType = 'other';

    // For images use the file itself as thumbnail; for PDF use first page preview
    if (fileType === 'image') thumbnail = fileUrl;
    if (fileType === 'pdf') {
      // Cloudinary raw PDF — generate page-1 thumbnail via URL transformation
      thumbnail = ""; // FIX: PDFs stored as raw on Cloudinary — image transformations not supported on raw resources
    }
  }

  const entry = await FileVault.create({
    userId:  req.user._id,
    name:    name || req.file?.originalname || 'Untitled',
    fileType, mimeType, fileUrl,
    subject: subject || 'General',
    tags:    tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
    size, thumbnail,
    noteId:  req.body.noteId || null,
  });

  res.json({ success: true, file: entry });
}));

// ── Save link ─────────────────────────────────────────────────────────────────
// POST /api/vault/link
router.post('/link', auth, asyncHandler(async (req, res) => {
  const { url, name, subject, tags, linkTitle, linkMeta } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const entry = await FileVault.create({
    userId: req.user._id,
    name:   name || url,
    fileType: 'link',
    mimeType: 'text/uri-list',
    fileUrl:  url,
    subject:  subject || 'General',
    tags:     tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
    linkTitle: linkTitle || '',
    linkMeta:  linkMeta  || '',
  });

  res.json({ success: true, file: entry });
}));

// ── List files ────────────────────────────────────────────────────────────────
// GET /api/vault
router.get('/', auth, asyncHandler(async (req, res) => {
  const { type, subject, page = 1, limit = 20 } = req.query;
  const filter = { userId: req.user._id };
  if (type    && type    !== 'all') filter.fileType = type;
  if (subject && subject !== 'all') filter.subject  = subject;

  const [files, total] = await Promise.all([
    FileVault.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
    FileVault.countDocuments(filter),
  ]);

  // Summary counts per type
  const counts = await FileVault.aggregate([
    { $match: { userId: req.user._id } },
    { $group: { _id: '$fileType', count: { $sum: 1 } } },
  ]);
  const summary = { all: total };
  counts.forEach(c => { summary[c._id] = c.count; });

  res.json({ files, total, page: parseInt(page), summary });
}));

// ── Get single file ───────────────────────────────────────────────────────────
// GET /api/vault/:id
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const file = await FileVault.findOne({ _id: req.params.id, userId: req.user._id });
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.json({ file });
}));

// ── Delete file ───────────────────────────────────────────────────────────────
// DELETE /api/vault/:id
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const file = await FileVault.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.json({ success: true });
}));

// ── WhatsApp lookup endpoint (used by bot) ────────────────────────────────────
// GET /api/vault/wa/list?userId=...&type=...
router.get('/wa/list', asyncHandler(async (req, res) => {
  const { userId, type } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const filter = { userId };
  if (type && type !== 'all') filter.fileType = type;
  const files = await FileVault.find(filter).sort({ createdAt: -1 }).limit(15).select('name fileType fileUrl subject createdAt size');
  res.json({ files });
}));

module.exports = router;
