const mongoose = require('mongoose');
require('dotenv').config();

async function testFollow() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const Follow = require('./models/Follow');

    const adityaId = '68ff82db9b49fde4adbb4162'; // Aditya
    const shivangId = '68fc499774e6e81cb38fd093'; // Shivang

    console.log('Creating follow relationship: Aditya -> Shivang');
    await Follow.create({
      follower: adityaId,
      following: shivangId
    });

    const follows = await Follow.find({});
    console.log('Follows after creation:', follows);

    // Check counts
    const followersCount = await Follow.countDocuments({ following: shivangId });
    const followingCount = await Follow.countDocuments({ follower: adityaId });

    console.log('Shivang followers count:', followersCount);
    console.log('Aditya following count:', followingCount);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

testFollow();
