const log = require('../utils/logger')('savedItems');
const express   = require('express');
const router    = express.Router();
const auth      = require('../middleware/auth');
const SavedItem = require('../models/SavedItem');

const isRenderableSavedItem = (item) => {
  const data = item?.data;
  if (!data) return false;
  if (item.type === 'flashcards') {
    return Array.isArray(data.cards) && data.cards.some((card) =>
      card?.question && card.question.toLowerCase() !== 'error' &&
      card?.answer && !/^please try again/i.test(card.answer)
    );
  }
  if (item.type === 'mindmap') return Boolean(data.root && Array.isArray(data.children));
  if (item.type === 'studyplan') return Array.isArray((data.plan || data).dailyPlan);
  if (item.type === 'examquestions' || item.type === 'quiz') return Array.isArray(data.questions) && data.questions.length > 0;
  if (item.type === 'chat') return Array.isArray(data.history) && data.history.length > 0;
  return true;
};

// ── POST /api/saved ─────────────────────────────────────────────────────────
// Save a new item (mindmap / flashcards / chat / studyplan / examquestions)
router.post('/', auth, async (req, res) => {
  try {
    const { type, name, subject, data } = req.body;
    if (!type || !name || !data) return res.status(400).json({ error: 'type, name and data are required' });
    const item = await SavedItem.create({ userId: req.user.id, type, name, subject: subject || '', data });
    res.status(201).json(item);
  } catch (err) {
    log.error('Save item failed', err);
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/saved ──────────────────────────────────────────────────────────
// List saved items; optional ?type= filter
router.get('/', auth, async (req, res) => {
  try {
    const filter = { userId: req.user.id };
    if (req.query.type) filter.type = req.query.type;
    const items = (await SavedItem.find(filter).sort({ createdAt: -1 }).limit(100).lean()).filter(isRenderableSavedItem);
    res.json({ items });
  } catch (err) {
    log.error('Get saved items failed', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/saved/:id ───────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await SavedItem.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    log.error('Delete saved item failed', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
