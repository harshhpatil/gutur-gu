import crypto from "crypto";
import User from "../models/User.model.js";
import Session from "../models/Session.model.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyToken,
  passwordResetToken,
} from "../services/token.service.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../services/email.service.js";

const authCookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const clearAuthCookies = (res) => {
  res.clearCookie("accessToken", authCookieOptions);
  res.clearCookie("refreshToken", authCookieOptions);
};

export const getMe = async (req, res) => {
  return res.status(200).json({
    user: {
      id: req.user._id,
      email: req.user.email,
      displayName: req.user.displayName,
      coupleId: req.user.coupleId,
      emailVerified: req.user.emailVerified,
    },
  });
};

const findSessionByRefreshToken = async (refreshToken) => {
  const sessions = await Session.find({
    revoked: false,
    expiresAt: { $gt: new Date() },
  })
    .select("_id user tokenHash revoked expiresAt")
    .sort({ createdAt: -1 });

  for (const session of sessions) {
    const isMatch = await verifyToken(refreshToken, session.tokenHash);
    if (isMatch) {
      return session;
    }
  }

  return null;
};

// login controller function
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    // checking if the body contains the required credentials or not
    if (!email || !password)
      return res.status(400).json({ message: "invalid credentials" });

    // finding the user in the database
    let normalizedEmail = email.toLowerCase().trim(); // normalizing the email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ message: "invalid credentials" });

    // comparing the password with the hashed password in database
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid)
      return res.status(401).json({ message: "invalid credentials" });

    // checking if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({
        message:
          "Please verify your email before logging in. Check your inbox.",
      });
    }

    // creating session first so the access token can be bound to a session id
    const session = await Session.create({
      user: user._id,
      tokenHash: "",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // total of 7 days in milliseconds
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    const accessToken = generateAccessToken(user, session._id.toString()); // generating the access token
    const refreshToken = generateRefreshToken(); // generating the refresh token
    session.tokenHash = await hashToken(refreshToken); // hashing the refresh token and storing it in tokenHash
    await session.save();

    // setting the access token in the cookies
    res.cookie("accessToken", accessToken, {
      ...authCookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    // setting the refresh token in the cookies
    res.cookie("refreshToken", refreshToken, {
      ...authCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // sending the response to the client
    return res.status(200).json({ message: "Successfully logged in" });
  } catch (err) {
    console.error("error occured in the login controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// register controller function
export const register = async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    // checking if the body contains the required credentials or not & returning if not
    if (!email || !password || !displayName)
      return res.status(400).json({ message: "invalid credentials" });

    // normalizing the email before checking
    let normalizedEmail = email.toLowerCase().trim();
    
    // checking if the user already exits in the database or not & returning if does
    const user = await User.findOne({ email: normalizedEmail });
    if (user) return res.status(400).json({ message: "user already exists" });

    // generating verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationTokenHash = await hashToken(emailVerificationToken); // hashing the verification token to store in database
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // creating new user from the above credentials in the database
    const newUser = await User.create({
      email: normalizedEmail,
      displayName: displayName.trim(),
      password,
      role: "user",
      emailVerificationToken: emailVerificationTokenHash,
      emailVerificationTokenExpiry: tokenExpiry,
      emailVerified: false,
    });

    // Prefer the frontend so users see the app's verification screen.
    const baseURL = process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.SERVER_URL;
    if (!baseURL) {
      console.error(
        "FRONTEND_URL, CLIENT_URL or SERVER_URL is not defined or loaded properly from the environment variables",
      );
      return res
        .status(500)
        .json({ message: "Internal server error: verification URL not configured" });
    }
    const verificationPath =
      process.env.FRONTEND_URL || process.env.CLIENT_URL
        ? "/verify-email"
        : "/api/v1/auth/verify-email";
    const verificationLink = `${baseURL}${verificationPath}?token=${emailVerificationToken}`; // creating the verification link to be sent in the email


    // sending verification email
    await sendVerificationEmail(newUser.email, verificationLink);

    // sending the response to the client
    return res.status(201).json({
      message:
        "Registration successful! Please check your email to verify your account.",
      userId: newUser._id,
    });
  } catch (err) {
    console.error("error occured in the register controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
};


// welcome email controller function
export const welcomeEmail = async (req, res) => {
  try {
    // getting the user id from the request params and checking if it is present or not
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // checking if the email is verified or not 
    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Email not verified. Please verify your email to receive welcome email.",
      });
    }

    // sending the welcome email
    await sendWelcomeEmail(user.email);

    return res.status(200).json({ message: "Welcome email sent successfully" });

  } catch (err) {
    console.error("error in welcome email controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// verify email controller function
export const verifyEmail = async (req, res) => {
  try {
    // getting token from query params
    const { token } = req.query;

    if (!token) {
      return res
        .status(400)
        .json({ message: "Verification token is required" });
    }

    // finding user by token and checking if token is not expired
    const users = await User.find({
      emailVerificationToken: { $exists: true, $ne: null }, // loading all the users which have the emailVerificationToken field set (means they are not verified yet)
      emailVerificationTokenExpiry: { $gt: new Date() }, // token must be in future
    });

    // finding the user by comparing the token with the hashed token in database
    let user = null;
    for (const u of users) {
      const isMatch = await verifyToken(token, u.emailVerificationToken);
      if (isMatch) {
        user = u;
        break;
      }
    }
    
    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired verification token",
      });
    }
    
    // marking email as verified and clearing token
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpiry = undefined;
    await user.save();

    // sending welcome email
    await sendWelcomeEmail(user.email);

    // sending success response
    return res.status(200).json({
      message: "Email verified successfully! You can now login.",
    });
  } catch (err) {
    console.error("error in verifyEmail controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// refresh tokens controller function
export const refreshToken = async (req, res) => {
  try {
    // checking the credentials are valid or not and returning if not valid
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.status(401).json({ message: "unauthorized" });
    // finding active sessions and matching refresh token against stored hash
    const matchedSession = await findSessionByRefreshToken(refreshToken);

    if (!matchedSession) {
      return res.status(401).json({ message: "unauthorized" });
    }

    // loading user and issuing new tokens
    const user = await User.findById(matchedSession.user);
    if (!user) return res.status(401).json({ message: "unauthorized" });

    const newAccessToken = generateAccessToken(user, matchedSession._id.toString());
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = await hashToken(newRefreshToken);

    // rotate refresh token in the same session (one session per device)
    matchedSession.tokenHash = newRefreshTokenHash;
    matchedSession.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    matchedSession.revoked = false;
    await matchedSession.save();

    // setting the new access token in the cookies
    res.cookie("accessToken", newAccessToken, {
      ...authCookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    // setting the rotated refresh token in the cookies
    res.cookie("refreshToken", newRefreshToken, {
      ...authCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res
      .status(200)
      .json({ message: "tokens refreshed successfully" });
  } catch (err) {
    console.error("error in refresh token controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// logout controller function
export const logout = async (req, res) => {
  try {
    // getting the credentials and checking if they are valid or not
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.status(401).json({ message: "unauthorized" });

    // finding all active sessions and matching refresh token
    const matchedSession = await findSessionByRefreshToken(refreshToken);

    if (!matchedSession) {
      return res.status(401).json({ message: "unauthorized" });
    }

    // revoking the matched session
    matchedSession.revoked = true;
    await matchedSession.save();

    // clearing the access and refresh token cookie
    clearAuthCookies(res);
    return res.status(200).json({ message: "logged out successfully" });
  } catch (err) {
    console.error("error in logout controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// change password controller function
export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id; // getting the user id from the headers
    const { oldPassword, newPassword } = req.body; // getting the current and new password from the request body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "current and new password are required" });
    }

    // finding the user in the databse
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }

    // comparing the current password with the hashed password in the database. if valid changing to new password if not then returning
    const isPasswordValid = await user.comparePassword(oldPassword);
    if(!isPasswordValid) {
      return res.status(401).json({ message: "current password is incorrect" });
    }
    if(oldPassword === newPassword) {
      return res.status(400).json({ message: "new password must be different from current password" });
    }
    user.password = newPassword; // setting the new password
    user.tokenVersion += 1; // incrementing the token version to invalidate existing tokens
    await Session.updateMany({ user: user._id, revoked: false }, { revoked: true }); // revoke all existing sessions for the user
    // clearing the access and refresh token cookie
    clearAuthCookies(res);

    await user.save(); // saving the user with the new password

    // sending the response to the client
    return res.status(200).json({ message: "password changed successfully" });
  } catch (err) {
    console.error("error in change password controller", err);
    res.status(500).json({ message: "Internal server error" }); 
  }

}

// forget password controller function
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body; // getting the email from the request body
    const successMessage =
      "If an account with that email exists, a password reset link has been sent.";

    // finding the user in the database
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(200).json({ message: successMessage });
    }

    // generating password reset token and building the password reset link
    const { resetToken, hashedResetToken } = passwordResetToken();
    const baseURL = process.env.FRONTEND_URL || process.env.CLIENT_URL;
    if (!baseURL) {
      console.error(
        "FRONTEND_URL or CLIENT_URL is not defined for password reset links",
      );
      return res
        .status(500)
        .json({ message: "Internal server error: reset URL not configured" });
    }
    const resetLink = `${baseURL}/reset-password?token=${resetToken}`;

    // storing the hashed reset token in the user model
    user.passwordResetToken = hashedResetToken;
    user.passwordResetTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
    await user.save();

    // sending the password reset email
    await sendPasswordResetEmail(user.email, resetLink);
    return res.status(200).json({ message: successMessage });

  } catch (err) {    
    console.error("error in forgot password controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// reset password controller function
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const hashedResetToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedResetToken,
      passwordResetTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpiry = undefined;
    user.tokenVersion += 1;

    await Session.updateMany({ user: user._id, revoked: false }, { revoked: true });
    await user.save();

    clearAuthCookies(res);

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("error in reset password controller", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// session controller function
export const getSessions = async (req, res) => {
  try {
    const userId = req.user._id; // getting the user id from the headers

    // finding all sessions for the user
    const sessions = await Session.find({ user: userId}).select("-tokenHash").sort({ createdAt: -1 }); // excluding tokenHash from the response and sorting by createdAt in descending order

    return res.status(200).json({ sessions });
  } catch (err) {
    console.error("error in get sessions controller", err);
    res.status(500).json({ message: "internal server error" });
  }
};

// logout session controller function
export const logoutSession = async (req, res) => {
  try {
    const userId = req.user._id; // getting the user id from the headers
    const sessionId = req.params.sessionId; // getting the session id from the request params

    // finding the user in the databse and returning if user not found
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }

    // finding the session in the database and checking if it belongs to the user or not
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "session not found" });
    }
    if (session.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "unauthorized" });
    }

    // revoking the session
    session.revoked = true;
    await session.save();

    // if the current session was revoked, clear the auth cookies for this device
    if (req.session && req.session._id.toString() === session._id.toString()) {
      clearAuthCookies(res);
    }

    return res.status(200).json({ message: "session logged out successfully" });
  } catch (err) {
    console.error("error in logout session controller", err);
    res.status(500).json({ message: "internal server error" });
  }
};

// logout all sessions controller function 
export const logoutAllSessions = async (req, res) => {
  try {
    const userId = req.user._id; // getting the user id from the headers

    // finding the user in the databse and returning if user not found
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }

    // revoking all sessions for the user
    await Session.updateMany({ user: userId, revoked: false }, { revoked: true });

    // updating the token version
    user.tokenVersion += 1;
    await user.save();

    return res.status(200).json({ message: "all sessions logged out successfully" });
  } catch (err) {
    console.error("error in logout all sessions controller", err);
    res.status(500).json({ message: "internal server error" });
  }
};
