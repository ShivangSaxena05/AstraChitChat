const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000/api';

async function testChatAPI() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const User = require('./models/User');
    const Chat = require('./models/Chat');
    const Message = require('./models/Message');

    // Get test users
    const users = await User.find({}).limit(2);
    if (users.length < 2) {
      console.log('Need at least 2 users for testing');
      return;
    }

    const user1 = users[0];
    const user2 = users[1];

    console.log(`Testing chat between ${user1.username} and ${user2.username}`);

    // Get a valid token by registering a test user
    console.log('\nGetting auth token...');
    const timestamp = Date.now();
    const email = `test.chat${timestamp}@example.com`;

    const registerResp = await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Test Chat User',
      email,
      password: 'Password123'
    });

    const token = registerResp.data.token;
    console.log('Token obtained');

    // Test 1: Create chat
    console.log('\n1. Testing chat creation...');
    try {
      const createChatResponse = await axios.post(`${BASE_URL}/chats`, {
        participants: [user2._id]
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Chat created:', createChatResponse.data);
      const chatId = createChatResponse.data._id;

      // Test 2: Get chats
      console.log('\n2. Testing get chats...');
      const getChatsResponse = await axios.get(`${BASE_URL}/chats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('Chats retrieved:', getChatsResponse.data.chats.length);

      // Test 3: Send message
      console.log('\n3. Testing send message...');
      const sendMessageResponse = await axios.post(`${BASE_URL}/chats/${chatId}/messages`, {
        content: 'Test message from API',
        chatType: 'text'
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Message sent:', sendMessageResponse.data);

      // Test 4: Get messages
      console.log('\n4. Testing get messages...');
      const getMessagesResponse = await axios.get(`${BASE_URL}/chats/${chatId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('Messages retrieved:', getMessagesResponse.data.messages.length);

      console.log('\n✅ All chat API tests passed!');

    } catch (error) {
      console.error('API test error:', error.response?.data || error.message);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

testChatAPI();
