import crypto from "node:crypto";
import Couple from "../models/Couple.model.js";
import User from "../models/User.model.js";

// create pariring request
export const createPairingRequest = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("coupleId pairingCode pairingCodeExpiry");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.coupleId) {
      return res.status(400).json({ error: "User is already paired" });
    }

    // Generate a secure 6-digit code (e.g., 492015)
    const pairingCode = crypto.randomInt(100000, 1000000).toString();
    
    // Set expiry for 15 minutes from now
    const pairingCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await User.findByIdAndUpdate(userId, {
      pairingCode,
      pairingCodeExpiry,
    });

    res.status(200).json({
      success: true,
      pairingCode,
      expiresAt: pairingCodeExpiry,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate pairing code" });
  }
};

// submit pairing request
export const submitPairingRequest = async (req, res) => {
  try {
    const userBId = req.user._id;
    const { pairingCode } = req.body;

    const userB = await User.findById(userBId).select("coupleId");
    if (!userB) {
      return res.status(404).json({ error: "User not found" });
    }

    if (userB.coupleId) {
      return res.status(400).json({ error: "User is already paired" });
    }

    // 1. Find User A using the active pairing code
    const userA = await User.findOne({
      pairingCode,
      pairingCodeExpiry: { $gt: new Date() }, // Ensure it hasn't expired
    });

    if (!userA) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    // Prevent a user from pairing with themselves
    if (userA._id.toString() === userBId.toString()) {
      return res.status(400).json({ error: "You cannot pair with yourself" });
    }

    if (userA.coupleId) {
      return res.status(400).json({ error: "Pairing code owner is already paired" });
    }

    // 2. Create the Couple document
    const newCouple = await Couple.create({
      partnerA: userA._id,
      partnerB: userBId,
      status: "active",
    });

    // 3. Link both users to the new Couple document and clear the code
    await User.findByIdAndUpdate(userA._id, { 
      coupleId: newCouple._id,
      pairingCode: null, 
      pairingCodeExpiry: null,
    });
    
    await User.findByIdAndUpdate(userBId, { 
      coupleId: newCouple._id,
    });

    res.status(200).json({
      success: true,
      message: "Successfully paired!",
      coupleId: newCouple._id,
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to process pairing" });
  }
};