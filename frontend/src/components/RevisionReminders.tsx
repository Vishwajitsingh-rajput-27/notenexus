'use client';
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import { apiGetNotes } from '@/lib/api'
import { fetchWithRetry, safeJson } from '@/lib/fetchWithRetry';
import { useTheme, mono, ibm } from '@/lib/useTheme';

const API = process.env.NEXT_PUBLIC_API_URL?.replace('/api','') || 'http://localhost:5000';
const PRESET_INTERVALS = [1, 3, 7, 14, 30];
const TIME_PRESETS = [
  { label: 'DAWN',    value: '06:00', icon: '🌅' },
  { label: 'MORNING', value: '09:00', icon: '☀️' },
  { label: 'NOON',    value: '12:00', icon: '🌤' },
  { label: 'EVENING', value: '18:00', icon: '🌇' },
  { label: 'NIGHT',   value: '21:00', icon: '🌙' },
];
const srcIcon = (tp: string) => tp === 'pdf' ? 'PDF' : tp === 'image' ? 'IMG' : tp === 'voice' ? 'MIC' : tp === 'youtube' ? 'YT' : 'TXT';

type ScheduleType = 'repeating' | 'today' | 'custom_date' | 'interval_minutes';

const SCHEDULE_TYPES: { type: ScheduleType; label: string; icon: string; desc: string }[] = [
  { type: 'repeating',        icon: '🔁', label: 'REPEATING',       desc: 'Every N days at a set time' },
  { type: 'today',            icon: '📅', label: 'TODAY',            desc: 'Fire once today at a chosen time' },
  { type: 'custom_date',      icon: '🗓️', label: 'CUSTOM DATE',      desc: 'Fire once on a specific date' },
  { type: 'interval_minutes', icon: '⏱️', label: 'EVERY N MINUTES',  desc: 'Repeat every X minutes' },
];

export default function RevisionReminders() {
  const t = useTheme();
  const [reminders, setReminders]     = useState<any[]>([]);
  const [subject, setSubject]         = useState('');
  const [topic, setTopic]             = useState('');
  const [email, setEmail]             = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('repeating');
  const [intervalDays, setIntervalDays] = useState<number>(7);
  const [customInterval, setCustomInterval] = useState('');
  const [useCustomInterval, setUseCustomInterval] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState('30');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customDate, setCustomDate]   = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [whatsappLinked, setWhatsappLinked] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [loading, setLoading]         = useState(false);
  const [fetching, setFetching]       = useState(true);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [notes, setNotes]             = useState<any[]>([]);
  const [showNotes, setShowNotes]     = useState(false);
  const [loadedFrom, setLoadedFrom]   = useState('');
  const token = () => Cookies.get('nn_token') ?? '';

  const fetchReminders = async () => {
    try {
      const res  = await fetchWithRetry(`${API}/api/reminders`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await safeJson(res);
      setReminders(data.reminders || []);
    } catch {} finally { setFetching(false); }
  };

  useEffect(() => {
    fetchReminders();
    apiGetNotes().then((d: any) => setNotes(d.notes || [])).catch(() => {});
    // Check WhatsApp link status
    fetchWithRetry(`${API}/api/reminders/whatsapp-phone`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => safeJson(r))
      .then(d => { setWhatsappLinked(d.linked); setWhatsappPhone(d.phone || ''); })
      .catch(() => {});
  }, []);

  const loadFromNote = (note: any) => {
    setSubject(note.subject || '');
    setTopic(note.chapter || note.title || '');
    setLoadedFrom(`${srcIcon(note.sourceType)} ${note.title}`);
    setShowNotes(false);
  };

  const effectiveInterval = (): number => {
    if (useCustomInterval) {
      const v = parseInt(customInterval);
      return isNaN(v) || v < 1 ? 1 : v;
    }
    return intervalDays;
  };

  const createReminder = async () => {
    if (!subject.trim() || !topic.trim() || !email.trim()) { setError('Subject, topic and email are required'); return; }
    if (scheduleType === 'repeating' && useCustomInterval && (!customInterval || parseInt(customInterval) < 1)) {
      setError('Enter a valid custom interval (min 1 day)'); return;
    }
    if (scheduleType === 'custom_date' && !customDate) { setError('Please select a date'); return; }
    if (scheduleType === 'interval_minutes' && (!intervalMinutes || parseInt(intervalMinutes) < 1)) {
      setError('Enter a valid minute interval (min 1)'); return;
    }
    setError(''); setLoading(true);
    try {
      const body: any = {
        subject, topic, email,
        reminderTime,
        scheduleType,
        sendWhatsApp,
      };
      if (scheduleType === 'repeating')        body.intervalDays    = effectiveInterval();
      if (scheduleType === 'custom_date')      body.customDate      = customDate;
      if (scheduleType === 'interval_minutes') body.intervalMinutes = parseInt(intervalMinutes);

      const res  = await fetchWithRetry(`${API}/api/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || data.error || 'Request failed');

      const msgParts = ['Reminder set!'];
      if (scheduleType !== 'today' && scheduleType !== 'custom_date') msgParts.push('First notification sent.');
      if (sendWhatsApp && whatsappLinked) msgParts.push('WhatsApp enabled ✓');
      else if (sendWhatsApp && !whatsappLinked) msgParts.push('WhatsApp not linked — email only.');
      setSuccess(msgParts.join(' '));
      setReminders(p => [data.reminder, ...p]);
      setSubject(''); setTopic(''); setEmail(''); setLoadedFrom('');
      setCustomInterval(''); setUseCustomInterval(false); setCustomDate('');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const deleteReminder = async (id: string) => {
    try {
      await fetchWithRetry(`${API}/api/reminders/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      setReminders(p => p.filter(r => r._id !== id));
    } catch {}
  };

  const formatTime = (val: string) => {
    if (!val) return '';
    const [h, m] = val.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h % 12) || 12).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const scheduleLabel = (r: any) => {
    if (r.isOneShot) {
      const d = new Date(r.oneShotAt || r.nextReminder);
      return `Once — ${d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })} at ${formatTime(r.reminderTime)}`;
    }
    if (r.intervalDays === 0) return `Every ? minutes`;
    return `Every ${r.intervalDays} day(s) at ${formatTime(r.reminderTime)}`;
  };

  const inp: React.CSSProperties = {
    width: '100%', background: t.inpBg, border: `1px solid ${t.inpBorder}`,
    padding: '10px 14px', color: t.inpText, fontFamily: ibm, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = { fontFamily: mono, fontSize: 9, color: t.fgMuted, letterSpacing: '0.12em', marginBottom: 6, display: 'block' };
  const codeBlock: React.CSSProperties = { background: t.bg3, border: `1px solid ${t.border}` };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: t.accent, letterSpacing: '0.15em', marginBottom: 6 }}>// AI_TOOLS</div>
        <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', color: t.fg }}>
          REVISION<span style={{ color: t.accent }}>_REMINDERS</span>
        </h2>
        <p style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, marginTop: 4 }}>
          Spaced repetition reminders — via email and/or WhatsApp.
        </p>
      </div>

      {/* Form */}
      <div style={{ ...codeBlock, padding: 24, marginBottom: 24 }}>

        {/* Load from note */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={label}>// LOAD_FROM_NOTE</div>
            <button onClick={() => setShowNotes(v => !v)}
              style={{ fontFamily: mono, fontSize: 9, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}>
              {showNotes ? 'CLOSE ▲' : 'BROWSE ▼'}
            </button>
          </div>
          {loadedFrom && (
            <div style={{ fontFamily: mono, fontSize: 10, color: '#4ADE80', padding: '6px 10px', background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', marginBottom: 8 }}>
              ✓ Loaded: {loadedFrom}
            </div>
          )}
          {showNotes && (
            <div style={{ border: `1px solid ${t.border}`, maxHeight: 200, overflow: 'auto' }}>
              {notes.length === 0
                ? <div style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim, padding: '12px 14px' }}>No notes found.</div>
                : notes.map(n => (
                  <div key={n._id} onClick={() => loadFromNote(n)}
                    style={{ padding: '10px 14px', borderBottom: `1px solid ${t.borderSub}`, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = t.bg2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: t.accent, background: t.bg2, padding: '2px 6px', flexShrink: 0 }}>{srcIcon(n.sourceType)}</span>
                    <span style={{ fontFamily: ibm, fontSize: 12, color: t.fg }}>{n.title}</span>
                    <span style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted, marginLeft: 'auto', flexShrink: 0 }}>{n.subject}</span>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* Subject + Topic */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={label}>// SUBJECT</div>
            <input style={inp} placeholder="e.g. Biology" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <div style={label}>// TOPIC</div>
            <input style={inp} placeholder="e.g. Cell Division" value={topic} onChange={e => setTopic(e.target.value)} />
          </div>
        </div>

        {/* Email */}
        <div style={{ marginBottom: 18 }}>
          <div style={label}>// EMAIL</div>
          <input style={inp} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        {/* WhatsApp toggle */}
        <div style={{ marginBottom: 20, padding: '12px 14px', background: sendWhatsApp ? 'rgba(74,222,128,0.06)' : t.bg2, border: `1px solid ${sendWhatsApp ? 'rgba(74,222,128,0.25)' : t.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSendWhatsApp(v => !v)}
            style={{ width: 36, height: 20, borderRadius: 10, background: sendWhatsApp ? '#4ADE80' : t.border, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: sendWhatsApp ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: sendWhatsApp ? '#0a0a0a' : t.fg, transition: 'left 0.2s' }} />
          </button>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: sendWhatsApp ? '#4ADE80' : t.fgDim, letterSpacing: '0.1em' }}>
              📱 ALSO_SEND_VIA_WHATSAPP
            </div>
            {sendWhatsApp && (
              <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim, marginTop: 3 }}>
                {whatsappLinked
                  ? `✓ Linked to ${whatsappPhone}`
                  : '⚠️ No linked account — go to WhatsApp tab to link first'}
              </div>
            )}
          </div>
        </div>

        {/* Schedule type selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={label}>// SCHEDULE_TYPE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {SCHEDULE_TYPES.map(s => (
              <div key={s.type} onClick={() => setScheduleType(s.type)}
                style={{ padding: '10px 12px', border: `1px solid ${scheduleType === s.type ? 'rgba(74,222,128,0.4)' : t.border}`, background: scheduleType === s.type ? 'rgba(74,222,128,0.07)' : t.bg2, cursor: 'pointer' }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: scheduleType === s.type ? '#4ADE80' : t.fg, letterSpacing: '0.08em', marginBottom: 2 }}>
                  {s.icon} {s.label}
                </div>
                <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule options — conditional on type */}

        {/* REPEATING */}
        {scheduleType === 'repeating' && (
          <div style={{ marginBottom: 16 }}>
            <div style={label}>// INTERVAL</div>
            {!useCustomInterval ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {PRESET_INTERVALS.map(d => (
                  <button key={d} onClick={() => setIntervalDays(d)}
                    style={{ fontFamily: mono, fontSize: 11, padding: '6px 14px', border: `1px solid ${intervalDays === d ? '#4ADE80' : t.border}`, background: intervalDays === d ? 'rgba(74,222,128,0.1)' : 'transparent', color: intervalDays === d ? '#4ADE80' : t.fgDim, cursor: 'pointer', letterSpacing: '0.08em' }}>
                    {d}d
                  </button>
                ))}
                <button onClick={() => setUseCustomInterval(true)}
                  style={{ fontFamily: mono, fontSize: 11, padding: '6px 14px', border: `1px solid ${t.border}`, background: 'transparent', color: t.fgDim, cursor: 'pointer' }}>
                  CUSTOM
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input style={{ ...inp, width: 100 }} type="number" min={1} placeholder="days" value={customInterval} onChange={e => setCustomInterval(e.target.value)} />
                <span style={{ fontFamily: mono, fontSize: 11, color: t.fgDim }}>days</span>
                <button onClick={() => { setUseCustomInterval(false); setCustomInterval(''); }}
                  style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, background: 'none', border: 'none', cursor: 'pointer' }}>✕ PRESET</button>
              </div>
            )}
          </div>
        )}

        {/* INTERVAL_MINUTES */}
        {scheduleType === 'interval_minutes' && (
          <div style={{ marginBottom: 16 }}>
            <div style={label}>// EVERY_N_MINUTES</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {[15, 30, 45, 60, 90, 120].map(m => (
                <button key={m} onClick={() => setIntervalMinutes(String(m))}
                  style={{ fontFamily: mono, fontSize: 11, padding: '6px 14px', border: `1px solid ${intervalMinutes === String(m) ? '#4ADE80' : t.border}`, background: intervalMinutes === String(m) ? 'rgba(74,222,128,0.1)' : 'transparent', color: intervalMinutes === String(m) ? '#4ADE80' : t.fgDim, cursor: 'pointer' }}>
                  {m}m
                </button>
              ))}
            </div>
            <input style={{ ...inp, width: 140 }} type="number" min={1} placeholder="or custom minutes" value={intervalMinutes} onChange={e => setIntervalMinutes(e.target.value)} />
          </div>
        )}

        {/* CUSTOM_DATE */}
        {scheduleType === 'custom_date' && (
          <div style={{ marginBottom: 16 }}>
            <div style={label}>// DATE</div>
            <input style={{ ...inp, width: 200 }} type="date" min={minDate} value={customDate} onChange={e => setCustomDate(e.target.value)} />
          </div>
        )}

        {/* TODAY — no extra fields, just time picker below */}
        {scheduleType === 'today' && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(251,255,72,0.05)', border: '1px solid rgba(251,255,72,0.2)' }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: '#FBFF48', letterSpacing: '0.1em' }}>
              ⚡ ONE-TIME — fires today at the time you choose below
            </div>
          </div>
        )}

        {/* Time picker — not shown for interval_minutes */}
        {scheduleType !== 'interval_minutes' && (
          <div style={{ marginBottom: 18 }}>
            <div style={label}>// TIME</div>
            {!useCustomTime ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {TIME_PRESETS.map(tp => (
                  <button key={tp.value} onClick={() => setReminderTime(tp.value)}
                    style={{ fontFamily: mono, fontSize: 10, padding: '6px 12px', border: `1px solid ${reminderTime === tp.value ? '#4ADE80' : t.border}`, background: reminderTime === tp.value ? 'rgba(74,222,128,0.1)' : 'transparent', color: reminderTime === tp.value ? '#4ADE80' : t.fgDim, cursor: 'pointer', letterSpacing: '0.06em' }}>
                    {tp.icon} {tp.label}
                  </button>
                ))}
                <button onClick={() => setUseCustomTime(true)}
                  style={{ fontFamily: mono, fontSize: 10, padding: '6px 12px', border: `1px solid ${t.border}`, background: 'transparent', color: t.fgDim, cursor: 'pointer' }}>
                  CUSTOM
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="time" style={{ ...inp, width: 140 }} value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
                <button onClick={() => setUseCustomTime(false)}
                  style={{ fontFamily: mono, fontSize: 9, color: t.fgDim, background: 'none', border: 'none', cursor: 'pointer' }}>✕ PRESET</button>
              </div>
            )}
            <div style={{ fontFamily: mono, fontSize: 10, color: '#4ADE80', marginTop: 4, letterSpacing: '0.08em' }}>
              → {formatTime(reminderTime)}
            </div>
          </div>
        )}

        {/* Error / Success */}
        {error   && <div style={{ fontFamily: ibm, fontSize: 12, color: '#f87171', marginBottom: 12, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>{error}</div>}
        {success && <div style={{ fontFamily: ibm, fontSize: 12, color: '#4ADE80', marginBottom: 12, padding: '8px 12px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>{success}</div>}

        <button onClick={createReminder} disabled={loading}
          style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', padding: '10px 24px', background: loading ? t.bg2 : '#4ADE80', color: loading ? t.fgDim : '#0a0a0a', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', width: '100%' }}>
          {loading ? 'CREATING...' : '⚡ SET_REMINDER'}
        </button>
      </div>

      {/* Active reminders list */}
      <div style={{ ...codeBlock }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, letterSpacing: '0.12em' }}>// ACTIVE_REMINDERS</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: t.accent }}>{reminders.length} active</div>
        </div>
        {fetching ? (
          <div style={{ padding: '20px 18px', fontFamily: mono, fontSize: 11, color: t.fgMuted }}>LOADING...</div>
        ) : reminders.length === 0 ? (
          <div style={{ padding: '20px 18px', fontFamily: ibm, fontSize: 13, color: t.fgDim }}>No active reminders yet.</div>
        ) : (
          reminders.map((r, i) => (
            <div key={r._id} style={{ padding: '14px 18px', borderBottom: i < reminders.length - 1 ? `1px solid ${t.borderSub}` : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: t.fg, fontWeight: 700, marginBottom: 3 }}>{r.topic}</div>
                <div style={{ fontFamily: ibm, fontSize: 11, color: t.fgDim, marginBottom: 4 }}>{r.subject}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: t.accent, background: t.bg2, padding: '2px 8px', letterSpacing: '0.08em' }}>
                    {scheduleLabel(r)}
                  </span>
                  {r.sendWhatsApp && (
                    <span style={{ fontFamily: mono, fontSize: 9, color: '#4ADE80', background: 'rgba(74,222,128,0.08)', padding: '2px 8px' }}>📱 WhatsApp</span>
                  )}
                  <span style={{ fontFamily: mono, fontSize: 9, color: t.fgMuted }}>#{r.repetitions} sent</span>
                </div>
              </div>
              <button onClick={() => deleteReminder(r._id)}
                style={{ fontFamily: mono, fontSize: 9, color: '#f87171', background: 'none', border: '1px solid rgba(248,113,113,0.25)', padding: '4px 10px', cursor: 'pointer', flexShrink: 0, letterSpacing: '0.08em' }}>
                CANCEL
              </button>
            </div>
          ))
        )}
      </div>

      {/* WhatsApp quick-set guide */}
      <div style={{ ...codeBlock, marginTop: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: t.fgDim, letterSpacing: '0.12em' }}>// SET_REMINDERS_FROM_WHATSAPP</div>
        </div>
        {[
          { cmd: 'remind me: Calculus | Maths | today 18:00',        desc: 'One-time reminder today at 6 PM' },
          { cmd: 'remind me: Cell biology | Biology | every 3 days 09:00', desc: 'Repeat every 3 days at 9 AM' },
          { cmd: 'remind me: Vocab | English | every 30 minutes',    desc: 'Repeat every 30 minutes' },
          { cmd: 'remind me: Past papers | Physics | on 2026-04-15 10:00', desc: 'One-time on April 15th at 10 AM' },
          { cmd: 'reminders',                                         desc: 'List all your active reminders' },
          { cmd: 'cancel reminder 2',                                 desc: 'Cancel reminder #2 from the list' },
        ].map((row, i, arr) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${t.borderSub}` : 'none', alignItems: 'flex-start' }}>
            <code style={{ fontFamily: mono, fontSize: 10, color: '#4ADE80', flexShrink: 0, minWidth: 220, paddingTop: 1 }}>{row.cmd}</code>
            <span style={{ fontFamily: ibm, fontSize: 12, color: t.fgDim }}>{row.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
