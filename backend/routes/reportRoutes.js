const express = require('express');
const { reportUser, getAllReports, updateReportStatus } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/report/user
// @desc    Report a user
router.post('/user', protect, reportUser);

// @route   GET /api/report
// @desc    Get all reports (admin only)
router.get('/', protect, getAllReports);

// @route   PUT /api/report/:id
// @desc    Update report status (admin only)
router.put('/:id', protect, updateReportStatus);

module.exports = router;
