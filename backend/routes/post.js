const express = require('express');
const router = express.Router();
const { createPost, getFeedPosts, getShortVideos, getUserPosts } = require('../controllers/postController');
const { protect } = require('../middleware/auth');
const upload = require("../middleware/uploadMiddleware");

// All routes in this file are prefixed with /api/posts

// PROTECTED ROUTES

router.post("/upload", upload.single("media"), async(req, res)=>{
    try{
        const cloudfrontUrl = `${process.env.CLOUDFRONT_URL}/${req.file.key}`;

        res.json({
            message: "upload successful",
            mediaUrl: cloudfrontUrl,
        });
    }catch(error){
        res.status(500).json({error : error.message});
    } 
});


router.post('/upload', protect, createPost); // User must be logged in to create a post entry
router.get('/me', protect, getUserPosts); // User must be logged in to get their own posts
router.get('/feed', protect, getFeedPosts); // User must be logged in to view feed
router.get('/flicks', protect, getShortVideos); // User must be logged in to view flicks

module.exports = router;
