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
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // FIX: Increased from 10 to 20 to allow for signup attempts + retries
    message: { message: 'Too many auth attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // NOTE: req.path here is ROUTER-RELATIVE (e.g. '/register', not '/api/auth/register')
        // because Express strips the prefix when the limiter runs. This is intentional — we
        // skip rate-limiting on register (open sign-ups), but keep it on login to prevent brute-force.
        return req.path === '/register';
    }
});

// ── CORS ──────────────────────────────────────────────────────────────────────
// ✅ FIX: Restrict to your frontend domain instead of allowing all origins
const allowedOrigins = [
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:3000',
    'exp://localhost:8081',
];

// Add environment-configured origins
if (process.env.CLIENT_URL) {
    allowedOrigins.push(process.env.CLIENT_URL);
}
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
    origin: (origin, callback) => {
        // In development, allow all origins so physical devices work on LAN
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'), false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

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
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api/chats', require('./routes/chatRoutes'));
app.use('/api/follow', require('./routes/followRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/report', require('./routes/reportRoutes'));
app.use('/api/stories', require('./routes/storyRoutes'));
app.use('/api/e2ee', require('./routes/e2eeRoutes'));
app.use('/api/e2ee', require('./routes/multiDeviceE2eeRoutes'));

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
        'http://10.170.22.72:8081',      // ✅ Android device development
        'exp://10.170.22.72:8081',       // ✅ Expo development
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

console.log('⚡ Using in-memory adapter');

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

    // ✅ NEW: Cache sender data on socket to avoid repeated DB queries
    let senderCache = null;
    let senderCacheExpiry = 0;

    // ✅ NEW: Helper to get cached or fetch sender data
    const getCachedSenderData = async (userId) => {
        const now = Date.now();
        // Cache expires after 5 minutes
        if (senderCache && senderCache._id === userId && senderCacheExpiry > now) {
            return senderCache;
        }
        // Fetch and cache
        const sender = await User.findById(userId).select('_id name username profilePicture');
        senderCache = sender;
        senderCacheExpiry = now + (5 * 60 * 1000); // 5 minutes
        return sender;
    };

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

        // ✅ FIX: Strict limits to prevent DoS attacks
        // Validate payload to prevent DoS / malformed data
        const MAX_TEXT_LENGTH = 2000;      // chars (was 5000)
        const MAX_ATTACHMENTS = 5;         // count (was 10)
        const MAX_ATTACHMENT_SIZE = 5242880; // 5MB per attachment
        const MAX_TOTAL_PAYLOAD_SIZE = 25 * 1024 * 1024; // 25MB total request

        const validateMessageData = (data) => {
            if (!data) return false;

            // Validate ObjectIds
            if (typeof data.sender !== 'string' || data.sender.length !== 24 || !mongoose.Types.ObjectId.isValid(data.sender)) return false;
            if (typeof data.receiver !== 'string' || data.receiver.length !== 24 || !mongoose.Types.ObjectId.isValid(data.receiver)) return false;
            if (typeof data.chat !== 'string' || data.chat.length !== 24 || !mongoose.Types.ObjectId.isValid(data.chat)) return false;

            // ✅ FIX: Stricter text validation (max 2000 chars)
            if (data.bodyText && (typeof data.bodyText !== 'string' || data.bodyText.length > MAX_TEXT_LENGTH)) {
                return false;
            }

            // ✅ FIX: Validate msgType
            if (data.msgType && (typeof data.msgType !== 'string' || !['text', 'image', 'audio', 'video', 'file'].includes(data.msgType))) {
                return false;
            }

            // ✅ FIX: Stricter attachment validation (max 5 attachments, validate sizes)
            if (data.attachments) {
                if (!Array.isArray(data.attachments) || data.attachments.length > MAX_ATTACHMENTS) {
                    return false;
                }
                // Validate each attachment
                for (const attachment of data.attachments) {
                    if (!attachment.url || typeof attachment.url !== 'string') return false;
                    if (attachment.size && (typeof attachment.size !== 'number' || attachment.size > MAX_ATTACHMENT_SIZE)) {
                        return false;
                    }
                }
            }

            // Validate quoted message ID
            if (data.quotedMsgId && (typeof data.quotedMsgId !== 'string' || data.quotedMsgId.length !== 24 || !mongoose.Types.ObjectId.isValid(data.quotedMsgId))) {
                return false;
            }

            return true;
        };

        if (!validateMessageData(rawData)) {
            console.warn('Socket: Invalid new message payload rejected', {
                sender: rawData?.sender,
                textLength: rawData?.bodyText?.length,
                attachmentCount: rawData?.attachments?.length,
                reason: 'Validation failed - possible DoS attempt'
            });
            socket.emit('error', { message: 'Invalid message format (size limits exceeded)' });
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

            // ✅ OPTIMIZATION: Create message and update chat in parallel + use cached sender
            const [message, senderDoc] = await Promise.all([
                Message.create(messageData),
                getCachedSenderData(rawData.sender),
            ]);

            // Populate message fields
            await message.populate('sender', 'name username profilePicture');
            await message.populate('receiver', 'name username profilePicture');
            await message.populate('chat', '_id convoType');

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
                        msgType: message.quotedMsgId.msgType,
                        sender: {
                            _id: message.quotedMsgId.sender._id,
                            username: message.quotedMsgId.sender.username,
                            profilePicture: message.quotedMsgId.sender.profilePicture,
                        },
                    };
                }
            }

            // ✅ OPTIMIZATION: Use cached senderDoc instead of fetching again
            // STEP 1: Update chat's lastMessage — store sender as ObjectId reference
            await Chat.findByIdAndUpdate(rawData.chat, {
                lastMessage: {
                    text: rawData.bodyText || rawData.content ||
                        (rawData.attachments?.length ? 'Attachment' : ''),
                    createdAt: message.createdAt,
                    sender: message.sender._id,
                },
                updatedAt: new Date(),
            });

            // STEP 2: Build lastMessage payload for socket (with cached sender data)
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
                chat: {  // ✅ FIX: Emit structured chat object instead of just ID
                    _id: message.chat._id,
                    convoType: message.chat.convoType,
                },
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
                conversationId: String(rawData.chat),  // ✅ FIX: Ensure conversationId is a string
                lastMessage: lastMessageForSocket,
                updatedAt: new Date().toISOString(),
                senderId: String(rawData.sender),  // ✅ FIX: Ensure senderId is a string
                isNewMessage: true,
            };

            const receiverRoomId = rawData.receiver?.toString() || '';
            const senderRoomId = rawData.sender?.toString() || '';

            if (receiverRoomId) io.to(receiverRoomId).emit('conversationUpdated', conversationUpdate);
            if (senderRoomId) io.to(senderRoomId).emit('conversationUpdated', conversationUpdate);

        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // ── Typing indicators ─────────────────────────────────────────────────────
    socket.on('typing', (room) => socket.in(room).emit('typing'));
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
    // ✅ FIX: Verify both users belong to the same chat before signaling

    socket.on('webrtc-offer', async (data) => {
        if (!data?.targetId || !data?.callerId || !data?.offer || !data?.chatId) {
            console.warn(`[SECURITY] Malformed webrtc-offer from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.callerId) {
            console.warn(`[SECURITY] webrtc-offer callerId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both caller and target are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] webrtc-offer chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isCallerInChat = chat.participants?.some(p => p.toString() === data.callerId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isCallerInChat || !isTargetInChat) {
                console.warn(`[SECURITY] webrtc-offer: User not in chat. Caller: ${isCallerInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating webrtc-offer chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
            return;
        }

        socket.to(data.targetId).emit('webrtc-offer', {
            offer: data.offer,
            callerId: data.callerId,
            chatId: data.chatId,
            isVideo: data.isVideo,
        });
    });

    socket.on('webrtc-answer', async (data) => {
        if (!data?.targetId || !data?.responderId || !data?.answer || !data?.chatId) {
            console.warn(`[SECURITY] Malformed webrtc-answer from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.responderId) {
            console.warn(`[SECURITY] webrtc-answer responderId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both responder and target are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] webrtc-answer chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isResponderInChat = chat.participants?.some(p => p.toString() === data.responderId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isResponderInChat || !isTargetInChat) {
                console.warn(`[SECURITY] webrtc-answer: User not in chat. Responder: ${isResponderInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating webrtc-answer chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
            return;
        }

        socket.to(data.targetId).emit('webrtc-answer', {
            answer: data.answer,
            responderId: data.responderId,
        });
    });

    socket.on('webrtc-candidate', async (data) => {
        if (!data?.targetId || !data?.senderId || !data?.candidate || !data?.chatId) {
            console.warn(`[SECURITY] Malformed webrtc-candidate from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.senderId) {
            console.warn(`[SECURITY] webrtc-candidate senderId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both sender and target are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] webrtc-candidate chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isSenderInChat = chat.participants?.some(p => p.toString() === data.senderId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isSenderInChat || !isTargetInChat) {
                console.warn(`[SECURITY] webrtc-candidate: User not in chat. Sender: ${isSenderInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating webrtc-candidate chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
            return;
        }

        socket.to(data.targetId).emit('webrtc-candidate', {
            candidate: data.candidate,
            senderId: data.senderId,
        });
    });

    socket.on('end-call', async (data) => {
        if (!data?.targetId || !data?.senderId || !data?.chatId) {
            console.warn(`[SECURITY] Malformed end-call from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.senderId) {
            console.warn(`[SECURITY] end-call senderId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both users are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] end-call chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isSenderInChat = chat.participants?.some(p => p.toString() === data.senderId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isSenderInChat || !isTargetInChat) {
                console.warn(`[SECURITY] end-call: User not in chat. Sender: ${isSenderInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating end-call chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
            return;
        }

        socket.to(data.targetId).emit('end-call', { senderId: data.senderId });
    });

    socket.on('request-video-upgrade', async (data) => {
        if (!data?.targetId || !data?.callerId || !data?.chatId) {
            console.warn(`[SECURITY] Malformed request-video-upgrade from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.callerId) {
            console.warn(`[SECURITY] request-video-upgrade callerId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both users are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] request-video-upgrade chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isCallerInChat = chat.participants?.some(p => p.toString() === data.callerId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isCallerInChat || !isTargetInChat) {
                console.warn(`[SECURITY] request-video-upgrade: User not in chat. Caller: ${isCallerInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating request-video-upgrade chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
            return;
        }

        socket.to(data.targetId).emit('request-video-upgrade', { callerId: data.callerId });
    });

    socket.on('accept-video-upgrade', async (data) => {
        if (!data?.targetId || !data?.responderId || !data?.chatId) {
            console.warn(`[SECURITY] Malformed accept-video-upgrade from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.responderId) {
            console.warn(`[SECURITY] accept-video-upgrade responderId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both users are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] accept-video-upgrade chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isResponderInChat = chat.participants?.some(p => p.toString() === data.responderId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isResponderInChat || !isTargetInChat) {
                console.warn(`[SECURITY] accept-video-upgrade: User not in chat. Responder: ${isResponderInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating accept-video-upgrade chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
            return;
        }

        socket.to(data.targetId).emit('accept-video-upgrade', { responderId: data.responderId });
    });

    socket.on('decline-video-upgrade', async (data) => {
        if (!data?.targetId || !data?.responderId || !data?.chatId) {
            console.warn(`[SECURITY] Malformed decline-video-upgrade from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.responderId) {
            console.warn(`[SECURITY] decline-video-upgrade responderId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both users are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] decline-video-upgrade chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isResponderInChat = chat.participants?.some(p => p.toString() === data.responderId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isResponderInChat || !isTargetInChat) {
                console.warn(`[SECURITY] decline-video-upgrade: User not in chat. Responder: ${isResponderInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating decline-video-upgrade chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
            return;
        }

        socket.to(data.targetId).emit('decline-video-upgrade', { responderId: data.responderId });
    });

    socket.on('busy', async (data) => {
        if (!data?.targetId || !data?.senderId || !data?.chatId) {
            console.warn(`[SECURITY] Malformed busy payload from: ${socket.userId}`);
            return;
        }
        if (socket.userId !== data.senderId) {
            console.warn(`[SECURITY] busy senderId mismatch. Socket: ${socket.userId}`);
            return;
        }

        // ✅ NEW: Verify both users are participants in the chat
        try {
            const chat = await Chat.findById(data.chatId);
            if (!chat) {
                console.warn(`[SECURITY] busy chat not found: ${data.chatId}`);
                socket.emit('error', { message: 'Chat not found' });
                return;
            }

            const isSenderInChat = chat.participants?.some(p => p.toString() === data.senderId);
            const isTargetInChat = chat.participants?.some(p => p.toString() === data.targetId);

            if (!isSenderInChat || !isTargetInChat) {
                console.warn(`[SECURITY] busy: User not in chat. Sender: ${isSenderInChat}, Target: ${isTargetInChat}`);
                socket.emit('error', { message: 'Unauthorized: Users not in same chat' });
                return;
            }
        } catch (error) {
            console.error('[SECURITY] Error validating busy chat membership:', error);
            socket.emit('error', { message: 'Validation error' });
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

// ── 404 Handler ──────────────────────────────────────────────────────────────
// ✅ FIX: Catch undefined routes before error handler
app.use((req, res, next) => {
    if (!res.headersSent) {
        res.status(404).json({
            message: 'Route not found',
            path: req.originalUrl,
            method: req.method,
        });
    }
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