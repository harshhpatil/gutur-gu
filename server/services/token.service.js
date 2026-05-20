import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

// function to generate access token
function generateAccessToken(user, sessionId) {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}

// function to generate refresh token
function generateRefreshToken() {
  return crypto.randomUUID();
}

// function to generate hashed token
async function hashToken(token) {
  return bcrypt.hash(token, 13);
}

// function to verify the token
function verifyToken(token, hashedToken) {
  return bcrypt.compare(token, hashedToken);
}

// function to generate password reset token
function passwordResetToken(){
  // generating a random token using crypto module
  const resetToken = crypto.randomBytes(32).toString("hex");
  // hashing the token before saving to the database
  const hashedResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  // returning both the reset token and the hashed reset token
  return { resetToken, hashedResetToken };  
}

export { generateAccessToken, generateRefreshToken, hashToken, verifyToken, passwordResetToken }; // exporting the functions
