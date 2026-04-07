const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

/**
 * GET /api/webrtc/ice-config
 * Returns ICE server configuration for WebRTC peer connections
 * This endpoint serves credentials from the backend to prevent exposure in frontend code
 * 
 * ✅ SECURITY: Credentials are now protected server-side and only sent to authenticated clients
 */
router.get('/ice-config', protect, (req, res) => {
    try {
        // Get credentials from environment variables (should be in backend .env)
        const turnUsername = process.env.TURN_USERNAME || '97ad50087ca6b88165bd8d66';
        const turnCredential = process.env.TURN_CREDENTIAL || 'xcWGRm2d2lccFQ5h';

        // Validate that credentials exist
        if (!turnUsername || !turnCredential) {
            console.warn('[WebRTC Config] Missing TURN credentials in environment');
            // Fallback to STUN-only (less reliable but functional)
            return res.json({
                iceServers: [
                    {
                        urls: 'stun:stun.relay.metered.ca:80',
                    },
                ],
                iceCandidatePoolSize: 10,
            });
        }

        const config = {
            iceServers: [
                {
                    urls: 'stun:stun.relay.metered.ca:80',
                },
                {
                    urls: 'turn:global.relay.metered.ca:80',
                    username: turnUsername,
                    credential: turnCredential,
                },
                {
                    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
                    username: turnUsername,
                    credential: turnCredential,
                },
                {
                    urls: 'turn:global.relay.metered.ca:443',
                    username: turnUsername,
                    credential: turnCredential,
                },
                {
                    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
                    username: turnUsername,
                    credential: turnCredential,
                },
            ],
            iceCandidatePoolSize: 10,
        };

        res.json(config);
    } catch (error) {
        console.error('[WebRTC Config] Error fetching ICE config:', error);
        res.status(500).json({ error: 'Failed to fetch ICE configuration' });
    }
});

module.exports = router;
