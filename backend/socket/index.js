const log = require('../utils/logger')('socket');

/**
 * NoteNexus — Socket.io Real-Time Handler
 * FIXED: Added all Group Study / quiz events that the frontend emits/listens to.
 *
 * Frontend emits:  join-study-room, quiz-start, quiz-answer, quiz-leaderboard, quiz-end
 * Frontend listens: member-joined, member-left, quiz-started, player-answered,
 *                   leaderboard-update, quiz-ended, room-users,
 *                   note-updated, user-typing, user-stopped-typing, upvote-update, shared-note-alert
 */

const setupSocket = (io) => {
  // roomCode → Map<socketId, userName>
  const rooms = {};

  io.on('connection', (socket) => {
    log.info('Client connected', { socketId: socket.id });

    // ── Join a note collaboration room (legacy — used by ClassHub) ────────
    socket.on('join-room', ({ roomId, userName }) => {
      socket.join(roomId);
      if (!rooms[roomId]) rooms[roomId] = new Map();
      rooms[roomId].set(socket.id, userName);
      io.to(roomId).emit('room-users', { users: Array.from(rooms[roomId].values()), joined: userName });
      log.info('User joined room', { userName, roomId });
    });

    // ── Join a Group Study room ───────────────────────────────────────────
    // FIX: frontend emits 'join-study-room' but old backend only listened on 'join-room'
    socket.on('join-study-room', ({ roomCode, userName }) => {
      socket.join(roomCode);
      if (!rooms[roomCode]) rooms[roomCode] = new Map();
      rooms[roomCode].set(socket.id, userName);
      // Notify others in the room
      socket.to(roomCode).emit('member-joined', { userName });
      // Send updated full list to everyone
      io.to(roomCode).emit('room-users', { users: Array.from(rooms[roomCode].values()) });
      log.info('User joined study room', { userName, roomCode });
    });

    // ── Live note content updates ─────────────────────────────────────────
    socket.on('note-update', ({ roomId, content, userName }) => {
      socket.to(roomId).emit('note-updated', { content, updatedBy: userName });
    });

    // ── Typing indicators ─────────────────────────────────────────────────
    socket.on('typing',      ({ roomId, userName }) => socket.to(roomId).emit('user-typing',         { userName }));
    socket.on('stop-typing', ({ roomId, userName }) => socket.to(roomId).emit('user-stopped-typing', { userName }));

    // ── Live upvote broadcast ─────────────────────────────────────────────
    socket.on('note-upvoted',   ({ noteId, upvotes }) => io.emit('upvote-update', { noteId, upvotes }));

    // ── Class hub: new shared note alert ──────────────────────────────────
    socket.on('new-shared-note', ({ title, subject, userName }) => {
      socket.broadcast.emit('shared-note-alert', { title, subject, sharedBy: userName });
    });

    // ── Group Study Quiz: host starts a quiz ─────────────────────────────
    // FIX: frontend emits 'quiz-start'; old backend had no handler for it
    socket.on('quiz-start', ({ roomCode, questions, hostName }) => {
      log.info('Quiz started', { roomCode, questions: questions?.length, hostName });
      // Broadcast to ALL in room including host so everyone enters quiz view
      io.to(roomCode).emit('quiz-started', { questions });
    });

    // ── Group Study Quiz: player submits answer ───────────────────────────
    // FIX: frontend emits 'quiz-answer'; old backend had no handler
    socket.on('quiz-answer', ({ roomCode, userId, userName, questionIndex, answer, isCorrect }) => {
      // Tell everyone that a player answered (for "X players answered" counter)
      io.to(roomCode).emit('player-answered', { userName, questionIndex, isCorrect });
    });

    // ── Group Study Quiz: host pushes updated leaderboard ─────────────────
    socket.on('quiz-leaderboard', ({ roomCode, leaderboard }) => {
      io.to(roomCode).emit('leaderboard-update', { leaderboard });
    });

    // ── Group Study Quiz: quiz ends ───────────────────────────────────────
    socket.on('quiz-end', ({ roomCode, finalLeaderboard, winner }) => {
      log.info('Quiz ended', { roomCode, winner });
      io.to(roomCode).emit('quiz-ended', { finalLeaderboard, winner });
    });

    // ── Disconnect: clean up rooms ────────────────────────────────────────
    socket.on('disconnect', () => {
      for (const [roomId, users] of Object.entries(rooms)) {
        if (users.has(socket.id)) {
          const userName = users.get(socket.id);
          users.delete(socket.id);
          io.to(roomId).emit('member-left',  { userName });
          io.to(roomId).emit('room-users',   { users: Array.from(users.values()), left: userName });
          if (users.size === 0) delete rooms[roomId];
        }
      }
      log.info('Client disconnected', { socketId: socket.id });
    });
  });
};

module.exports = setupSocket;
