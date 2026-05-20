import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "capacitor://localhost",
  "ionic://localhost",
].filter(Boolean);

const pendingKey = (coupleId) => `pending_calls:${coupleId}`;

const createRedisBridge = async (io) => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO Redis adapter enabled");
    return { pubClient, subClient };
  } catch (error) {
    console.warn("Redis adapter unavailable, falling back to in-memory socket state", error.message);
    await Promise.allSettled([pubClient.disconnect(), subClient.disconnect()]);
    return null;
  }
};

export const initializeSocket = async (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    },
  });

  const redisBridge = await createRedisBridge(io);

  // In-memory fallback store to track who clicked "Accept"
  const pendingCalls = new Map();

  const addPendingAcceptance = async (coupleId, userId) => {
    if (redisBridge) {
      const key = pendingKey(coupleId);
      await redisBridge.pubClient.sAdd(key, userId);
      await redisBridge.pubClient.expire(key, 30 * 60);
      return redisBridge.pubClient.sCard(key);
    }

    if (!pendingCalls.has(coupleId)) {
      pendingCalls.set(coupleId, new Set());
    }

    const callRoom = pendingCalls.get(coupleId);
    callRoom.add(userId);
    return callRoom.size;
  };

  const clearPendingAcceptances = async (coupleId) => {
    if (redisBridge) {
      await redisBridge.pubClient.del(pendingKey(coupleId));
      return;
    }

    pendingCalls.delete(coupleId);
  };

  const removePendingAcceptance = async (coupleId, userId) => {
    if (redisBridge) {
      const key = pendingKey(coupleId);
      await redisBridge.pubClient.sRem(key, userId);
      return redisBridge.pubClient.sCard(key);
    }

    const callRoom = pendingCalls.get(coupleId);
    if (!callRoom) return 0;

    callRoom.delete(userId);
    if (callRoom.size === 0) {
      pendingCalls.delete(coupleId);
    }

    return callRoom.size;
  };

  io.on("connection", (socket) => {
    // We pass these from the React frontend when connecting
    const { userId, coupleId } = socket.handshake.query;

    if (!userId || !coupleId) return socket.disconnect();

    // 1. Join their private couple's room
    socket.join(coupleId);
    console.log(`User ${userId} joined room ${coupleId}`);

    // 2. Handle an "Accept" click
    socket.on("accept_call", async () => {
      const acceptedCount = await addPendingAcceptance(coupleId, userId);

      // If size is 2, BOTH partners accepted!
      if (acceptedCount === 2) {
        io.to(coupleId).emit("start_video"); // Tell React to open the camera
        await clearPendingAcceptances(coupleId); // Reset state
      }
    });

    // --- WebRTC Signaling Logic ---

    // 1. Relay the Offer
    socket.on("webrtc_offer", (offer) => {
      socket.to(coupleId).emit("webrtc_offer", offer);
    });

    // 2. Relay the Answer
    socket.on("webrtc_answer", (answer) => {
      socket.to(coupleId).emit("webrtc_answer", answer);
    });

    // 3. Relay the ICE Candidates (Network routing info)
    socket.on("webrtc_ice_candidate", (candidate) => {
      socket.to(coupleId).emit("webrtc_ice_candidate", candidate);
    });

    // 3. Handle a "Decline" click
    socket.on("decline_call", async () => {
      // If one person declines, cancel the call for both
      io.to(coupleId).emit("cancel_call");
      await clearPendingAcceptances(coupleId);
    });

    socket.on("disconnect", async () => {
      console.log(`User ${userId} disconnected`);

      const remainingCount = await removePendingAcceptance(coupleId, userId);

      // If remaining participants < 2, cancel the pending call
      if (remainingCount < 2) {
        io.to(coupleId).emit("cancel_call");
        await clearPendingAcceptances(coupleId);
      }
    });
  });

  return io;
};
