// Load environment variables from the backend folder's .env file regardless of the current working directory
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ✅ FIX: Crash early if critical env vars are missing
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not set in .env file');
    process.exit(1);
}
if (!process.env.MONGO_URI) {
    console.error('FATAL: MONGO_URI is not set in .env file');
    process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();

// ── Security: HTTP headers ────────────────────────────────────────────────────
app.use(helmet());

// ── Security: General rate limiting ──────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// ── Security: Stricter rate limiting for auth routes ─────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── CORS ──────────────────────────────────────────────────────────────────────
// ✅ FIX: Restrict to your frontend domain instead of allowing all origins
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:8081',
    credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ── Static file serving ───────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── MongoDB Connection ────────────────────────────────────────────────────────
const mongoOptions = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

mongoose.connect(process.env.MONGO_URI, mongoOptions)
    .then(() => console.log('MongoDB Atlas connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// ── Test DB endpoint (non-production only) ────────────────────────────────────
// ✅ FIX: Guard behind NODE_ENV check so it's never exposed in production
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/test/db', async (req, res) => {
        try {
            const User = require('./models/User');
            const Chat = require('./models/Chat');
            res.json({
                mongoConnected: mongoose.connection.readyState === 1,
                userCount: await User.countDocuments(),
                chatCount: await Chat.countDocuments(),
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

// ── API Routes ────────────────────────────────────────────────────────────────
// ✅ FIX: authLimiter is now actually applied to the auth routes
app.use('/api/auth',    authLimiter, require('./routes/auth'));
app.use('/api/posts',               require('./routes/postRoutes'));
app.use('/api/profile',             require('./routes/profileRoutes'));
app.use('/api/media',               require('./routes/mediaRoutes'));
app.use('/api/chats',               require('./routes/chatRoutes'));
app.use('/api/follow',              require('./routes/followRoutes'));
app.use('/api/users',               require('./routes/userRoutes'));
app.use('/api/search',              require('./routes/searchRoutes'));
app.use('/api/report',              require('./routes/reportRoutes'));

app.get('/', (req, res) => res.send('Hello World'));

// ── HTTP + Socket.io Server ───────────────────────────────────────────────────
const server = http.createServer(app);

// ✅ FIX: Removed wildcard '*' from the fallback origins list
const socketOrigins = process.env.SOCKET_ORIGINS
    ? process.env.SOCKET_ORIGINS.split(',')
    : [
        'https://astrachitchat.onrender.com',
        'http://localhost:8081',
        'http://localhost:8082',
        'exp://localhost:8081',
    ];

const io = new Server(server, {
    pingTimeout: 120000,
    pingInterval: 25000,
    cors: {
        origin: socketOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

app.set('io', io);

// ── Socket.io Auth Middleware ─────────────────────────────────────────────────
// ✅ FIX: jwt.verify() result is now assigned to `decoded`
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        next();
    } catch (error) {
        next(new Error('Authentication error'));
    }
});

// ── Socket.io Connection Handler ─────────────────────────────────────────────
io.on('connection', (socket) => {
    // Require models inside handler to avoid circular dependency issues at startup
    const User = require('./models/User');
    const Chat = require('./models/Chat');

    console.log('A user connected via socket.');

    // ── setup: user joins their own room ─────────────────────────────────────
    socket.on('setup', async (userData) => {
        socket.join(userData._id);
        socket.emit('connected');
        try {
            await User.findByIdAndUpdate(userData._id, {
                isOnline: true,
                lastSeen: new Date(),
            });
            io.emit('user online', { userId: userData._id, isOnline: true });
        } catch (error) {
            console.error('Error updating user online status:', error);
        }
    });

    // ── join chat room ────────────────────────────────────────────────────────
    socket.on('join chat', (room) => {
        socket.join(room);
        console.log('User joined room: ' + room);
    });

    // ── new message ───────────────────────────────────────────────────────────
    // ✅ FIX: All references to undefined `newMessageReceived` replaced with `rawData`
    socket.on('new message', async (rawData) => {
        const Message = require('./models/Message');

        // Validate payload to prevent DoS / malformed data
        const validateMessageData = (data) => {
            return (
                data &&
                typeof data.sender === 'string' && data.sender.length === 24 && mongoose.Types.ObjectId.isValid(data.sender) &&
                typeof data.receiver === 'string' && data.receiver.length === 24 && mongoose.Types.ObjectId.isValid(data.receiver) &&
                typeof data.chat === 'string' && data.chat.length === 24 && mongoose.Types.ObjectId.isValid(data.chat) &&
                (!data.bodyText || (typeof data.bodyText === 'string' && data.bodyText.length <= 5000)) &&
                (!data.msgType || (typeof data.msgType === 'string' && ['text', 'image', 'audio', 'video', 'file'].includes(data.msgType))) &&
                (!data.attachments || (Array.isArray(data.attachments) && data.attachments.length <= 10)) &&
                (!data.quotedMsgId || (typeof data.quotedMsgId === 'string' && data.quotedMsgId.length === 24 && mongoose.Types.ObjectId.isValid(data.quotedMsgId)))
            );
        };

        if (!validateMessageData(rawData)) {
            console.warn('Socket: Invalid new message payload rejected');
            socket.emit('error', { message: 'Invalid message format' });
            return;
        }

        // Quick auth check — verify sender matches authenticated socket user
        if (socket.userId !== rawData.sender) {
            console.warn(`Socket: Sender mismatch. Socket user: ${socket.userId}, Payload sender: ${rawData.sender}`);
            socket.emit('error', { message: 'Unauthorized sender' });
            return;
        }

        try {
            const messageData = {
                sender: new mongoose.Types.ObjectId(rawData.sender),
                receiver: new mongoose.Types.ObjectId(rawData.receiver),
                chat: new mongoose.Types.ObjectId(rawData.chat),
                bodyText: rawData.bodyText?.trim() || rawData.content?.trim() || '',
                msgType: rawData.msgType || 'text',
                attachments: rawData.attachments || [],
                quotedMsgId: rawData.quotedMsgId
                    ? new mongoose.Types.ObjectId(rawData.quotedMsgId)
                    : undefined,
                readBy: [{ user: new mongoose.Types.ObjectId(rawData.sender), readAt: new Date() }],
            };

            // Create and populate the message
            const message = await Message.create(messageData);
            await message.populate('sender', 'name username profilePicture');
            await message.populate('receiver', 'name username profilePicture');

            // Populate quoted message if present
            let quotedMessageData = null;
            if (message.quotedMsgId) {
                await message.populate({
                    path: 'quotedMsgId',
                    populate: { path: 'sender', select: 'name username profilePicture' },
                });
                if (message.quotedMsgId?._id) {
                    quotedMessageData = {
                        _id: message.quotedMsgId._id,
                        bodyText: message.quotedMsgId.bodyText,
                        sender: {
                            _id: message.quotedMsgId.sender._id,
                            username: message.quotedMsgId.sender.username,
                            profilePicture: message.quotedMsgId.sender.profilePicture,
                        },
                    };
                }
            }

            // ✅ FIX: Using rawData instead of undefined newMessageReceived
            // STEP 1: Update chat's lastMessage — store sender as ObjectId reference
            await Chat.findByIdAndUpdate(rawData.chat, {
                lastMessage: {
                    text: rawData.bodyText || rawData.content ||
                        (rawData.attachments?.length ? 'Attachment' : ''),
                    createdAt: message.createdAt,
                    sender: message.sender._id, // Store ObjectId, not full object
                },
                updatedAt: new Date(),
            });

            // STEP 2: Fetch sender doc for socket event
            const senderDoc = await User.findById(rawData.sender).select('name username profilePicture');

            // STEP 3: Build lastMessage payload for socket (with populated sender)
            const lastMessageForSocket = {
                text: rawData.bodyText || rawData.content ||
                    (rawData.attachments?.length ? 'Attachment' : ''),
                createdAt: message.createdAt,
                sender: {
                    _id: senderDoc._id,
                    username: senderDoc.username,
                    profilePicture: senderDoc.profilePicture,
                },
            };

            // Build final message object to emit to chat room
            const messageToEmit = {
                _id: message._id,
                sender: message.sender,
                receiver: message.receiver,
                chat: message.chat,
                msgType: message.msgType,
                bodyText: message.bodyText,
                attachments: message.attachments,
                createdAt: message.createdAt,
                readBy: [rawData.sender],
                deliveredTo: [rawData.sender],
                quotedMsgId: rawData.quotedMsgId || undefined,
                quotedMessage: quotedMessageData,
            };

            // Emit message to all participants in the chat room
            io.to(rawData.chat).emit('message received', messageToEmit);

            // Emit conversationUpdated to both sender and receiver
            // so both users' chat lists update in real time
            const conversationUpdate = {
                conversationId: rawData.chat,
                lastMessage: lastMessageForSocket,
                updatedAt: new Date().toISOString(),
                senderId: rawData.sender,
                isNewMessage: true,
            };

            const receiverRoomId = rawData.receiver?.toString() || '';
            const senderRoomId = rawData.sender?.toString() || '';

            if (receiverRoomId) io.to(receiverRoomId).emit('conversationUpdated', conversationUpdate);
            if (senderRoomId)   io.to(senderRoomId).emit('conversationUpdated', conversationUpdate);

        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // ── Typing indicators ─────────────────────────────────────────────────────
    socket.on('typing',      (room) => socket.in(room).emit('typing'));
    socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

    // ── Read receipts (Blue Ticks) ────────────────────────────────────────────
    // ✅ FIX: jwt.verify() result is now correctly assigned and chained with ?.id
    socket.on('read messages', (room) => {
        socket.in(room).emit('messages read');

        try {
            const userId = socket.handshake.auth?.token
                ? jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET)?.id
                : null;

            if (userId) {
                socket.to(userId).emit('messages read', { chatId: room, readerId: userId });
            }
        } catch (error) {
            console.error('Error in read messages handler:', error);
        }
    });

    // ── Delivery receipts (Double Gray Ticks) ─────────────────────────────────
    socket.on('message delivered', async (data) => {
        try {
            const Message = require('./models/Message');
            const { Types: { ObjectId: toObjectId } } = require('mongoose');

            if (data.messageId && data.receiverId) {
                const message = await Message.findById(data.messageId);
                if (message) {
                    const alreadyDelivered = message.deliveredTo?.some(
                        d => d.user.toString() === data.receiverId.toString()
                    );
                    if (!alreadyDelivered) {
                        message.deliveredTo.push({
                            user: new toObjectId(data.receiverId),
                            deliveredAt: new Date(),
                        });
                        await message.save();
                    }
                }
            }

            socket.in(data.chatId).emit('message delivered', data);
            if (data.senderId) {
                socket.to(data.senderId).emit('message delivered', data);
            }
        } catch (error) {
            console.error('Error handling message delivery:', error);
        }
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────────

    socket.on('webrtc-offer', (data) => {
        if (!data?.targetId || !data?.callerId || !data?.offer) {
            console.warn(`[SECURITY] Malformed webrtc-offer from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.callerId) {
            console.warn(`[SECURITY] webrtc-offer callerId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('webrtc-offer', {
            offer: data.offer,
            callerId: data.callerId,
            chatId: data.chatId,
            isVideo: data.isVideo,
        });
    });

    socket.on('webrtc-answer', (data) => {
        if (!data?.targetId || !data?.responderId || !data?.answer) {
            console.warn(`[SECURITY] Malformed webrtc-answer from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.responderId) {
            console.warn(`[SECURITY] webrtc-answer responderId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('webrtc-answer', {
            answer: data.answer,
            responderId: data.responderId,
        });
    });

    socket.on('webrtc-candidate', (data) => {
        if (!data?.targetId || !data?.senderId || !data?.candidate) {
            console.warn(`[SECURITY] Malformed webrtc-candidate from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.senderId) {
            console.warn(`[SECURITY] webrtc-candidate senderId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('webrtc-candidate', {
            candidate: data.candidate,
            senderId: data.senderId,
        });
    });

    socket.on('end-call', (data) => {
        if (!data?.targetId || !data?.senderId) {
            console.warn(`[SECURITY] Malformed end-call from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.senderId) {
            console.warn(`[SECURITY] end-call senderId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('end-call', { senderId: data.senderId });
    });

    socket.on('request-video-upgrade', (data) => {
        if (!data?.targetId || !data?.callerId) {
            console.warn(`[SECURITY] Malformed request-video-upgrade from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.callerId) {
            console.warn(`[SECURITY] request-video-upgrade callerId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('request-video-upgrade', { callerId: data.callerId });
    });

    socket.on('accept-video-upgrade', (data) => {
        if (!data?.targetId || !data?.responderId) {
            console.warn(`[SECURITY] Malformed accept-video-upgrade from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.responderId) {
            console.warn(`[SECURITY] accept-video-upgrade responderId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('accept-video-upgrade', { responderId: data.responderId });
    });

    socket.on('decline-video-upgrade', (data) => {
        if (!data?.targetId || !data?.responderId) {
            console.warn(`[SECURITY] Malformed decline-video-upgrade from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.responderId) {
            console.warn(`[SECURITY] decline-video-upgrade responderId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('decline-video-upgrade', { responderId: data.responderId });
    });

    socket.on('busy', (data) => {
        if (!data?.targetId || !data?.senderId) {
            console.warn(`[SECURITY] Malformed busy payload from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.senderId) {
            console.warn(`[SECURITY] busy senderId mismatch. Socket: ${socket.userId}`);
            return;
        }
        socket.to(data.targetId).emit('busy', { senderId: data.senderId });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    // ✅ FIX: jwt.verify() result is now assigned to `decoded`
    socket.on('disconnect', async () => {
        console.log('User disconnected');
        if (socket.handshake.auth?.token) {
            try {
                const decoded = jwt.verify(
                    socket.handshake.auth.token,
                    process.env.JWT_SECRET
                );
                if (decoded?.id) {
                    await User.findByIdAndUpdate(decoded.id, {
                        isOnline: false,
                        lastSeen: new Date(),
                    });
                    io.emit('user online', {
                        userId: decoded.id,
                        isOnline: false,
                        lastSeen: new Date(),
                    });
                }
            } catch (error) {
                console.log('Error updating offline status:', error);
            }
        }
    });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// ✅ FIX: Error handler is registered BEFORE server.listen(), not after
// ✅ FIX: Removed duplicate error handler and broken brace structure
app.use((err, req, res, next) => {
    console.error('🔥 ERROR:', {
        url: req.originalUrl,
        method: req.method,
        message: err.message,
    });
    res.status(500).json({ message: 'Server Error' });
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () =>
    console.log(`Server and Socket.io running on port ${PORT}`)
);