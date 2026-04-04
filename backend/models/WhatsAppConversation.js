/**
 * models/WhatsAppConversation.js
 *
 * Stores per-user conversation history so the bot remembers
 * what was said earlier in the same chat session.
 *
 * Each document holds the last MAX_MESSAGES messages for one phone number.
 * Old conversations expire automatically after 24 hours of inactivity
 * (MongoDB TTL index on `updatedAt`).
 */

const mongoose = require('mongoose');

const MAX_MESSAGES = 20; // keep last 20 turns (10 user + 10 bot)

const messageSchema = new mongoose.Schema(
  {
    role:    { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    ts:      { type: Date,   default: Date.now },
  },
  { _id: false }
);

const whatsAppConversationSchema = new mongoose.Schema(
  {
    // Twilio format:  "whatsapp:+919876543210"
    phone: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },

    // Optional — populated when the user links their NoteNexus account
    userId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   'User',
      index: true,
    },

    messages: {
      type:    [messageSchema],
      default: [],
    },

    // Tracks when the conversation was last active — used by the TTL index
    updatedAt: {
      type:    Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// ── TTL: auto-delete conversations that have been idle for 24 hours ─────────
whatsAppConversationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86_400 });

// ── Helper: append a message and trim to MAX_MESSAGES ──────────────────────
whatsAppConversationSchema.methods.addMessage = function (role, content) {
  this.messages.push({ role, content });
  if (this.messages.length > MAX_MESSAGES) {
    this.messages = this.messages.slice(-MAX_MESSAGES);
  }
  this.updatedAt = new Date();
};

// ── Helper: return only the role/content pairs (for the Groq prompt) ───────
whatsAppConversationSchema.methods.getHistory = function () {
  return this.messages.map(({ role, content }) => ({ role, content }));
};

const WhatsAppConversation = mongoose.model(
  'WhatsAppConversation',
  whatsAppConversationSchema
);

module.exports = WhatsAppConversation;
