const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Used to fetch user details later

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header (Format: 'Bearer TOKEN')
            token = req.headers.authorization.split(' ')[1];

            // Verify token (uses the JWT_SECRET from your .env)
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Fetch user, but EXCLUDE the password, and attach the user object to the request
            // This allows subsequent controller functions to know who the user is via req.user
            req.user = await User.findById(decoded.id).select('-password');

            return next(); // Move to the next middleware or controller function
        } catch (error) {
            console.error(error);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = { protect };
