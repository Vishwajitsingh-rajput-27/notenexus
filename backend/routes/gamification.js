// routes/gamification.js — XP, streaks, badges, plan upgrades
const express      = require('express');
const router       = express.Router();
const auth         = require('../middleware/auth');
const UserProfile  = require('../models/UserProfile');
const StudySession = require('../models/StudySession');
const Note         = require('../models/Note');

const BADGES = {
  first_note:   { name: 'First Note',   icon: '📝', condition: 'Upload your first note' },
  streak_3:     { name: '3-Day Streak', icon: '🔥', condition: '3 consecutive study days' },
  streak_7:     { name: 'Week Warrior', icon: '⚡', condition: '7 consecutive study days' },
  streak_30:    { name: 'Month Master', icon: '🏆', condition: '30 consecutive study days' },
  quiz_master:  { name: 'Quiz Master',  icon: '🎯', condition: 'Score 100% on a quiz' },
  note_hoarder: { name: 'Note Hoarder', icon: '📚', condition: 'Upload 10 notes' },
  copilot_user: { name: 'AI Pilot',     icon: '🤖', condition: 'Use Study Copilot' },
  group_player: { name: 'Team Player',  icon: '👥', condition: 'Join a group study room' },
};

// GET /api/gamification/profile
router.get('/profile', auth, async (req, res) => {
  try {
    let profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) profile = await UserProfile.create({ userId: req.user._id });

    const level          = Math.floor((profile.xp || 0) / 500) + 1;
    const xpToNextLevel  = (level * 500) - (profile.xp || 0);
    const xpProgress     = ((profile.xp || 0) % 500) / 500 * 100;

    res.json({
      streak:         profile.currentStreak,
      longestStreak:  profile.longestStreak,
      xp:             profile.xp,
      level, xpToNextLevel,
      xpProgress:     Math.round(xpProgress),
      badges:         profile.badges,
      weeklyGoal:     profile.weeklyGoal,
      weeklyProgress: profile.weeklyProgress,
      plan:           profile.plan,
      allBadges:      BADGES,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gamification/check-badges
router.post('/check-badges', auth, async (req, res) => {
  try {
    const userId  = req.user._id;
    const profile = await UserProfile.findOne({ userId });
    if (!profile) return res.json({ newBadges: [] });

    const existing  = profile.badges.map(b => b.id);
    const newBadges = [];

    if (profile.currentStreak >= 3  && !existing.includes('streak_3'))  newBadges.push({ id: 'streak_3',  ...BADGES.streak_3,  earnedAt: new Date() });
    if (profile.currentStreak >= 7  && !existing.includes('streak_7'))  newBadges.push({ id: 'streak_7',  ...BADGES.streak_7,  earnedAt: new Date() });
    if (profile.currentStreak >= 30 && !existing.includes('streak_30')) newBadges.push({ id: 'streak_30', ...BADGES.streak_30, earnedAt: new Date() });

    const noteCount = await Note.countDocuments({ userId });
    if (noteCount >= 1  && !existing.includes('first_note'))   newBadges.push({ id: 'first_note',   ...BADGES.first_note,   earnedAt: new Date() });
    if (noteCount >= 10 && !existing.includes('note_hoarder')) newBadges.push({ id: 'note_hoarder', ...BADGES.note_hoarder, earnedAt: new Date() });

    const copilotUsed = await StudySession.exists({ userId, eventType: 'copilot_run' });
    if (copilotUsed && !existing.includes('copilot_user')) newBadges.push({ id: 'copilot_user', ...BADGES.copilot_user, earnedAt: new Date() });

    const perfectQuiz = await StudySession.exists({ userId, eventType: 'quiz_complete', quizScore: 100 });
    if (perfectQuiz && !existing.includes('quiz_master')) newBadges.push({ id: 'quiz_master', ...BADGES.quiz_master, earnedAt: new Date() });

    if (newBadges.length > 0) {
      await UserProfile.findOneAndUpdate({ userId }, { $push: { badges: { $each: newBadges } } });
    }

    res.json({ newBadges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gamification/upgrade-plan
router.post('/upgrade-plan', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['pro', 'team'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    await UserProfile.findOneAndUpdate(
      { userId: req.user._id },
      { plan, planExpiresAt: new Date(Date.now() + 30 * 86400000) },
      { upsert: true }
    );
    res.json({ success: true, plan, message: `Upgraded to ${plan}! All features unlocked.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
