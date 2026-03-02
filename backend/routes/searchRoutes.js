const express = require('express');
const { searchAll } = require('../controllers/searchController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/search
// @desc    Search for users and posts
router.get('/', protect, searchAll);

module.exports = router;
