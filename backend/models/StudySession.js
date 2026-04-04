// models/StudySession.js
const mongoose = require('mongoose');

const studySessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  eventType: {
    type: String,
    enum: [
      'note_upload', 'note_view', 'flashcard_flip', 'flashcard_complete',
      'quiz_start', 'quiz_complete', 'tutor_message', 'exam_predict',
      'mindmap_view', 'copilot_run', 'group_quiz', 'search',
    ],
    required: true,
  },

  subject:     { type: String, default: 'General' },
  topic:       { type: String, default: '' },

  quizScore:   { type: Number, default: null },
  quizTotal:   { type: Number, default: null },
  quizCorrect: { type: Number, default: null },

  durationMs:  { type: Number, default: 0 },
  xpAwarded:   { type: Number, default: 0 },

  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now, index: true },
});

studySessionSchema.index({ userId: 1, createdAt: -1 });
studySessionSchema.index({ userId: 1, eventType: 1 });
studySessionSchema.index({ userId: 1, subject: 1 });

module.exports = mongoose.model('StudySession', studySessionSchema);
