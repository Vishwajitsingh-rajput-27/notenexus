// routes/demo.js — Demo mode with preloaded data
const express      = require('express');
const router       = express.Router();
const User         = require('../models/User');
const Note         = require('../models/Note');
const UserProfile  = require('../models/UserProfile');
const StudySession = require('../models/StudySession');
const jwt          = require('jsonwebtoken');

const DEMO_EMAIL = process.env.DEMO_EMAIL    || 'demo@notenexus.ai';
const DEMO_PASS  = process.env.DEMO_PASSWORD || 'Demo@NoteNexus2024!';

router.post('/activate', async (req, res) => {
  try {
    let user = await User.findOne({ email: DEMO_EMAIL });
    if (!user) {
      user = await User.create({ name: 'Alex (Demo)', email: DEMO_EMAIL, password: DEMO_PASS });
    }

    const noteCount = await Note.countDocuments({ userId: user._id });
    if (noteCount < 5) {
      await Note.insertMany([
        { userId: user._id, title: "Newton's Laws of Motion", subject: 'Physics', chapter: 'Mechanics', sourceType: 'text', wordCount: 72, content: "Newton's First Law: An object at rest stays at rest unless acted upon by a net external force.\n\nNewton's Second Law: F = ma. Force equals mass times acceleration.\n\nNewton's Third Law: For every action there is an equal and opposite reaction.\n\nImportant formulas:\n- F = ma\n- W = mg (g = 9.8 m/s²)\n- Momentum p = mv", keywords: ['force', 'mass', 'acceleration', 'momentum'] },
        { userId: user._id, title: 'Quadratic Equations', subject: 'Mathematics', chapter: 'Algebra', sourceType: 'text', wordCount: 54, content: 'A quadratic equation has the form ax² + bx + c = 0\n\nQuadratic Formula: x = (-b ± √(b²-4ac)) / 2a\n\nDiscriminant (b²-4ac):\n- Positive: 2 real roots\n- Zero: 1 real root\n- Negative: 2 complex roots', keywords: ['quadratic', 'formula', 'discriminant'] },
        { userId: user._id, title: 'Organic Chemistry — Hydrocarbons', subject: 'Chemistry', chapter: 'Organic Chemistry', sourceType: 'text', wordCount: 58, content: 'Hydrocarbons: compounds containing only Carbon and Hydrogen\n\nTypes:\n1. Alkanes (CₙH₂ₙ₊₂) - saturated\n2. Alkenes (CₙH₂ₙ) - one double bond\n3. Alkynes (CₙH₂ₙ₋₂) - triple bond\n\nReactions:\n- Combustion: hydrocarbon + O₂ → CO₂ + H₂O', keywords: ['alkane', 'alkene', 'organic', 'hydrocarbon'] },
        { userId: user._id, title: 'Cell Biology — Structure and Function', subject: 'Biology', chapter: 'Cell Biology', sourceType: 'text', wordCount: 62, content: 'Cell Theory:\n1. All living things are made of cells\n2. Cell is the basic unit of life\n\nKey Organelles:\n- Nucleus: contains DNA\n- Mitochondria: ATP production\n- Ribosome: protein synthesis\n- Golgi Apparatus: packaging', keywords: ['cell', 'organelle', 'mitochondria', 'nucleus'] },
        { userId: user._id, title: 'Thermodynamics Basics', subject: 'Physics', chapter: 'Thermodynamics', sourceType: 'text', wordCount: 48, content: 'Laws of Thermodynamics:\n1st Law: Energy cannot be created or destroyed (conservation)\n2nd Law: Entropy of isolated system always increases\n3rd Law: Entropy approaches zero as temp approaches absolute zero\n\nHeat transfer: Conduction, Convection, Radiation', keywords: ['entropy', 'heat', 'thermodynamics', 'energy'] },
      ]);
    }

    let profile = await UserProfile.findOne({ userId: user._id });
    if (!profile) {
      const now = new Date();
      profile = await UserProfile.create({
        userId: user._id,
        currentStreak: 14, longestStreak: 21,
        lastStudyDate: new Date(now - 86400000),
        xp: 2340, level: 5,
        badges: [
          { id: 'first_note',   name: 'First Note',   icon: '📝', earnedAt: new Date(now - 20 * 86400000) },
          { id: 'streak_7',     name: 'Week Warrior', icon: '⚡', earnedAt: new Date(now -  7 * 86400000) },
          { id: 'note_hoarder', name: 'Note Hoarder', icon: '📚', earnedAt: new Date(now -  5 * 86400000) },
        ],
        weeklyGoal: 5, weeklyProgress: 3,
        plan: 'pro', isDemoUser: true,
        weakTopics: [
          { topic: 'Organic Reactions', subject: 'Chemistry',   errorCount: 4, lastSeen: new Date() },
          { topic: 'Complex Numbers',   subject: 'Mathematics', errorCount: 3, lastSeen: new Date() },
        ],
        subjectScores: [
          { subject: 'Physics',     readinessScore: 72, notesCount: 2, quizzesTaken: 5, avgQuizScore: 68 },
          { subject: 'Mathematics', readinessScore: 85, notesCount: 1, quizzesTaken: 8, avgQuizScore: 82 },
          { subject: 'Chemistry',   readinessScore: 54, notesCount: 1, quizzesTaken: 3, avgQuizScore: 51 },
          { subject: 'Biology',     readinessScore: 78, notesCount: 1, quizzesTaken: 6, avgQuizScore: 76 },
        ],
        totalStudyMinutes: 847,
      });
    }

    const sessionCount = await StudySession.countDocuments({ userId: user._id });
    if (sessionCount < 20) {
      const events   = ['note_view', 'flashcard_complete', 'quiz_complete', 'tutor_message', 'exam_predict'];
      const subjects = ['Physics', 'Mathematics', 'Chemistry', 'Biology'];
      const sessions = [];
      for (let i = 0; i < 30; i++) {
        sessions.push({
          userId:    user._id,
          eventType: events[i % events.length],
          subject:   subjects[i % subjects.length],
          quizScore: i % events.length === 2 ? Math.floor(Math.random() * 40 + 50) : null,
          xpAwarded: 10,
          createdAt: new Date(Date.now() - i * 86400000 * 0.7),
        });
      }
      await StudySession.insertMany(sessions);
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // FIX: Return both _id and id for store compatibility
    // FIX: Include isDemo: true so the frontend store preserves it and
    //      DemoModeBanner renders on the dashboard.
    res.json({
      success: true, token,
      user: { _id: user._id, id: user._id, name: user.name, email: user.email, isDemo: true },
      message: '🎮 Demo mode activated! Explore all features with pre-loaded data.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
