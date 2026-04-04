// models/GroupRoom.js
const mongoose = require('mongoose');

const groupRoomSchema = new mongoose.Schema({
  code:    { type: String, required: true, unique: true, uppercase: true },
  name:    { type: String, required: true },
  hostId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, default: 'General' },

  members: [{
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:     String,
    joinedAt: { type: Date, default: Date.now },
  }],

  activeQuiz: {
    isActive:        { type: Boolean, default: false },
    questions:       { type: mongoose.Schema.Types.Mixed, default: [] },
    currentQuestion: { type: Number, default: 0 },
    startedAt:       Date,
    leaderboard: [{
      userId:  String,
      name:    String,
      score:   Number,
      answers: [Boolean],
    }],
  },

  quizHistory: [{
    topic:       String,
    playedAt:    Date,
    playerCount: Number,
    winner:      String,
  }],

  maxMembers: { type: Number, default: 20 },
  isActive:   { type: Boolean, default: true },
  expiresAt:  { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },

}, { timestamps: true });

module.exports = mongoose.model('GroupRoom', groupRoomSchema);
