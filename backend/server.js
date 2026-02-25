// Load environment variables from the backend folder's .env file regardless of the current working directory
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.use(cors());
app.use(express.json());

// Debugging middleware to log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

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
app.use('/api/report', require('./routes/reportRoutes'));

// Basic route
app.get('/', (req, res) => {
  res.send('Hello World');
});

// Create HTTP server from Express app
const server = http.createServer(app);

// Attach Socket.io to the server
const io = new Server(server, {
    pingTimeout: 60000,
    cors: {
        origin: process.env.CLIENT_URL || "*", // Allow configured client or all
        methods: ['GET', 'POST'],
    },
});

// Setup Socket.io Connection Handler
io.on('connection', (socket) => {
    const User = require('./models/User');
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
        const Message = require('./models/Message');
        const Chat = require('./models/Chat');

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

            // Prepare lastMessage object
            const lastMessageData = {
                text: newMessageReceived.bodyText || newMessageReceived.content || (newMessageReceived.attachments && newMessageReceived.attachments.length ? 'Attachment' : ''),
                createdAt: new Date(),
                sender: {
                    _id: senderDoc._id,
                    username: senderDoc.username,
                    profilePicture: senderDoc.profilePicture
                }
            };

            // Update chat's lastMessage with populated sender
            await Chat.findByIdAndUpdate(newMessageReceived.chat, {
                lastMessage: lastMessageData,
                updatedAt: new Date()
            });

            // Emit to chat room so all participants receive the message (including sender)
            io.to(newMessageReceived.chat).emit('message received', message);

            // Emit conversationUpdated event to both users (sender and receiver)
            // This is the O(1) update - no refetch needed
            const conversationUpdate = {
                conversationId: newMessageReceived.chat,
                lastMessage: lastMessageData,
                updatedAt: new Date().toISOString(),
                senderId: newMessageReceived.sender,
                isNewMessage: true
            };

            // Send to receiver
            io.to(newMessageReceived.receiver).emit('conversationUpdated', conversationUpdate);
            
            // Send to sender (so their list also updates and re-sorts)
            io.to(newMessageReceived.sender).emit('conversationUpdated', conversationUpdate);

        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });

    // Handle typing indicators
    socket.on('typing', (room) => socket.in(room).emit('typing'));
    socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

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
