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
        origin: 'http://localhost:8081', // Expo client URL
        methods: ['GET', 'POST'],
    },
});

// Setup Socket.io Connection Handler
io.on('connection', (socket) => {
    console.log('A user connected via socket.');

    // User joins their own room for private messaging
    socket.on('setup', (userData) => {
        socket.join(userData._id);
        socket.emit('connected');
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
                readBy: [{ user: newMessageReceived.sender, readAt: new Date() }] // sender has read their own message
            });

            // Populate sender and receiver details
            await message.populate('sender', 'name username profilePicture');
            await message.populate('receiver', 'name username profilePicture');

            // Update chat's lastMessage
            await Chat.findByIdAndUpdate(newMessageReceived.chat, {
                lastMessage: {
                    text: newMessageReceived.bodyText || newMessageReceived.content || (newMessageReceived.attachments && newMessageReceived.attachments.length ? 'Attachment' : ''),
                    createdAt: new Date()
                },
                updatedAt: new Date()
            });

            // Emit to chat room so all participants receive the message (including sender)
            io.to(newMessageReceived.chat).emit('message received', message);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });

    // Handle typing indicators
    socket.on('typing', (room) => socket.in(room).emit('typing'));
    socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server and Socket.io running on port ${PORT}`));
