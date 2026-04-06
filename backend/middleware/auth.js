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

            if (!req.user) {
                console.error('[Auth] User not found for ID:', decoded.id);
                return res.status(401).json({ message: 'User not found' });
            }

            return next(); // Move to the next middleware or controller function
        } catch (error) {
            // Check if it's a token expiration error
            if (error.name === 'TokenExpiredError') {
                console.error('[Auth] Token expired');
                return res.status(401).json({ 
                    message: 'Access token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            if (error.name === 'JsonWebTokenError') {
                console.error('[Auth] Invalid token:', error.message);
                return res.status(401).json({ message: 'Invalid token format' });
            }
            console.error('[Auth] Token verification failed:', error);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        console.error('[Auth] No token provided in Authorization header');
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(401).json({ message: 'Not authorized as an admin' });
    }
};

module.exports = { protect, admin };
