// middleware/trackActivity.js — Auto-track study events
const StudySession = require('../models/StudySession');
const UserProfile  = require('../models/UserProfile');

const XP_MAP = {
  note_upload:        50,
  flashcard_complete: 20,
  quiz_complete:      30,
  tutor_message:       5,
  exam_predict:       25,
  copilot_run:        40,
  group_quiz:         35,
};

const updateStreak = async (userId) => {
  try {
    const profile = await UserProfile.findOne({ userId });
    if (!profile) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last = profile.lastStudyDate ? new Date(profile.lastStudyDate) : null;

    if (last) {
      last.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - last) / 86400000);
      if (diffDays === 0) return; // Already studied today
      if (diffDays === 1) {
        profile.currentStreak += 1;
        if (profile.currentStreak > profile.longestStreak) {
          profile.longestStreak = profile.currentStreak;
        }
      } else {
        profile.currentStreak = 1;
      }
    } else {
      profile.currentStreak = 1;
    }

    profile.lastStudyDate  = new Date();
    profile.weeklyProgress = (profile.weeklyProgress || 0) + 1;
    await profile.save();
  } catch {}
};

const trackActivity = (eventType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = async (data) => {
    if (res.statusCode < 400 && req.user) {
      try {
        const xp = XP_MAP[eventType] || 0;
        await StudySession.create({
          userId:    req.user._id,
          eventType,
          subject:   req.body?.subject || 'General',
          xpAwarded: xp,
          metadata:  { path: req.path },
        });

        if (xp > 0) {
          await UserProfile.findOneAndUpdate(
            { userId: req.user._id },
            { $inc: { xp, totalStudyMinutes: 5 } },
            { upsert: true }
          );
        }

        await updateStreak(req.user._id);
      } catch {}
    }
    return originalJson(data);
  };

  next();
};

module.exports = { trackActivity };
