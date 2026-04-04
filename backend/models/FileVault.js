// models/FileVault.js — Store original files (PDF, image, voice, link)
const mongoose = require('mongoose');

const fileVaultSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  noteId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Note', default: null },

  name:      { type: String, required: true },          // user-visible filename
  fileType:  { type: String, enum: ['pdf', 'image', 'voice', 'link', 'other'], required: true },
  mimeType:  { type: String, default: '' },             // e.g. application/pdf
  fileUrl:   { type: String, required: true },          // Cloudinary or raw URL
  subject:   { type: String, default: 'General' },
  tags:      [String],
  size:      { type: Number, default: 0 },             // bytes
  duration:  { type: Number, default: null },           // seconds (for audio)
  thumbnail: { type: String, default: '' },             // preview image URL

  // For links
  linkTitle: { type: String, default: '' },
  linkMeta:  { type: String, default: '' },

}, { timestamps: true });

fileVaultSchema.index({ userId: 1, fileType: 1 });
fileVaultSchema.index({ userId: 1, subject: 1 });

module.exports = mongoose.model('FileVault', fileVaultSchema);
