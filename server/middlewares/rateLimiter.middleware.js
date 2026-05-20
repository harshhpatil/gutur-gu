import rateLimit from "express-rate-limit";

// rate limitting login route : allowing 7 attempts max for 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7,
  message: "too many login attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// rate limitting register route: allowing 5 attempts max for 60 minutes
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "too many register attempts, please try again after 60 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// rate limitting change password route: allowing 1 attempts max for 3 days
const changePasswordLimiter = rateLimit({
  windowMs: 3 * 24 * 60 * 60 * 1000,
  max: 15,
  message: "too many password change attempts, please try again after 3 days",
  standardHeaders: true,
  legacyHeaders: false,
});

// rate limitting verify email route: allowing 5 attempts max for 60 minutes
const verifyEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "too many email verification attempts, please try again after 60 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// rate limitting refresh token route: allowing 30 attempts max for 15 minutes
const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "too many refresh token attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
}); 

// rate limitting forgot password route: allowing 5 attempts max for 60 minutes
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: "too many forgot password attempts, please try again after 60 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// rate limitting reset password route: allowing 5 attempts max for 60 minutes
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "too many reset password attempts, please try again after 60 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

export {
  loginLimiter,
  registerLimiter,
  changePasswordLimiter,
  verifyEmailLimiter,
  refreshTokenLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
}; // exporting the limiters
