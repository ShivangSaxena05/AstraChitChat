
const OLD_HARDCODED_CONFIGURATION = {
  iceServers: [
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "97ad50087ca6b88165bd8d66",  // ❌ EXPOSED - NOW MOVED TO BACKEND
        credential: "xcWGRm2d2lccFQ5h",         // ❌ EXPOSED - NOW MOVED TO BACKEND
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "97ad50087ca6b88165bd8d66",  // ❌ EXPOSED - NOW MOVED TO BACKEND
        credential: "xcWGRm2d2lccFQ5h",         // ❌ EXPOSED - NOW MOVED TO BACKEND
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "97ad50087ca6b88165bd8d66",  // ❌ EXPOSED - NOW MOVED TO BACKEND
        credential: "xcWGRm2d2lccFQ5h",         // ❌ EXPOSED - NOW MOVED TO BACKEND
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "97ad50087ca6b88165bd8d66",  // ❌ EXPOSED - NOW MOVED TO BACKEND
        credential: "xcWGRm2d2lccFQ5h",         // ❌ EXPOSED - NOW MOVED TO BACKEND
      },
  ],
  iceCandidatePoolSize: 10,
};

// ✅ NEW: Configuration is fetched from backend at runtime
// See: frontend/contexts/CallContext.tsx - fetchIceConfig()
// Endpoint: GET /api/webrtc/ice-config
