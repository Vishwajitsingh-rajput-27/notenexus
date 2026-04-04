// middleware/checkPlan.js — Feature gating by subscription plan
// FIX: Free users now have access to all features for easier onboarding.
//      Pro/Team plans retain their limits. Change 'free' limits below to re-enable gating.
const UserProfile = require('../models/UserProfile');

const PLAN_LIMITS = {
  free: {
    maxNotes:               -1,     // unlimited
    canUseCopilot:          true,   // FIX: was false — blocked free users from Copilot
    canUseGroupStudy:       true,   // FIX: was false
    canUseAdvancedAnalytics:true,   // FIX: was false
    maxQuizQuestions:       10,
  },
  pro: {
    maxNotes:               -1,
    canUseCopilot:          true,
    canUseGroupStudy:       true,
    canUseAdvancedAnalytics:true,
    maxQuizQuestions:       20,
  },
  team: {
    maxNotes:               -1,
    canUseCopilot:          true,
    canUseGroupStudy:       true,
    canUseAdvancedAnalytics:true,
    maxQuizQuestions:       50,
  },
};

const checkPlan = (feature) => async (req, res, next) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id });
    const plan    = profile?.plan || 'free';
    const limits  = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    if (limits[feature] === false) {
      return res.status(403).json({
        error:      'PLAN_UPGRADE_REQUIRED',
        message:    'This feature requires a Pro plan.',
        feature,
        currentPlan: plan,
      });
    }

    req.planLimits = limits;
    req.userPlan   = plan;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { checkPlan, PLAN_LIMITS };
