/**
 * routes/whatsapp.js  --  NoteNexus WhatsApp AI Bot
 *
 * HOW THE BOT WORKS
 * =================
 *
 * OPEN MODE (no account needed)
 *   Anyone can message the Twilio WhatsApp number and get instant AI
 *   replies. The bot remembers the last 20 messages per phone number
 *   for 24 hours (stored in MongoDB with a TTL index).
 *
 * LINKED MODE (NoteNexus account connected)
 *   Users who link their account get extra features:
 *     - List and read their saved notes
 *     - Upload PDFs or images and save them as notes
 *     - AI answers use their saved notes as extra context
 *
 * AI ENGINE
 *   Uses Groq (llama-3.3-70b-versatile) via utils/groq.js.
 *   The full conversation history is sent with every request so the
 *   bot can remember earlier parts of the chat.
 *
 * TWILIO SETUP (quick reference)
 *   Set in .env:
 *     TWILIO_ACCOUNT_SID   = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *     TWILIO_AUTH_TOKEN    = your_auth_token
 *     TWILIO_WHATSAPP_NUMBER = whatsapp:+14155238886
 *   In Twilio Console -> Messaging -> WhatsApp sandbox (or approved number):
 *     Webhook URL = https://YOUR_BACKEND/api/whatsapp/webhook
 *     Method      = HTTP POST
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const https    = require('https');
const http     = require('http');
const crypto   = require('crypto');
const { URL }  = require('url');
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');

const auth = require('../middleware/auth');
const log  = require('../utils/logger')('whatsapp');

// Models
const { WhatsAppSession, WhatsAppLinkCode } = require('../models/WhatsAppSession');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const Note      = require('../models/Note');
const FileVault = require('../models/FileVault');

// Services
const { upload, cloudinary } = require('../config/cloudinary');
const { groqCall }           = require('../utils/groq');
const { extractFromPDF, extractFromImage, extractImagesFromPDF } = require('../services/ingestionService');
const { detectSubjectChapter, translateToEnglish } = require('../services/aiService');
const { storeEmbedding, semanticSearch }           = require('../services/vectorService');

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/**
 * SYSTEM_PROMPT defines who the bot is and how it behaves.
 * Edit this to change the bot's personality.
 */
const SYSTEM_PROMPT = `You are an intelligent WhatsApp assistant called NoteNexus AI.
You can answer ANY question a user asks: general knowledge, coding, science, mathematics,
history, philosophy, creative writing, languages, personal advice, and more.

Rules:
- Be helpful, friendly, and concise (under 250 words unless the user asks for more detail).
- Use plain text. WhatsApp renders *bold* and _italic_ so those are fine to use.
- Remember the conversation history and refer back to it naturally.
- If a question is ambiguous, ask a short clarifying question.
- Never refuse to answer just because a topic seems complex -- always try your best.
- If you genuinely don't know something (real-time data, today's news), say so honestly.
- Keep your tone warm and human-like, not robotic or overly formal.
- When answering maths or code, format it clearly so it reads well in WhatsApp.`;

const HELP_TEXT = `*NoteNexus AI* 🤖  — Ask me anything!

*📂 FILE VAULT COMMANDS* (linked accounts)
  files — list all saved files
  files pdf — list your PDFs
  files image — list your images  
  files voice — list voice notes
  files link — list saved links
  file <N> — get file #N (sends the actual file)
  
*📝 NOTES COMMANDS*
  notes — list your saved notes
  <N> — read note by number
  images <N> — get images from note N

*📊 STUDY COMMANDS*
  streak — see your current streak & XP
  analytics — view your readiness scores
  badges — see your earned badges
  
*⚙️ ACCOUNT*
  link CODE — connect your account
  unlink — disconnect
  reset — clear conversation history
  help — show this list

*📤 UPLOAD HERE*
  📄 PDF → saved to File Vault + notes
  📷 Image → text extracted + original stored
  🎙 Voice → transcribed + original stored

_Conversation remembered 24 hours._`;

const VAULT_ICON = { pdf: '📄', image: '🖼️', voice: '🎙️', link: '🔗', other: '📎' };

// ---------------------------------------------------------------------------
// TWILIO HELPERS
// ---------------------------------------------------------------------------

function getTwilioClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials missing -- set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
  }
  return require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

async function sendWhatsApp(to, body) {
  if (to === process.env.TWILIO_WHATSAPP_NUMBER) return; // prevent echo
  try {
    const client = getTwilioClient();
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to,
      body: body.slice(0, 1600),
    });
    log.info('Message sent', { to, chars: body.length });
  } catch (err) {
    log.error('sendWhatsApp failed', { to, error: err.message });
  }
}

async function sendWhatsAppMedia(to, body, mediaUrl) {
  if (to === process.env.TWILIO_WHATSAPP_NUMBER) return;
  try {
    const client = getTwilioClient();
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to,
      body: body.slice(0, 1600),
      mediaUrl: [mediaUrl],
    });
  } catch (err) {
    log.error('sendWhatsAppMedia failed', { to, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// FILE DOWNLOAD HELPER
// ---------------------------------------------------------------------------

function fetchBuffer(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib    = parsed.protocol === 'https:' ? https : http;

    const headers = {};
    if (parsed.hostname.includes('twilio.com')) {
      const creds = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');
      headers.Authorization = `Basic ${creds}`;
    }

    const req = lib.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end',  () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error('Download timeout after 30s'));
    });
  });
}

// ---------------------------------------------------------------------------
// CONVERSATION MEMORY
// ---------------------------------------------------------------------------

async function getOrCreateConversation(phone, userId) {
  let convo = await WhatsAppConversation.findOne({ phone });
  if (!convo) {
    convo = new WhatsAppConversation({ phone });
  }
  if (userId && !convo.userId) {
    convo.userId = userId;
  }
  return convo;
}

async function saveExchange(convo, userText, aiReply) {
  convo.addMessage('user',      userText);
  convo.addMessage('assistant', aiReply);
  await convo.save();
}

// ---------------------------------------------------------------------------
// AI BRAIN
// ---------------------------------------------------------------------------

/**
 * Calls Groq with the full conversation history + optional note context.
 * Works for EVERYONE -- no account required.
 */
async function askAI(question, history, userId) {
  // Optional: semantic search on the user's notes for extra context
  let noteContext = '';

  if (userId) {
    try {
      const results = await semanticSearch(question, userId, { topK: 3, minScore: 0.6 });
      if (results.length > 0) {
        const snippets = results
          .map((r, i) => `[Note ${i + 1}: ${r.metadata && r.metadata.title ? r.metadata.title : 'untitled'}]\n${r.metadata && r.metadata.text ? r.metadata.text.slice(0, 400) : ''}`)
          .join('\n\n');
        noteContext = `\n\nRelevant notes from this user's library:\n${snippets}\n\nUse these notes as additional context if helpful, but still answer even if they are not directly relevant.`;
      }
    } catch (e) {
      log.warn('Semantic search failed (non-fatal)', e.message);
    }
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + noteContext },
    ...history,
    { role: 'user',   content: question },
  ];

  const reply = await groqCall(messages, {
    maxTokens:   700,
    temperature: 0.7,
    model:       'llama-3.3-70b-versatile',
    timeoutMs:   30_000,
  });

  return reply.trim() || "I'm not sure how to answer that. Could you rephrase?";
}

// ---------------------------------------------------------------------------
// FORMAT HELPERS
// ---------------------------------------------------------------------------

function formatNotesList(notes) {
  if (!notes.length) {
    return '📭 You have no saved notes yet.\n\nUpload notes at notenexus.vercel.app';
  }
  const lines = notes.slice(0, 10).map((n, i) => {
    const date     = new Date(n.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const imgBadge = n.extractedImages && n.extractedImages.length ? ` 🖼x${n.extractedImages.length}` : '';
    return `${i + 1}. *${n.title}*${imgBadge}\n   ${n.subject} | ${n.chapter}\n   ${date}`;
  });
  const overflow = notes.length > 10 ? `\n\n...and ${notes.length - 10} more.` : '';
  return `*Your Notes* (${notes.length} total)\n\n${lines.join('\n\n')}${overflow}\n\nType a number to read a note, or images <N> to see images.`;
}

function formatNoteDetail(note) {
  const ICONS = { pdf: '📄', image: '🖼', youtube: '🎥', voice: '🎙', whatsapp: '💬', text: '📝' };
  const icon  = ICONS[note.sourceType] || '📄';
  const lines = [
    `${icon} *${note.title}*`,
    `${note.subject} | ${note.chapter}`,
  ];
  if (note.extractedImages && note.extractedImages.length) lines.push(`🖼 ${note.extractedImages.length} images -- type images <N> to view`);
  if (note.keywords && note.keywords.length)               lines.push(`Keywords: ${note.keywords.slice(0, 6).join(', ')}`);
  lines.push('');
  if (note.content) {
    lines.push(note.content.slice(0, 800));
    if (note.content.length > 800) lines.push('\n(content truncated -- open app for full note)');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// PDF HANDLER
// ---------------------------------------------------------------------------

async function handleIncomingPDF(session, mediaUrl, from) {
  try {
    await sendWhatsApp(from, '📄 PDF received! Processing text and extracting images... please wait ⏳');

    const pdfBuffer = await fetchBuffer(mediaUrl);

    const uploadedPdf = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', format: 'pdf', folder: 'notenexus/whatsapp-pdfs' },
        (err, result) => { if (err) reject(err); else resolve(result); }
      );
      Readable.from(pdfBuffer).pipe(stream);
    });

    const pdfUrl = uploadedPdf.secure_url;

    const [extractedText, imgResult] = await Promise.all([
      extractFromPDF(pdfUrl),
      extractImagesFromPDF(pdfUrl, { maxPages: 10, extractEmbedded: true }),
    ]);

    if (!extractedText || !extractedText.trim()) {
      return sendWhatsApp(from, '⚠️ Could not extract text from that PDF. Please try a text-based PDF.');
    }

    const englishText = await translateToEnglish(extractedText);
    const meta        = await detectSubjectChapter(englishText);
    const autoTitle   = `${meta.subject} -- ${meta.chapter}`;
    const noteId      = uuidv4();
    const allImages   = [].concat(imgResult.pageImages || [], imgResult.embeddedImages || []);

    const note = await Note.create({
      userId:          session.userId,
      title:           autoTitle,
      content:         englishText,
      sourceType:      'whatsapp',
      fileUrl:         pdfUrl,
      subject:         meta.subject,
      chapter:         meta.chapter,
      keywords:        meta.keywords || [],
      pineconeId:      noteId,
      extractedImages: allImages,
    });

    await storeEmbedding(noteId, englishText, {
      userId:     session.userId.toString(),
      noteId:     note._id.toString(),
      subject:    meta.subject,
      chapter:    meta.chapter,
      sourceType: 'whatsapp',
      fileUrl:    pdfUrl,
      title:      autoTitle,
    });

    const wordCount = englishText.split(/\s+/).length;
    const preview   = englishText.slice(0, 400) + (englishText.length > 400 ? '...' : '');

    await sendWhatsApp(
      from,
      `✅ *PDF Saved!*\n\n*${autoTitle}*\nSubject: ${meta.subject} | Chapter: ${meta.chapter}\nKeywords: ${(meta.keywords || []).slice(0, 5).join(', ')}\n🖼 ${allImages.length} images extracted\n${wordCount} words\n\n${preview}`
    );

    if (allImages.length > 0) {
      await sendWhatsAppMedia(from, `Page 1 of your PDF (${allImages.length} pages extracted):`, allImages[0]);
    }
  } catch (err) {
    log.error('PDF processing failed', err);
    await sendWhatsApp(from, '❌ Failed to process your PDF. Please try again or upload at notenexus.vercel.app');
  }
}

// ---------------------------------------------------------------------------
// IMAGE HANDLER
// ---------------------------------------------------------------------------

async function handleIncomingImage(session, mediaUrl, from) {
  try {
    await sendWhatsApp(from, '🖼 Image received! Extracting text... ⏳');

    const extractedText = await extractFromImage(mediaUrl);

    if (!extractedText || !extractedText.trim()) {
      return sendWhatsApp(from, '⚠️ Could not extract text from that image. Is it a clear photo of notes?');
    }

    const englishText = await translateToEnglish(extractedText);
    const meta        = await detectSubjectChapter(englishText);
    const autoTitle   = `${meta.subject} -- ${meta.chapter}`;
    const noteId      = uuidv4();

    const note = await Note.create({
      userId:     session.userId,
      title:      autoTitle,
      content:    englishText,
      sourceType: 'whatsapp',
      fileUrl:    mediaUrl,
      subject:    meta.subject,
      chapter:    meta.chapter,
      keywords:   meta.keywords || [],
      pineconeId: noteId,
    });

    await storeEmbedding(noteId, englishText, {
      userId:     session.userId.toString(),
      noteId:     note._id.toString(),
      subject:    meta.subject,
      chapter:    meta.chapter,
      sourceType: 'whatsapp',
      fileUrl:    mediaUrl,
      title:      autoTitle,
    });

    await sendWhatsApp(
      from,
      `✅ *Image Note Saved!*\n\n*${autoTitle}*\nSubject: ${meta.subject} | Chapter: ${meta.chapter}\n\n${englishText.slice(0, 500)}`
    );
  } catch (err) {
    log.error('Image processing failed', err);
    await sendWhatsApp(from, '❌ Failed to process your image. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// WEBHOOK
// ---------------------------------------------------------------------------

router.get('/webhook', (_req, res) => {
  res.send('OK -- NoteNexus WhatsApp webhook is active.');
});

router.post('/webhook', async (req, res) => {
  // Twilio requires a response within 15 seconds.
  // We respond immediately with empty TwiML, then process async.
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  try {
    const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

    if (!From) return;
    if (From === process.env.TWILIO_WHATSAPP_NUMBER) return; // ignore echo

    const from     = From;
    const rawText  = (Body || '').trim();
    const text     = rawText.toLowerCase();
    const numMedia = parseInt(NumMedia || '0', 10);

    log.info('Incoming', { from, preview: (rawText || '[media]').slice(0, 80), media: numMedia });

    // Load session (linked account) and conversation history
    const session = await WhatsAppSession.findOne({ phone: from, isActive: true });
    const userId  = session ? session.userId : null;
    const convo   = await getOrCreateConversation(from, userId);

    // ---- Media handling (PDF / image) -- only for linked accounts ----
    if (numMedia > 0 && MediaUrl0) {
      if (!session) {
        return sendWhatsApp(
          from,
          '📎 Got your file!\n\nTo save files to your NoteNexus notes, first link your account:\nnotenexus.vercel.app/dashboard -> WhatsApp Bot -> Get Link Code\nThen reply: link YOUR_CODE\n\nOr just ask me anything -- I am your AI assistant! 🤖'
        );
      }
      const contentType = (MediaContentType0 || '').toLowerCase();
      if (contentType === 'application/pdf') return handleIncomingPDF(session, MediaUrl0, from);
      if (contentType.startsWith('image/'))  return handleIncomingImage(session, MediaUrl0, from);
      return sendWhatsApp(from, `Unsupported file type: ${contentType}\n\nSupported: PDF, JPG, PNG`);
    }

    // ---- Universal commands ----

    if (!rawText) return;

    if (text === 'help' || text === 'commands' || text === 'start' || text === '/start') {
      return sendWhatsApp(from, HELP_TEXT);
    }

    if (text === 'reset' || text === 'clear chat' || text === 'forget') {
      convo.messages  = [];
      convo.updatedAt = new Date();
      await convo.save();
      return sendWhatsApp(from, '🔄 Conversation cleared! Starting fresh. Ask me anything.');
    }

    // ---- Account linking ----

    if (text.startsWith('link ')) {
      if (session) {
        return sendWhatsApp(from, 'Your account is already linked! Type help to see all commands.');
      }

      const code    = text.split(' ')[1] && text.split(' ')[1].toUpperCase();
      const linkDoc = await WhatsAppLinkCode.findOne({
        code,
        used:      false,
        expiresAt: { $gt: new Date() },
      });

      if (linkDoc) {
        await WhatsAppSession.findOneAndUpdate(
          { phone: from },
          { userId: linkDoc.userId, isActive: true, linkedAt: new Date() },
          { upsert: true, new: true }
        );
        await WhatsAppLinkCode.updateOne({ _id: linkDoc._id }, { used: true });

        convo.userId = linkDoc.userId;
        await convo.save();

        return sendWhatsApp(
          from,
          '✅ *NoteNexus linked successfully!* 🎉\n\nYou now have full access:\n  notes -- list your notes\n  help -- see all commands\n  Send a PDF or image to save notes\n  Ask me any question 🤖\n\nYour chat is remembered for 24 hours.'
        );
      } else {
        return sendWhatsApp(
          from,
          '❌ Invalid or expired code.\n\nGenerate a new one at notenexus.vercel.app/dashboard\nCodes expire after 10 minutes.'
        );
      }
    }

    // ---- Unlink ----

    if (text === 'unlink' || text === 'disconnect') {
      if (session) {
        await WhatsAppSession.updateOne({ phone: from }, { isActive: false });
        return sendWhatsApp(
          from,
          '✅ Account unlinked.\n\nYou can still chat with me as an AI assistant!\nTo reconnect, generate a new code at notenexus.vercel.app/dashboard'
        );
      }
      return sendWhatsApp(from, 'No account is currently linked to this number.');
    }

    // ---- Note commands (linked users only) ----

    if (session) {

      // ── VAULT FILE COMMANDS ──────────────────────────────────────────────
      const vaultTypes = { 'files pdf': 'pdf', 'files image': 'image', 'files images': 'image', 'files voice': 'voice', 'files link': 'link', 'files links': 'link' };

      if (text === 'files' || text === 'my files' || text in vaultTypes) {
        const typeFilter = vaultTypes[text] || null;
        const filter = { userId: session.userId };
        if (typeFilter) filter.fileType = typeFilter;
        const files = await FileVault.find(filter).sort({ createdAt: -1 }).limit(15);
        if (!files.length) {
          return sendWhatsApp(from, `📂 No ${typeFilter || ''} files found.\n\nUpload files in the NoteNexus app under *File Vault* tab.`);
        }
        const lines = files.map((f, i) => {
          const icon = VAULT_ICON[f.fileType] || '📎';
          const size = f.size > 0 ? ` (${(f.size / 1024).toFixed(0)}KB)` : '';
          const date = new Date(f.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          return `${i + 1}. ${icon} *${f.name}*${size}\n   ${f.subject} | ${date}`;
        });
        const total = await FileVault.countDocuments({ userId: session.userId });
        return sendWhatsApp(from, `*Your Files* (${total} total)\n\n${lines.join('\n\n')}\n\nType *file <N>* to receive a file.`);
      }

      if (/^file \d+$/.test(text)) {
        const idx   = parseInt(text.split(' ')[1], 10);
        const files = await FileVault.find({ userId: session.userId }).sort({ createdAt: -1 }).limit(idx);
        const file  = files[idx - 1];
        if (!file) return sendWhatsApp(from, `❌ No file #${idx} found. Type *files* to see your list.`);
        const icon = VAULT_ICON[file.fileType] || '📎';
        if (file.fileType === 'link') {
          return sendWhatsApp(from, `${icon} *${file.name}*\n\n🔗 ${file.fileUrl}\n\n${file.linkMeta || ''}`);
        }
        await sendWhatsApp(from, `${icon} Sending *${file.name}* (${file.subject}) ...`);
        return sendWhatsAppMedia(from, `${icon} ${file.name}`, file.fileUrl);
      }

      // ── STUDY STATS COMMANDS ─────────────────────────────────────────────
      if (text === 'streak' || text === 'my streak' || text === 'xp') {
        const UserProfile = require('../models/UserProfile');
        const profile = await UserProfile.findOne({ userId: session.userId });
        if (!profile) return sendWhatsApp(from, '📊 No profile yet — start studying to build your streak!');
        const level = Math.floor((profile.xp || 0) / 500) + 1;
        const badgeIcons = (profile.badges || []).map(b => b.icon).join(' ');
        return sendWhatsApp(from,
          `*Your Study Stats* 📊\n\n` +
          `🔥 Streak: *${profile.currentStreak} days* (best: ${profile.longestStreak})\n` +
          `⚡ XP: *${profile.xp}* | Level ${level}\n` +
          `📅 Weekly: ${profile.weeklyProgress}/${profile.weeklyGoal} sessions\n` +
          `🏆 Badges: ${badgeIcons || 'None yet'}\n\n` +
          `_Keep it up! Open the app for full analytics._`
        );
      }

      if (text === 'analytics' || text === 'readiness') {
        const UserProfile = require('../models/UserProfile');
        const profile = await UserProfile.findOne({ userId: session.userId });
        if (!profile || !profile.subjectScores?.length) return sendWhatsApp(from, '📊 No analytics yet — take some quizzes first!');
        const lines = profile.subjectScores.map(s => {
          const bar = '█'.repeat(Math.round(s.readinessScore / 10)) + '░'.repeat(10 - Math.round(s.readinessScore / 10));
          return `${s.subject}: ${bar} ${s.readinessScore}%`;
        });
        return sendWhatsApp(from, `*Subject Readiness* 📊\n\n${lines.join('\n')}\n\nOpen *Analytics* tab in app for full details.`);
      }

      if (text === 'badges' || text === 'achievements') {
        const UserProfile = require('../models/UserProfile');
        const profile = await UserProfile.findOne({ userId: session.userId });
        const badges = profile?.badges || [];
        if (!badges.length) return sendWhatsApp(from, '🏅 No badges yet — keep studying to earn them!');
        const lines = badges.map(b => `${b.icon} *${b.name}* — earned ${new Date(b.earnedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`);
        return sendWhatsApp(from, `*Your Badges* 🏆\n\n${lines.join('\n')}`);
      }

      if (text === 'notes' || text === 'my notes' || text === 'list notes') {
        const notes = await Note.find({ userId: session.userId })
          .sort({ createdAt: -1 })
          .limit(20)
          .select('-content');
        return sendWhatsApp(from, formatNotesList(notes));
      }

      if (/^images \d+$/.test(text)) {
        const idx   = parseInt(text.split(' ')[1], 10);
        const notes = await Note.find({ userId: session.userId }).sort({ createdAt: -1 }).limit(idx);
        const note  = notes[idx - 1];
        if (!note) return sendWhatsApp(from, `You do not have a note #${idx}.`);
        const imgs = note.extractedImages || [];
        if (!imgs.length) return sendWhatsApp(from, `${note.title} has no extracted images.`);
        await sendWhatsApp(from, `*${note.title}* -- ${imgs.length} page(s). Sending page 1:`);
        await sendWhatsAppMedia(from, `Page 1/${imgs.length}`, imgs[0]);
        if (imgs.length > 1) await sendWhatsApp(from, `Send images ${idx} 2 for page 2, and so on.`);
        return;
      }

      if (/^images \d+ \d+$/.test(text)) {
        const match     = text.match(/^images (\d+) (\d+)$/);
        const ni        = match[1];
        const pi        = match[2];
        const notes     = await Note.find({ userId: session.userId }).sort({ createdAt: -1 }).limit(parseInt(ni));
        const note      = notes[parseInt(ni) - 1];
        const imgs      = (note && note.extractedImages) || [];
        const pageIndex = parseInt(pi) - 1;
        if (!imgs[pageIndex]) return sendWhatsApp(from, `Page ${pi} does not exist (${imgs.length} pages total).`);
        return sendWhatsAppMedia(from, `Page ${pi}/${imgs.length} -- *${note.title}*`, imgs[pageIndex]);
      }

      const noteNum = parseInt(text, 10);
      if (!isNaN(noteNum) && noteNum >= 1 && noteNum <= 20) {
        const notes = await Note.find({ userId: session.userId }).sort({ createdAt: -1 }).limit(noteNum);
        const note  = notes[noteNum - 1];
        if (!note) return sendWhatsApp(from, `You do not have a note #${noteNum}.`);
        return sendWhatsApp(from, formatNoteDetail(note));
      }
    }

    // ---- AI answer -- works for EVERYONE (linked and unlinked) ----

    log.info('AI query', { from, question: rawText.slice(0, 100) });

    const history = convo.getHistory();
    const aiReply = await askAI(rawText, history, userId);

    await saveExchange(convo, rawText, aiReply);

    // Every 10 messages, nudge unlinked users to link their account
    let suffix = '';
    if (!session && convo.messages.length > 0 && convo.messages.length % 10 === 0) {
      suffix = '\n\n_Tip: Link your NoteNexus account to save notes and get AI answers using your study materials._';
    }

    await sendWhatsApp(from, `🤖 ${aiReply}${suffix}`);
    log.info('AI reply sent', { from, chars: aiReply.length });

  } catch (err) {
    log.error('Webhook error', err);
  }
});

// ---------------------------------------------------------------------------
// REST ENDPOINTS (used by the dashboard UI)
// ---------------------------------------------------------------------------

// Shared handler — called by both /generate-code and /generate-link-code
async function handleGenerateCode(req, res) {
  try {
    const code      = crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1_000); // 10 minutes

    // Remove any stale unused codes for this user first
    await WhatsAppLinkCode.deleteMany({ userId: req.user._id, used: false });
    await WhatsAppLinkCode.create({ userId: req.user._id, code, expiresAt, used: false });

    log.info('Link code generated', { userId: req.user._id, code });
    res.json({ code, expiresAt });
  } catch (err) {
    log.error('Generate code failed', err);
    res.status(500).json({ message: 'Failed to generate link code' });
  }
}

// Both routes call the same function — no broken re-routing
router.post('/generate-code',      auth, handleGenerateCode);
router.post('/generate-link-code', auth, handleGenerateCode);

router.get('/status', auth, async (req, res) => {
  try {
    // configured = true only when all 3 Twilio vars are present
    const configured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN  &&
      process.env.TWILIO_WHATSAPP_NUMBER
    );

    const session    = await WhatsAppSession.findOne({ userId: req.user._id, isActive: true });
    const backendUrl = process.env.BACKEND_URL || 'https://your-backend.onrender.com';

    res.json({
      configured,
      linked:     !!session,
      phone:      session ? session.phone : null,
      webhookUrl: `${backendUrl}/api/whatsapp/webhook`,
      // Extra diagnostic info so the frontend can show a better message
      missingVars: [
        !process.env.TWILIO_ACCOUNT_SID     && 'TWILIO_ACCOUNT_SID',
        !process.env.TWILIO_AUTH_TOKEN      && 'TWILIO_AUTH_TOKEN',
        !process.env.TWILIO_WHATSAPP_NUMBER && 'TWILIO_WHATSAPP_NUMBER',
      ].filter(Boolean),
    });
  } catch (err) {
    log.error('Status check failed', err);
    res.status(500).json({ message: 'Failed to get status' });
  }
});

router.get('/link-status', auth, async (req, res) => {
  try {
    const session = await WhatsAppSession.findOne({ userId: req.user._id, isActive: true });
    res.json({ linked: !!session, phone: session ? session.phone : null });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get link status' });
  }
});

router.delete('/unlink', auth, async (req, res) => {
  try {
    await WhatsAppSession.updateMany({ userId: req.user._id }, { isActive: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unlink' });
  }
});

router.delete('/conversation', auth, async (req, res) => {
  try {
    const session = await WhatsAppSession.findOne({ userId: req.user._id, isActive: true });
    if (!session) return res.status(404).json({ message: 'No active WhatsApp session found' });
    await WhatsAppConversation.findOneAndUpdate(
      { phone: session.phone },
      { $set: { messages: [] } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to clear conversation' });
  }
});

// ---------------------------------------------------------------------------
// DEBUG ENDPOINTS (development only)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== 'production') {
  router.get('/debug-env', (_req, res) => {
    res.json({
      TWILIO_ACCOUNT_SID:     process.env.TWILIO_ACCOUNT_SID     ? 'SET' : 'MISSING',
      TWILIO_AUTH_TOKEN:      process.env.TWILIO_AUTH_TOKEN      ? 'SET' : 'MISSING',
      TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER  || 'MISSING',
      GROQ_API_KEY:           process.env.GROQ_API_KEY            ? 'SET' : 'MISSING',
      BACKEND_URL:            process.env.BACKEND_URL             || 'MISSING',
      NODE_ENV:               process.env.NODE_ENV,
    });
  });

  router.get('/debug-codes', auth, async (req, res) => {
    const codes = await WhatsAppLinkCode.find({}).sort({ createdAt: -1 }).limit(10);
    res.json({ codes });
  });

  router.get('/debug-conversation/:phone', auth, async (req, res) => {
    const phone = `whatsapp:+${req.params.phone}`;
    const convo = await WhatsAppConversation.findOne({ phone });
    res.json({ conversation: convo || null });
  });

  router.delete('/reset/:phone', auth, async (req, res) => {
    const phone = `whatsapp:+${req.params.phone}`;
    const s     = await WhatsAppSession.deleteMany({ phone });
    const c     = await WhatsAppConversation.deleteMany({ phone });
    res.json({ sessionsDeleted: s.deletedCount, convosDeleted: c.deletedCount });
  });
}

module.exports = router;
