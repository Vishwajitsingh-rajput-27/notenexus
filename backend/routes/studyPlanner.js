const log = require('../utils/logger')('studyPlanner');
/**
 * routes/studyPlanner.js — AI-powered study plan generator
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { groqCall, extractJSON, DEFAULT_MODEL } = require('../utils/groq');

function buildPlannerPrompt({ subjects, examDate, dailyHours, weakTopics, studyStyle }) {
  const daysLeft   = Math.max(1, Math.ceil((new Date(examDate) - new Date()) / 86_400_000));
  const totalHours = daysLeft * dailyHours;

  return `Create a detailed study plan for a student preparing for exams.

Student details:
- Subjects: ${subjects.join(', ')}
- Days until exam: ${daysLeft}
- Daily study hours: ${dailyHours}
- Weak topics: ${weakTopics || 'none specified'}
- Study style: ${studyStyle || 'mixed'}

Planning rules:
1. Distribute subjects proportionally; give 40% more time to weak topics
2. Include revision sessions in the last 20% of days
3. Add 1 full rest day every 6-7 days (mark as restDay: true)
4. Each session: 45-90 min max
5. Final 2 days: only light revision and past papers
6. Session types: "study" | "revision" | "practice" | "rest"
7. Session duration in MINUTES (e.g. 60, 90, 45)

Return ONLY valid JSON, no markdown:
{
  "summary": {
    "totalDays": ${daysLeft},
    "totalHours": ${totalHours},
    "subjects": ${JSON.stringify(subjects)},
    "strategy": "Brief 1-2 sentence strategy description"
  },
  "dailyPlan": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "restDay": false,
      "totalHours": ${dailyHours},
      "sessions": [
        { "subject": "Physics", "topic": "Kinematics", "duration": 90, "type": "study", "description": "..." }
      ]
    }
  ]
}`;
}

function buildFallbackPlan({ subjects, examDate, dailyHours, weakTopics }) {
  const days = Math.max(1, Math.min(30, Math.ceil((new Date(examDate) - new Date()) / 86_400_000)));
  const weak = weakTopics ? weakTopics.split(',').map((topic) => topic.trim()).filter(Boolean) : [];
  const dailyPlan = Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    const isRestDay = (index + 1) % 7 === 0;
    const subject = subjects[index % subjects.length];
    return {
      day: index + 1,
      date: date.toISOString().slice(0, 10),
      restDay: isRestDay,
      totalHours: isRestDay ? 0 : dailyHours,
      sessions: isRestDay ? [{ subject: 'Rest', topic: '', duration: 0, type: 'rest', description: 'Take a full rest day.' }] : [
        { subject, topic: weak[index % weak.length] || 'Core concepts', duration: Math.min(90, Math.max(45, Math.round((dailyHours * 60) / 2))), type: 'study', description: 'Review concepts and create concise revision notes.' },
        { subject, topic: 'Practice and recall', duration: Math.min(90, Math.max(45, Math.round((dailyHours * 60) / 2))), type: 'practice', description: 'Test recall with practice questions and review mistakes.' },
      ],
    };
  });
  return {
    summary: { totalDays: days, totalHours: dailyPlan.reduce((sum, day) => sum + day.totalHours, 0), subjects, strategy: 'Rotate subjects, prioritise weak topics, and reserve regular days for recall and practice.' },
    dailyPlan,
  };
}

// POST /api/planner/generate
router.post('/generate', auth, async (req, res) => {
  const {
    subjects,
    examDate,
    dailyHours = 4,
    weakTopics = '',
    studyStyle = 'mixed',
  } = req.body;
  try {
    if (!subjects?.length) return res.status(400).json({ error: 'Subjects are required' });
    if (!examDate)          return res.status(400).json({ error: 'Exam date is required' });
    if (new Date(examDate) <= new Date()) return res.status(400).json({ error: 'Exam date must be in the future' });

    const raw  = await groqCall(buildPlannerPrompt({ subjects, examDate, dailyHours, weakTopics, studyStyle }), { maxTokens: 4_000 });
    const plan = extractJSON(raw, 'object');

    if (!plan?.dailyPlan) {
      return res.status(500).json({ error: 'Could not generate plan. Please try again.' });
    }

    log.ok('Study plan generated', { subjects, days: plan.dailyPlan.length, dailyHours });
    res.json({
      success:   true,
      usedModel: `groq/${DEFAULT_MODEL}`,
      summary:   plan.summary,
      dailyPlan: plan.dailyPlan,
    });
  } catch (err) {
    log.error('Study plan generation failed', err);
    const fallback = buildFallbackPlan({ subjects, examDate, dailyHours, weakTopics });
    res.json({ success: true, ...fallback, fallback: true });
  }
});

module.exports = router;
