// Load environment variables from the backend folder's .env file regardless of the current working directory
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Security: Set various HTTP headers
app.use(helmet());

// Security: Rate limiting - prevent brute force attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// Auth routes need stricter rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit to 10 login attempts per 15 minutes
    message: { message: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit body size to prevent large payload attacks

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Atlas Connection Options
const mongoOptions = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, mongoOptions)
    .then(() => console.log('MongoDB Atlas connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Use auth routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api/chats', require('./routes/chatRoutes'));
app.use('/api/follow', require('./routes/followRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/report', require('./routes/reportRoutes'));

// Basic route
app.get('/', (req, res) => {
    res.send('Hello World');
});

// Create HTTP server from Express app
const server = http.createServer(app);

// Attach Socket.io to the server
// Allow multiple origins for production (Expo, web, mobile)
const socketOrigins = process.env.SOCKET_ORIGINS 
    ? process.env.SOCKET_ORIGINS.split(',') 
    : ['http://localhost:8081', 'http://localhost:8082', 'exp://localhost:8081'];

const io = new Server(server, {
    pingTimeout: 60000,
    cors: {
        origin: socketOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
});

// Setup Socket.io Connection Handler
io.on('connection', (socket) => {
    const User = require('./models/User');

    // Require Chat model here to avoid circular dependencies
    const Chat = require('./models/Chat');

    console.log('A user connected via socket.');

    // User joins their own room for private messaging
    socket.on('setup', async (userData) => {
        socket.join(userData._id);
        socket.emit('connected');

        // Update user online status
        try {
            await User.findByIdAndUpdate(userData._id, {
                isOnline: true,
                lastSeen: new Date()
            });

            // Emit user online status to all connected clients
            io.emit('user online', { userId: userData._id, isOnline: true });
        } catch (error) {
            console.error('Error updating user online status:', error);
        }
    });

    // User joins a chat room
    socket.on('join chat', (room) => {
        socket.join(room);
        console.log('User joined room: ' + room);
    });

    // ✅ SECURITY: Validate 'new message' payload before processing
    socket.on('new message', async (rawData) => {
        const Message = require('./models/Message');
        const mongoose = require('mongoose');
        const User = require('./models/User');

        // Validation schema (prevent DoS/malformed data)
        const validateMessageData = (data: any) => {
            return data &&
                typeof data.sender === 'string' && data.sender.length === 24 && mongoose.Types.ObjectId.isValid(data.sender) &&
                typeof data.receiver === 'string' && data.receiver.length === 24 && mongoose.Types.ObjectId.isValid(data.receiver) &&
                typeof data.chat === 'string' && data.chat.length === 24 && mongoose.Types.ObjectId.isValid(data.chat) &&
                (typeof data.bodyText === 'string' && data.bodyText.length <= 5000 || !data.bodyText) &&
                (typeof data.msgType === 'string' && ['text','image','audio','video','file'].includes(data.msgType) || !data.msgType) &&
                (Array.isArray(data.attachments) && data.attachments.length <= 10 || !data.attachments) &&
                (!data.quotedMsgId || (typeof data.quotedMsgId === 'string' && data.quotedMsgId.length === 24 && mongoose.Types.ObjectId.isValid(data.quotedMsgId)));
        };

        if (!validateMessageData(rawData)) {
            console.warn('Socket: Invalid new message payload rejected');
            socket.emit('error', { message: 'Invalid message format' });
            return;
        }

        // Quick auth check - verify sender exists (cheap query)
        try {
            const sender = await User.findById(rawData.sender).select('_id');
            if (!sender) {
                console.warn('Socket: Invalid sender:', rawData.sender);
                socket.emit('error', { message: 'Invalid sender' });
                return;
            }
        } catch (e) {
            console.error('Sender validation failed:', e);
            return;
        }

        try {
            const messageData = {
                sender: new mongoose.Types.ObjectId(rawData.sender),
                receiver: new mongoose.Types.ObjectId(rawData.receiver),
                chat: new mongoose.Types.ObjectId(rawData.chat),
                bodyText: rawData.bodyText?.trim() || rawData.content?.trim() || '',
                msgType: rawData.msgType || rawData.chatType || 'text',
                attachments: rawData.attachments || [],
                quotedMsgId: rawData.quotedMsgId ? new mongoose.Types.ObjectId(rawData.quotedMsgId) : undefined,
                readBy: [{ user: new mongoose.Types.ObjectId(rawData.sender), readAt: new Date() }]
            };

            // Create message
            const message = await Message.create(messageData);

            // Populate sender, receiver, and quoted message details
            await message.populate('sender', 'name username profilePicture');
            await message.populate('receiver', 'name username profilePicture');

            // Populate quoted message if it exists
            let quotedMessageData = null;
            if (message.quotedMsgId) {
                await message.populate({
                    path: 'quotedMsgId',
                    populate: { path: 'sender', select: 'name username profilePicture' }
                });

                // Need to re-check after populate as the message might have been deleted/unsent
                if (message.quotedMsgId && message.quotedMsgId._id) {
                    // Create quotedMessage object for frontend
                    quotedMessageData = {
                        _id: message.quotedMsgId._id,
                        bodyText: message.quotedMsgId.bodyText,
                        sender: {
                            _id: message.quotedMsgId.sender._id,
                            username: message.quotedMsgId.sender.username,
                            profilePicture: message.quotedMsgId.sender.profilePicture
                        }
                    };
                }
            }

            // Get sender details for lastMessage
            const senderDoc = await User.findById(newMessageReceived.sender).select('name username profilePicture');

            // ========================================================================
            // FIX EXPLANATION:
            // The Chat model's lastMessage.sender field is defined as:
            //   sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
            // 
            // This means MongoDB expects an ObjectId (reference), NOT a plain object.
            // Solution: Store sender as ObjectId in the database, then fetch the
            // populated data separately for the socket event.
            // ========================================================================

            // STEP 1: Update chat's lastMessage with sender as ObjectId reference
            await Chat.findByIdAndUpdate(newMessageReceived.chat, {
                lastMessage: {
                    text: newMessageReceived.bodyText || newMessageReceived.content || (newMessageReceived.attachments && newMessageReceived.attachments.length ? 'Attachment' : ''),
                    createdAt: message.createdAt,
                    sender: message.sender._id // IMPORTANT: Store as ObjectId, not object
                },
                updatedAt: new Date()
            });

            // STEP 2: Fetch the updated chat with populated sender for socket event
            const updatedChat = await Chat.findById(newMessageReceived.chat)
                .populate('lastMessage.sender', 'name username profilePicture');

            // STEP 3: Create properly formatted lastMessage for socket event
            const lastMessageForSocket = {
                text: updatedChat.lastMessage.text,
                createdAt: updatedChat.lastMessage.createdAt,
                sender: {
                    _id: senderDoc._id,
                    username: senderDoc.username,
                    profilePicture: senderDoc.profilePicture
                }
            };

            // Create the final message object to emit
            const messageToEmit = {
                _id: message._id,
                sender: message.sender,
                receiver: message.receiver,
                chat: message.chat,
                msgType: message.msgType,
                bodyText: message.bodyText,
                attachments: message.attachments,
                createdAt: message.createdAt,
                readBy: [newMessageReceived.sender],
                deliveredTo: [newMessageReceived.sender],
                quotedMsgId: newMessageReceived.quotedMsgId ? newMessageReceived.quotedMsgId : undefined,
                quotedMessage: quotedMessageData
            };

            // Emit to chat room so all participants receive the message (including sender)
            io.to(newMessageReceived.chat).emit('message received', messageToEmit);

            // ========================================================================
            // Emit conversationUpdated event to both users (sender and receiver)
            // This is the key to real-time chat list updates!
            // ========================================================================

            const conversationUpdate = {
                conversationId: newMessageReceived.chat,
                lastMessage: lastMessageForSocket,
                updatedAt: new Date().toISOString(),
                senderId: newMessageReceived.sender,
                isNewMessage: true
            };

            // Ensure room IDs are strictly strings
            const receiverRoomId = newMessageReceived.receiver ? newMessageReceived.receiver.toString() : '';
            const senderRoomId = newMessageReceived.sender ? newMessageReceived.sender.toString() : '';

            // Send to receiver (so their chat list updates)
            if (receiverRoomId) io.to(receiverRoomId).emit('conversationUpdated', conversationUpdate);

            // Send to sender (so their list also updates and re-sorts)
            if (senderRoomId) io.to(senderRoomId).emit('conversationUpdated', conversationUpdate);

        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });

    // Handle typing indicators
    socket.on('typing', (room) => socket.in(room).emit('typing'));
    socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

    // Handle real-time read receipts (Blue Ticks)
    socket.on('read messages', (room) => {
        // Emit to the chat room for all participants
        socket.in(room).emit('messages read');

        // Also emit to the sender's personal room so they can update their own message status
        const userId = socket.handshake.auth?.token ?
            require('jsonwebtoken').verify(socket.handshake.auth.token, process.env.JWT_SECRET || 'your-secret-key')?.id : null;
        if (userId) {
            socket.to(userId).emit('messages read', { chatId: room, readerId: userId });
        }
    });

    // Handle real-time delivery receipts (Double Gray Ticks)
    socket.on('message delivered', async (data) => {
        try {
            const Message = require('./models/Message');
            const toObjectId = require('mongoose').Types.ObjectId;

            // Only update if we received the message id and receiver id
            if (data.messageId && data.receiverId) {
                const message = await Message.findById(data.messageId);
                if (message) {
                    // Check if already marked delivered
                    const alreadyDelivered = message.deliveredTo &&
                        message.deliveredTo.some(d => d.user.toString() === data.receiverId.toString());

                    if (!alreadyDelivered) {
                        message.deliveredTo.push({ user: toObjectId(data.receiverId), deliveredAt: new Date() });
                        await message.save();
                    }
                }
            }

            // Forward the delivery receipt to the chat room
            socket.in(data.chatId).emit('message delivered', data);

            // Also explicitly forward to the sender's personal room
            if (data.senderId) {
                socket.to(data.senderId).emit('message delivered', data);
            }
        } catch (error) {
            console.error('Error handling message delivery:', error);
        }
    });

    // ========================================================================
    // WEBRTC SIGNALING FOR AUDIO CALLS
    // ========================================================================

    // Handle incoming WebRTC offer
    socket.on('webrtc-offer', (data) => {
        console.log('Forwarding webrtc-offer to:', data.targetId);
        socket.to(data.targetId).emit('webrtc-offer', {
            offer: data.offer,
            callerId: data.callerId,
            chatId: data.chatId
        });
    });

    // Handle incoming WebRTC answer
    socket.on('webrtc-answer', (data) => {
        console.log('Forwarding webrtc-answer to:', data.targetId);
        socket.to(data.targetId).emit('webrtc-answer', {
            answer: data.answer,
            responderId: data.responderId
        });
    });

    // Handle incoming ICE Candidate for WebRTC
    socket.on('webrtc-candidate', (data) => {
        console.log('Forwarding webrtc-candidate to:', data.targetId);
        socket.to(data.targetId).emit('webrtc-candidate', {
            candidate: data.candidate,
            senderId: data.senderId
        });
    });

    // Handle ending or declining a call
    socket.on('end-call', (data) => {
        socket.to(data.targetId).emit('end-call', {
            senderId: data.senderId
        });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
        console.log('User disconnected');

        // Get userId from socket and update online status
        if (socket.handshake.auth && socket.handshake.auth.token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET || 'your-secret-key');

                if (decoded && decoded.id) {
                    await User.findByIdAndUpdate(decoded.id, {
                        isOnline: false,
                        lastSeen: new Date()
                    });

                    // Emit user offline status to all connected clients
                    io.emit('user online', { userId: decoded.id, isOnline: false, lastSeen: new Date() });
                }
            } catch (error) {
                console.log('Error updating offline status:', error);
            }
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server and Socket.io running on port ${PORT}`));

