import { Router } from "express";
import {
  login,
  register,
  verifyEmail,
  refreshToken,
  logout,
  changePassword,
  logoutSession,
  getSessions,
  forgotPassword,
  logoutAllSessions,
  resetPassword,
  getMe,
} from "../controllers/auth.controller.js";
import {
  loginLimiter,
  registerLimiter,
  changePasswordLimiter,
  verifyEmailLimiter,
  refreshTokenLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from "../middlewares/rateLimiter.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../utils/validation.js";
 
const router = Router();

// defining the auth routes
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/register", registerLimiter, validate(registerSchema), register);
router.post("/change-password", changePasswordLimiter, authenticate, validate(changePasswordSchema), changePassword);
router.post("/refresh-token", refreshTokenLimiter, refreshToken);
router.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", resetPasswordLimiter, validate(resetPasswordSchema), resetPassword);
router.post("/logout", authenticate, logout);
router.post("/logout-all-sessions", authenticate, logoutAllSessions);
router.post("/logout-session/:sessionId", authenticate, logoutSession);

router.get("/me", authenticate, getMe);
router.get("/sessions", authenticate, getSessions);
router.get("/verify-email", verifyEmailLimiter, verifyEmail);

export default router;
