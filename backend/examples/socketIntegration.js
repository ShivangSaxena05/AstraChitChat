/**
 * Socket.io Integration with Lazy Defaults
 * 
 * Shows how to integrate handleUserConnect and handleUserDisconnect
 * to maintain accurate isOnline and lastSeen timestamps.
 */

const { io } = require('socket.io')();
const { 
  handleUserConnect, 
  handleUserDisconnect,
  handleUserLogin
} = require('../utils/lazyDefaults');

// ────────────────────────────────────────────────────────────────────────────
// CONNECTION HANDLERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Main socket connection handler
 */
io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.userId}`);

  // Update user as online
  if (socket.userId) {
    handleUserConnect(socket.userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // USER PRESENCE EVENTS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * User is typing in a chat
   */
  socket.on('user:typing', (data) => {
    const { chatId } = data;

    // Broadcast to other users in chat that this user is typing
    socket.to(chatId).emit('user:typing', {
      userId: socket.userId,
      chatId,
      timestamp: new Date(),
    });

    // Update user's lastSeen to show they're active
    handleUserConnect(socket.userId);
  });

  /**
   * User stopped typing
   */
  socket.on('user:stopped-typing', (data) => {
    const { chatId } = data;

    socket.to(chatId).emit('user:stopped-typing', {
      userId: socket.userId,
      chatId,
    });
  });

  /**
   * User viewed a message
   */
  socket.on('message:viewed', (data) => {
    const { messageId, chatId } = data;

    // Update user presence
    handleUserConnect(socket.userId);

    // Notify sender that message was viewed
    socket.to(chatId).emit('message:viewed', {
      messageId,
      viewedBy: socket.userId,
      viewedAt: new Date(),
    });
  });

  /**
   * User is active (any interaction)
   */
  socket.on('user:active', () => {
    // Update lastSeen on every user activity
    handleUserConnect(socket.userId);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MESSAGE EVENTS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Receive new message
   */
  socket.on('message:send', (data) => {
    const { chatId, content } = data;

    // Update user as active
    handleUserConnect(socket.userId);

    // Emit to chat participants
    socket.to(chatId).emit('message:new', {
      ...data,
      senderId: socket.userId,
      timestamp: new Date(),
    });
  });

  /**
   * Message delivery receipt
   */
  socket.on('message:delivered', (data) => {
    const { messageId, chatId } = data;

    handleUserConnect(socket.userId);

    socket.to(chatId).emit('message:delivered', {
      messageId,
      deliveredBy: socket.userId,
      deliveredAt: new Date(),
    });
  });

  /**
   * Message read receipt
   */
  socket.on('message:read', (data) => {
    const { messageId, chatId } = data;

    handleUserConnect(socket.userId);

    socket.to(chatId).emit('message:read', {
      messageId,
      readBy: socket.userId,
      readAt: new Date(),
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ONLINE STATUS EVENTS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Broadcast user's online status to followers/contacts
   */
  function broadcastUserStatus(userId, isOnline) {
    // Notify all connected clients about status change
    io.emit('user:status', {
      userId,
      isOnline,
      timestamp: new Date(),
    });
  }

  /**
   * Get online status of specific users
   */
  socket.on('users:status-check', (data) => {
    const { userIds } = data;

    // Query which users are online
    const onlineUsers = [];
    for (const userId of userIds) {
      // Check if user has connected socket
      const userSockets = io.of('/').sockets.sockets;
      const isOnline = Array.from(userSockets.values())
        .some(s => s.userId === userId);
      
      if (isOnline) {
        onlineUsers.push(userId);
      }
    }

    socket.emit('users:status-response', {
      onlineUsers,
      timestamp: new Date(),
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GRACEFUL DISCONNECT
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Handle user disconnect
   */
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] User disconnected: ${socket.userId} (${reason})`);

    if (socket.userId) {
      // Update user as offline and set lastSeen
      handleUserDisconnect(socket.userId);

      // Broadcast status change to others
      broadcastUserStatus(socket.userId, false);
    }
  });

  /**
   * Handle disconnect timeout
   */
  socket.on('disconnect_timeout', () => {
    console.log(`[Socket] User timeout: ${socket.userId}`);

    if (socket.userId) {
      handleUserDisconnect(socket.userId);
      broadcastUserStatus(socket.userId, false);
    }
  });

  /**
   * Handle connection error
   */
  socket.on('error', (error) => {
    console.error(`[Socket] Error for user ${socket.userId}:`, error);

    if (socket.userId) {
      handleUserDisconnect(socket.userId);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SOCKET MIDDLEWARE
// ────────────────────────────────────────────────────────────────────────────

/**
 * Middleware to extract userId from JWT token in socket handshake
 */
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.email = decoded.email;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

/**
 * Middleware to authenticate socket connection
 */
io.use((socket, next) => {
  if (!socket.userId) {
    return next(new Error('Socket userId is required'));
  }
  next();
});

// ────────────────────────────────────────────────────────────────────────────
// PERIODIC STATUS UPDATES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Periodically sync user presence status with database
 * Runs every 30 seconds
 */
setInterval(() => {
  const sockets = io.of('/').sockets.sockets;
  const onlineUserIds = new Set();

  sockets.forEach(socket => {
    if (socket.userId) {
      onlineUserIds.add(socket.userId);
    }
  });

  // Could emit to all connected clients if needed
  console.log(`[Presence] ${onlineUserIds.size} users currently online`);
}, 30000);

// ────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get online user count
 */
function getOnlineUserCount() {
  const sockets = io.of('/').sockets.sockets;
  const uniqueUsers = new Set(
    Array.from(sockets.values()).map(s => s.userId)
  );
  return uniqueUsers.size;
}

/**
 * Get list of online users
 */
function getOnlineUsers() {
  const sockets = io.of('/').sockets.sockets;
  const onlineUsers = new Set(
    Array.from(sockets.values()).map(s => s.userId).filter(Boolean)
  );
  return Array.from(onlineUsers);
}

/**
 * Check if specific user is online
 */
function isUserOnline(userId) {
  const sockets = io.of('/').sockets.sockets;
  return Array.from(sockets.values()).some(s => s.userId === userId);
}

/**
 * Get all sockets for a user (handle multiple connections)
 */
function getUserSockets(userId) {
  const sockets = io.of('/').sockets.sockets;
  return Array.from(sockets.values()).filter(s => s.userId === userId);
}

/**
 * Send message to specific user across all their connections
 */
function sendToUser(userId, event, data) {
  const userSockets = getUserSockets(userId);
  userSockets.forEach(socket => {
    socket.emit(event, data);
  });
}

/**
 * Broadcast message to all users except sender
 */
function broadcastExcept(userId, event, data) {
  io.emit(event, { ...data, senderId: userId });
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  io,
  getOnlineUserCount,
  getOnlineUsers,
  isUserOnline,
  getUserSockets,
  sendToUser,
  broadcastExcept,
};
