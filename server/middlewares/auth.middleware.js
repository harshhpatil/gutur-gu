import jwt from "jsonwebtoken";
import Session from "../models/Session.model.js";
import User from "../models/User.model.js";

// middleware function to authenticate the user
export const authenticate = async (req, res, next) => {
  // getting the access token from the cookies and returning if not present
  const token = req.cookies.accessToken;
  if (!token)
    return res.status(401).json({ message: "unauthorized or invalid token" });

  try {
    // decoding & verifying the token and finding the user in db
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    // returning if the user and token version are not valid
    if (!user || user.tokenVersion !== decoded.tokenVersion)
      return res.status(403).json({ message: "invalid or expired token" });

    if (!decoded.sessionId) {
      return res.status(403).json({ message: "invalid or expired token" });
    }

    const session = await Session.findById(decoded.sessionId);
    if (
      !session ||
      session.revoked ||
      session.expiresAt <= new Date() ||
      session.user.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "invalid or expired token" });
    }

    // returning the user object
    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    return res.status(403).json({ message: "invalid or expired token" });
  }
};
