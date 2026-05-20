import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

// middlewares
// trust proxy when behind a proxy (useful for secure cookies in production)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.use(express.json());
app.use(cookieParser());

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

// CORS - allow browser and Capacitor clients to send requests and cookies
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// importing the routes
import authRoutes from "./routes/auth.routes.js";
import pairingRoutes from "./routes/pairing.routes.js";
import scheduleRoutes from "./routes/schedule.routes.js";

// defining the routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/pairing", pairingRoutes);
app.use("/api/v1/schedule", scheduleRoutes);

// health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "health check done" });
});

export default app; // exporting the 
