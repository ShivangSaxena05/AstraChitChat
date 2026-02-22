const mongoose = require('mongoose');
require('dotenv').config();

async function testAPI() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const Follow = require('./models/Follow');

    // Check current state
    const follows = await Follow.find({});
    console.log('Current follows:', follows.length);

    // Test counts
    const adityaId = '68ff82db9b49fde4adbb4162';
    const shivangId = '68fc499774e6e81cb38fd093';

    const followersCount = await Follow.countDocuments({ following: shivangId });
    const followingCount = await Follow.countDocuments({ follower: adityaId });

    console.log('Shivang followers:', followersCount);
    console.log('Aditya following:', followingCount);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

testAPI();
