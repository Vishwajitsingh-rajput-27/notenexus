const log = require('../utils/logger')('studyPlanner');
/**
 * routes/studyPlanner.js — AI-powered study plan generator
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { groqCall, extractJSON } = require('../utils/groq');

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

// POST /api/planner/generate
router.post('/generate', auth, async (req, res) => {
  try {
    const {
      subjects,
      examDate,
      dailyHours = 4,
      weakTopics = '',
      studyStyle = 'mixed',
    } = req.body;

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
      usedModel: 'groq/llama-3.3-70b',
      summary:   plan.summary,
      dailyPlan: plan.dailyPlan,
    });
  } catch (err) {
    log.error('Study plan generation failed', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
