const mongoose = require('mongoose');
require('dotenv').config();

async function checkFollows() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const Follow = require('./models/Follow');
    const follows = await Follow.find({});
    console.log('Current follows in database:', follows);

    // Check specific users if they exist
    const User = require('./models/User');
    const users = await User.find({}, 'name username _id');
    console.log('Users in database:', users);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkFollows();
