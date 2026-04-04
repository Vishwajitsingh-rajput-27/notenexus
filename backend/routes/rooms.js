// routes/rooms.js — Group Study Rooms
const express   = require('express');
const router    = express.Router();
const auth      = require('../middleware/auth');
const GroupRoom = require('../models/GroupRoom');
const { groqCall, extractJSON } = require('../utils/groq');

const generateCode = () => Math.random().toString(36).substr(2, 6).toUpperCase();

// ── Helper: create a room ─────────────────────────────────────────────────
async function createRoom(req, res) {
  try {
    const { name, subject } = req.body;
    let code = generateCode();
    while (await GroupRoom.exists({ code })) code = generateCode();

    const room = await GroupRoom.create({
      code,
      name:    name || `${subject || 'Study'} Room`,
      hostId:  req.user._id,
      subject: subject || 'General',
      members: [{ userId: req.user._id, name: req.user.name }],
    });

    res.json({
      success: true,
      room: { code: room.code, name: room.name, subject: room.subject, id: room._id, hostId: room.hostId },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/rooms — list rooms the user has joined ───────────────────────
// FIX: This route was missing — frontend apiGetRooms() calls GET /rooms
router.get('/', auth, async (req, res) => {
  try {
    const rooms = await GroupRoom.find({
      'members.userId': req.user._id,
      isActive: true,
    }).sort({ updatedAt: -1 }).limit(20);

    res.json({
      rooms: rooms.map(r => ({
        id:      r._id,
        code:    r.code,
        name:    r.name,
        subject: r.subject,
        members: r.members.length,
        hostId:  r.hostId,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rooms — create room (alias for /create) ─────────────────────
// FIX: This route was missing — frontend apiCreateRoom() calls POST /rooms
router.post('/', auth, createRoom);

// ── POST /api/rooms/create ─────────────────────────────────────────────────
router.post('/create', auth, createRoom);

// ── POST /api/rooms/join ───────────────────────────────────────────────────
router.post('/join', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const room = await GroupRoom.findOne({ code: code?.toUpperCase(), isActive: true });
    if (!room) return res.status(404).json({ error: 'Room not found or expired' });
    if (room.members.length >= room.maxMembers) return res.status(400).json({ error: 'Room is full' });

    const alreadyIn = room.members.some(m => m.userId.toString() === req.user._id.toString());
    if (!alreadyIn) {
      room.members.push({ userId: req.user._id, name: req.user.name });
      await room.save();
    }

    res.json({
      success: true,
      room: {
        code: room.code, name: room.name, subject: room.subject,
        id: room._id, members: room.members.length, hostId: room.hostId,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:code ───────────────────────────────────────────────────
router.get('/:code', auth, async (req, res) => {
  try {
    const room = await GroupRoom.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rooms/:code/generate-quiz ───────────────────────────────────
router.post('/:code/generate-quiz', auth, async (req, res) => {
  try {
    const { topic, count = 5 } = req.body;
    const room = await GroupRoom.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the host can start a quiz' });
    }

    const raw = await groqCall(
      `Generate a ${count}-question live quiz on "${topic}" for ${room.subject}.
Return ONLY a JSON array:
[{"q":"...","options":["A)...","B)...","C)...","D)..."],"answer":"A","explanation":"...","timeLimit":20}]`,
      { maxTokens: 1500 }
    );

    const questions = extractJSON(raw, 'array');
    if (!questions?.length) return res.status(500).json({ error: 'Quiz generation failed' });

    room.activeQuiz = {
      isActive: true, questions, currentQuestion: 0, startedAt: new Date(),
      leaderboard: room.members.map(m => ({ userId: m.userId.toString(), name: m.name, score: 0, answers: [] })),
    };
    await room.save();

    res.json({ success: true, quiz: { questions, total: questions.length, roomCode: room.code } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
