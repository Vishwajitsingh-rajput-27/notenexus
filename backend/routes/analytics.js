// routes/analytics.js — Performance dashboard data
const express      = require('express');
const router       = express.Router();
const auth         = require('../middleware/auth');
const StudySession = require('../models/StudySession');
const UserProfile  = require('../models/UserProfile');
const Note         = require('../models/Note');

// GET /api/analytics/dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const now    = new Date();
    const d30    = new Date(now - 30 * 86400000);
    const d7     = new Date(now -  7 * 86400000);

    const [profile, sessions30, notesCount, subjectBreakdown] = await Promise.all([
      UserProfile.findOne({ userId }),
      StudySession.find({ userId, createdAt: { $gte: d30 } }),
      Note.countDocuments({ userId }),
      Note.aggregate([
        { $match: { userId } },
        { $group: { _id: '$subject', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);

    const heatmap = {};
    sessions30.forEach(s => {
      const day = s.createdAt.toISOString().split('T')[0];
      heatmap[day] = (heatmap[day] || 0) + 1;
    });

    const quizSessions = sessions30.filter(s => s.eventType === 'quiz_complete' && s.quizScore !== null);
    const avgQuizScore = quizSessions.length
      ? Math.round(quizSessions.reduce((a, b) => a + b.quizScore, 0) / quizSessions.length) : 0;

    const daily = {};
    sessions30.filter(s => s.createdAt >= d7).forEach(s => {
      const day = s.createdAt.toISOString().split('T')[0];
      daily[day] = (daily[day] || 0) + 1;
    });

    const subjectTime = {};
    sessions30.forEach(s => {
      if (s.subject) subjectTime[s.subject] = (subjectTime[s.subject] || 0) + 1;
    });

    res.json({
      profile: {
        streak:        profile?.currentStreak || 0,
        longestStreak: profile?.longestStreak  || 0,
        xp:            profile?.xp             || 0,
        level:         profile?.level          || 1,
        badges:        profile?.badges         || [],
        plan:          profile?.plan           || 'free',
        weeklyGoal:    profile?.weeklyGoal     || 5,
        weeklyProgress:profile?.weeklyProgress || 0,
      },
      stats: {
        notesCount,
        totalSessions: sessions30.length,
        avgQuizScore,
        totalXP:       profile?.xp || 0,
        studyDays:     Object.keys(heatmap).length,
      },
      heatmap,
      daily:       Object.entries(daily).map(([date, count]) => ({ date, count })),
      subjects:    subjectBreakdown.map(s => ({ name: s._id, count: s.count })),
      subjectTime: Object.entries(subjectTime).map(([name, count]) => ({ name, count })),
      weakTopics:  profile?.weakTopics?.slice(0, 5) || [],
      subjectScores: profile?.subjectScores || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/readiness/:subject
router.get('/readiness/:subject', auth, async (req, res) => {
  try {
    const { subject } = req.params;
    const userId = req.user._id;

    const [notes, quizSessions, profile] = await Promise.all([
      Note.find({ userId, subject }),
      StudySession.find({ userId, subject, eventType: 'quiz_complete' }),
      UserProfile.findOne({ userId }),
    ]);

    const notesCoverage = Math.min((notes.length / 5) * 100, 100);
    const avgQuiz = quizSessions.length
      ? quizSessions.reduce((a, b) => a + (b.quizScore || 0), 0) / quizSessions.length : 0;

    const d14 = new Date(Date.now() - 14 * 86400000);
    const recentSessions = await StudySession.countDocuments({ userId, subject, createdAt: { $gte: d14 } });
    const consistency = Math.min((recentSessions / 10) * 100, 100);
    const copilotUsed = await StudySession.exists({ userId, subject, eventType: 'copilot_run' }) ? 100 : 0;

    const readiness = Math.round(
      notesCoverage * 0.30 +
      avgQuiz       * 0.40 +
      consistency   * 0.20 +
      copilotUsed   * 0.10
    );

    res.json({
      subject, readiness,
      breakdown: {
        notesCoverage:   Math.round(notesCoverage),
        quizPerformance: Math.round(avgQuiz),
        consistency:     Math.round(consistency),
        copilotBonus:    copilotUsed,
      },
      notes:       notes.length,
      quizzesTaken:quizSessions.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/session — log frontend events
router.post('/session', auth, async (req, res) => {
  try {
    const { eventType, subject, topic, quizScore, quizTotal, quizCorrect, durationMs } = req.body;

    const session = await StudySession.create({
      userId:    req.user._id,
      eventType: eventType || 'note_view',
      subject:   subject   || 'General',
      topic, quizScore, quizTotal, quizCorrect,
      durationMs: durationMs || 0,
    });

    if (eventType === 'quiz_complete' && quizScore < 60 && topic) {
      await UserProfile.findOneAndUpdate(
        { userId: req.user._id, 'weakTopics.topic': { $ne: topic } },
        { $push: { weakTopics: { topic, subject, errorCount: 1, lastSeen: new Date() } } }
      );
    }

    res.json({ success: true, sessionId: session._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
