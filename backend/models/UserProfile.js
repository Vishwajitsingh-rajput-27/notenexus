// models/UserProfile.js
const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  // === STREAK & GAMIFICATION ===
  currentStreak:   { type: Number, default: 0 },
  longestStreak:   { type: Number, default: 0 },
  lastStudyDate:   { type: Date, default: null },
  xp:              { type: Number, default: 0 },
  level:           { type: Number, default: 1 },
  badges: [{
    id:       String,
    name:     String,
    icon:     String,
    earnedAt: Date,
  }],
  weeklyGoal:      { type: Number, default: 5 },
  weeklyProgress:  { type: Number, default: 0 },

  // === LEARNING PROFILE ===
  weakTopics: [{
    topic:      String,
    subject:    String,
    errorCount: Number,
    lastSeen:   Date,
  }],
  strongTopics: [{ topic: String, subject: String }],
  preferredStudyTime: { type: String, default: 'evening' },
  learningStyle:      { type: String, default: 'mixed' },
  avgSessionMinutes:  { type: Number, default: 0 },
  totalStudyMinutes:  { type: Number, default: 0 },

  // === SUBJECT READINESS SCORES ===
  subjectScores: [{
    subject:        String,
    readinessScore: { type: Number, default: 0 },
    notesCount:     Number,
    quizzesTaken:   Number,
    avgQuizScore:   Number,
    lastUpdated:    Date,
  }],

  // === PLAN ===
  plan:          { type: String, enum: ['free', 'pro', 'team'], default: 'free' },
  planExpiresAt: { type: Date, default: null },

  // === DEMO ===
  isDemoUser: { type: Boolean, default: false },

}, { timestamps: true });

module.exports = mongoose.model('UserProfile', userProfileSchema);
