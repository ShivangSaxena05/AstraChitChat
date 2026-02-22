const Report = require('../models/Report');
const User = require('../models/User');
const asyncHandler = require('./asyncHandler');

// @desc    Report a user
// @route   POST /api/report/user
// @access  Private
const reportUser = asyncHandler(async (req, res) => {
    const { reportedUserId, reason, description } = req.body;

    if (!reportedUserId || !reason) {
        return res.status(400).json({ message: 'Reported user ID and reason are required' });
    }

    // Check if user is trying to report themselves
    if (req.user._id.toString() === reportedUserId) {
        return res.status(400).json({ message: 'You cannot report yourself' });
    }

    // Check if reported user exists
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
        return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has already reported this user
    const existingReport = await Report.findOne({
        reportedUser: reportedUserId,
        reportedBy: req.user._id
    });

    if (existingReport) {
        return res.status(400).json({ message: 'You have already reported this user' });
    }

    // Create the report
    const report = await Report.create({
        reportedUser: reportedUserId,
        reportedBy: req.user._id,
        reason,
        description
    });

    res.status(201).json({
        message: 'User reported successfully',
        report: {
            _id: report._id,
            reason: report.reason,
            status: report.status,
            createdAt: report.createdAt
        }
    });
});

// @desc    Get all reports (admin only)
// @route   GET /api/report
// @access  Private/Admin
const getAllReports = asyncHandler(async (req, res) => {
    const reports = await Report.find({})
        .populate('reportedUser', 'username name email')
        .populate('reportedBy', 'username name email')
        .sort({ createdAt: -1 });

    res.json({ reports });
});

// @desc    Update report status (admin only)
// @route   PUT /api/report/:id
// @access  Private/Admin
const updateReportStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (!['pending', 'reviewed', 'resolved'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    const report = await Report.findById(req.params.id);

    if (!report) {
        return res.status(404).json({ message: 'Report not found' });
    }

    report.status = status;
    await report.save();

    res.json({ message: 'Report status updated', report });
});

module.exports = {
    reportUser,
    getAllReports,
    updateReportStatus
};
