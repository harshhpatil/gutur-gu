import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Session from "../models/Session.model.js";
import User from "../models/User.model.js";

const allowedOrigins = [process.env.CLIENT_URL, process.env.FRONTEND_URL].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  if (allowedOrigins.includes(origin)) return true;

  return (
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin === "http://localhost" ||
    origin === "http://127.0.0.1" ||
    origin === "capacitor://localhost" ||
    origin === "ionic://localhost"
  );
};

const parseCookies = (cookieHeader = "") =>
  cookieHeader.split(";").reduce((cookies, cookie) => {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) return cookies;

    const key = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }

    return cookies;
  }, {});

const authenticateSocket = async (socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies.accessToken;

    if (!token) {
      return next(new Error("unauthorized"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.tokenVersion !== decoded.tokenVersion || !decoded.sessionId) {
      return next(new Error("unauthorized"));
    }

    const session = await Session.findById(decoded.sessionId);
    if (
      !session ||
      session.revoked ||
      session.expiresAt <= new Date() ||
      session.user.toString() !== user._id.toString()
    ) {
      return next(new Error("unauthorized"));
    }

    if (!user.coupleId) {
      return next(new Error("pairing required"));
    }

    socket.user = user;
    socket.coupleId = user.coupleId.toString();
    return next();
  } catch {
    return next(new Error("unauthorized"));
  }
};

// webrtc signaling server initialization using socket.io
export const initializeSocket = (httpServer) => {
  // creating a new socket server instance
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    },
  });

  const acceptedUsers = new Map(); // temporary storage

  io.use(authenticateSocket);

  // handleling socket connection
  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    const coupleId = socket.coupleId;

    // join private room
    socket.join(coupleId);
    console.log(`User ${userId} joined ${coupleId}`);

    // accept call
    socket.on("accept_call", () => {
      if (!acceptedUsers.has(coupleId)) {
        acceptedUsers.set(coupleId, new Set());
      }

      const users = acceptedUsers.get(coupleId);

      users.add(userId);

      // both accepted
      if (users.size === 2) {
        const [initiatorId] = users;
        io.to(coupleId).emit("start_video", { initiatorId });
        acceptedUsers.delete(coupleId);
      }
    });

    // decline call
    socket.on("decline_call", () => {
      io.to(coupleId).emit("cancel_call");

      acceptedUsers.delete(coupleId);
    });


    // WEBRTC SIGNALING

    socket.on("webrtc_offer", (offer) => {
      socket.to(coupleId).emit("webrtc_offer", offer);
    });

    socket.on("webrtc_answer", (answer) => {
      socket.to(coupleId).emit("webrtc_answer", answer);
    });

    socket.on("webrtc_ice_candidate", (candidate) => {
      socket.to(coupleId).emit("webrtc_ice_candidate", candidate);
    });

    // handeling disconnection
    socket.on("disconnect", () => {
      console.log(`User ${userId} disconnected`);
      acceptedUsers.delete(coupleId);
      io.to(coupleId).emit("cancel_call");
    });
  });

  return io;
};
