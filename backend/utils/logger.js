/**
 * utils/logger.js — NoteNexus structured logger
 *
 * Uses console.log / console.error so output is always captured by Render,
 * PM2, Docker, and any other stdout-based log viewer.
 *
 * Usage:
 *   const log = require('../utils/logger')('whatsapp');
 *   log.info('Webhook received', { from, text });
 *   log.error('Send failed', err);
 *   log.bot(from, text, reply);
 */

'use strict';

// ── ANSI colour helpers (auto-stripped when stdout is not a TTY) ─────────────

const isTTY = Boolean(process.stdout.isTTY);

const C = isTTY
  ? {
      reset  : '\x1b[0m',
      dim    : '\x1b[2m',
      bold   : '\x1b[1m',
      cyan   : '\x1b[36m',
      green  : '\x1b[32m',
      yellow : '\x1b[33m',
      red    : '\x1b[31m',
      magenta: '\x1b[35m',
      blue   : '\x1b[34m',
      white  : '\x1b[37m',
    }
  : Object.fromEntries(
      ['reset','dim','bold','cyan','green','yellow','red','magenta','blue','white']
        .map(k => [k, ''])
    );

// ── Level definitions ─────────────────────────────────────────────────────────

const LEVELS = {
  debug : { label: 'DEBUG', colour: C.dim     },
  info  : { label: 'INFO ', colour: C.cyan    },
  ok    : { label: 'OK   ', colour: C.green   },
  warn  : { label: 'WARN ', colour: C.yellow  },
  error : { label: 'ERROR', colour: C.red     },
  bot   : { label: 'BOT  ', colour: C.magenta },
  cron  : { label: 'CRON ', colour: C.blue    },
  db    : { label: 'DB   ', colour: C.green   },
};

// ── Timestamp ─────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

// ── Serialise extras ──────────────────────────────────────────────────────────

function serialise(extra) {
  if (!extra) return '';

  if (extra instanceof Error) {
    const stack =
      extra.stack && process.env.NODE_ENV !== 'production'
        ? `\n${extra.stack}`
        : '';
    return `  => ${extra.message}${stack}`;
  }

  if (typeof extra === 'object') {
    try {
      const str = JSON.stringify(extra, null, 2);
      return str.length <= 120 ? `  ${str}` : '\n' + str;
    } catch {
      return '  [non-serialisable]';
    }
  }

  return `  ${String(extra)}`;
}

// ── Core print — uses console so Render always captures it ───────────────────

function print(module, level, message, extra) {
  const def   = LEVELS[level] ?? LEVELS.info;
  const badge = `${def.colour}${C.bold}${def.label}${C.reset}`;
  const mod   = `${C.dim}[${module.toUpperCase().padEnd(12)}]${C.reset}`;
  const time  = `${C.dim}${ts()}${C.reset}`;
  const msg   = `${C.white}${message}${C.reset}`;
  const line  = `${time} ${badge} ${mod} ${msg}${serialise(extra)}`;

  // console.error writes to stderr; everything else to stdout.
  // Both streams are captured by Render's log viewer.
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

// ── Divider ───────────────────────────────────────────────────────────────────

function divider(label = '') {
  const bar  = '─'.repeat(60);
  const text = label ? ` ${label.toUpperCase()} ` : '';
  const fill = bar.slice(0, Math.max(0, 60 - text.length));
  console.log(`${C.dim}${bar}${text}${fill}${C.reset}`);
}

// ── WhatsApp conversation formatter ──────────────────────────────────────────

function botConversation(module, from, userText, botReply) {
  const phone  = from.replace('whatsapp:', '').trim();
  const header = `${C.magenta}${C.bold}┌─── WhatsApp · ${phone}${C.reset}`;
  const user   = `${C.dim}│${C.reset}  👤  ${C.white}${(userText  ?? '').slice(0, 200)}${C.reset}`;
  const bot    = `${C.dim}│${C.reset}  🤖  ${C.cyan}${(botReply  ?? '').slice(0, 200)}${C.reset}`;
  const footer = `${C.magenta}${C.dim}└${'─'.repeat(54)}${C.reset}`;
  const time   = `${C.dim}${ts()}${C.reset}`;

  console.log(
    `${time} ${LEVELS.bot.colour}${C.bold}BOT  ${C.reset} ${C.dim}[${module.toUpperCase().padEnd(12)}]${C.reset}\n` +
    `${header}\n${user}\n${bot}\n${footer}\n`
  );
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createLogger(module) {
  return {
    info   : (msg, extra) => print(module, 'info',  msg, extra),
    ok     : (msg, extra) => print(module, 'ok',    msg, extra),
    warn   : (msg, extra) => print(module, 'warn',  msg, extra),
    error  : (msg, extra) => print(module, 'error', msg, extra),
    debug  : (msg, extra) => {
      if (process.env.NODE_ENV === 'production' && !process.env.DEBUG) return;
      print(module, 'debug', msg, extra);
    },
    cron   : (msg, extra) => print(module, 'cron',  msg, extra),
    db     : (msg, extra) => print(module, 'db',    msg, extra),
    bot    : (from, userText, botReply) => botConversation(module, from, userText, botReply),
    divider,
  };
}

module.exports = createLogger;
