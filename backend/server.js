
// Load environment variables from the backend folder's .env file regardless of the current working directory
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// Performance optimizations
app.use(cors());

// Optimize JSON parsing - increase limit for media uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from the uploads directory with caching
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '1d',
    etag: true
}));

// MongoDB Atlas Connection Options - optimized for performance
const mongoOptions = {
    maxPoolSize: 20, // Increased from 10 for better concurrency
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferCommands: false, // Disable mongoose buffering
};

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, mongoOptions)
    .then(() => console.log('MongoDB Atlas connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Handle mongoose connection events
mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

// Use auth routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api/chats', require('./routes/chatRoutes'));
app.use('/api/follow', require('./routes/followRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/report', require('./routes/reportRoutes'));

// Basic route
app.get('/', (req, res) => {
    res.send('Hello World');
});

// Create HTTP server from Express app
const server = http.createServer(app);

// Attach Socket.io to the server with optimized settings
const io = new Server(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    cors: {
        origin: '*', // Allow all origins for development
        methods: ['GET', 'POST'],
    },
    // Performance: optimize memory usage
    perMessageDeflate: {
        threshold: 1024,
    },
});

// Cache models outside of connection handler for performance
const User = require('./models/User');
const Chat = require('./models/Chat');
const Message = require('./models/Message');

// Setup Socket.io Connection Handler
io.on('connection', (socket) => {
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

    // Handle sending messages
    socket.on('new message', async (newMessageReceived) => {
        try {
            // Save message to database
            const message = await Message.create({
                sender: newMessageReceived.sender,
                receiver: newMessageReceived.receiver,
                chat: newMessageReceived.chat,
                bodyText: newMessageReceived.bodyText || newMessageReceived.content,
                msgType: newMessageReceived.msgType || newMessageReceived.chatType || 'text',
                attachments: newMessageReceived.attachments || [],
                quotedMsgId: newMessageReceived.quotedMsgId,
                readBy: [{ user: newMessageReceived.sender, readAt: new Date() }]
            });

            // Populate sender and receiver details
            await message.populate('sender', 'name username profilePicture');
            await message.populate('receiver', 'name username profilePicture');

            // Get sender details for lastMessage
            const senderDoc = await User.findById(newMessageReceived.sender).select('name username profilePicture');

            // Update chat's lastMessage with sender as ObjectId reference
            await Chat.findByIdAndUpdate(newMessageReceived.chat, {
                lastMessage: {
                    text: newMessageReceived.bodyText || newMessageReceived.content || (newMessageReceived.attachments && newMessageReceived.attachments.length ? 'Attachment' : ''),
                    createdAt: message.createdAt,
                    sender: message.sender._id
                },
                updatedAt: new Date()
            });

            // Fetch the updated chat with populated sender for socket event
            const updatedChat = await Chat.findById(newMessageReceived.chat)
                .populate('lastMessage.sender', 'name username profilePicture');

            // Create properly formatted lastMessage for socket event
            const lastMessageForSocket = {
                text: updatedChat.lastMessage.text,
                createdAt: updatedChat.lastMessage.createdAt,
                sender: {
                    _id: senderDoc._id,
                    username: senderDoc.username,
                    profilePicture: senderDoc.profilePicture
                }
            };

            // Emit to chat room so all participants receive the message (including sender)
            io.to(newMessageReceived.chat).emit('message received', message);

            // Emit conversationUpdated event to both users
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
    socket.on('read messages', (room) => socket.in(room).emit('messages read'));

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

