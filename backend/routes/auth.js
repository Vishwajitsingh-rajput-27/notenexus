const express = require('express');
const jwt     = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User    = require('../models/User');
const Note        = require('../models/Note');
const UserProfile = require('../models/UserProfile');
const protect = require('../middleware/auth');

const router = express.Router();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// Helper: build safe user object — always uses _id so the frontend store works
const safeUser = (u) => ({
  _id:   u._id,
  id:    u._id,      // keep both for backwards compatibility
  name:  u.name,
  email: u.email,
  avatar: u.avatar || '',
});

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already registered' });
  const user = await User.create({ name, email, password });
  // Auto-create learning profile
  UserProfile.create({ userId: user._id }).catch(() => {});
  res.status(201).json({ token: signToken(user._id), user: safeUser(user) });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const user = await User.findOne({ email });
  if (!user || !(await user.matchPassword(password))) return res.status(401).json({ message: 'Invalid email or password' });
  res.json({ token: signToken(user._id), user: safeUser(user) });
}));

// GET /api/auth/me
router.get('/me', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json(safeUser(user));
}));

// PATCH /api/auth/profile — update name and email
router.patch('/profile', protect, asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (email && email !== user.email) {
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already in use' });
    user.email = email;
  }
  if (name) user.name = name;
  await user.save();

  res.json(safeUser(user));
}));

// PATCH /api/auth/password — change password
router.patch('/password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' });

  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated successfully' });
}));

// GET /api/auth/stats — user stats and history
router.get('/stats', protect, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const notes = await Note.find({ userId }).sort({ createdAt: -1 }).select('-content');

  const totalNotes = notes.length;
  const totalWords = notes.reduce((sum, n) => sum + (n.wordCount || 0), 0);

  const byType = notes.reduce((acc, n) => {
    acc[n.sourceType] = (acc[n.sourceType] || 0) + 1;
    return acc;
  }, {});

  const bySubject = notes.reduce((acc, n) => {
    if (n.subject) acc[n.subject] = (acc[n.subject] || 0) + 1;
    return acc;
  }, {});

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCount = notes.filter(n => new Date(n.createdAt) > sevenDaysAgo).length;

  const totalSubjects = Object.keys(bySubject).length;
  const sharedNotes = notes.filter(n => n.isShared).length;
  const subjectBreakdown = Object.entries(bySubject).map(([subject, count]) => ({ subject, count }));

  const createdAt = req.user.createdAt || new Date();
  const accountAge = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));

  const history = notes.map(n => ({
    id:         n._id,
    title:      n.title,
    subject:    n.subject,
    chapter:    n.chapter,
    sourceType: n.sourceType,
    keywords:   n.keywords,
    wordCount:  n.wordCount || 0,
    isShared:   n.isShared,
    upvotes:    n.upvotes,
    createdAt:  n.createdAt,
    fileUrl:    n.fileUrl,
  }));

  res.json({
    stats: {
      totalNotes, totalWords, totalSubjects, sharedNotes,
      byType, bySubject, subjectBreakdown,
      recentCount, accountAge, memberSince: createdAt,
    },
    history,
  });
}));

module.exports = router;
