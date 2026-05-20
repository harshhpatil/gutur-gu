import mongoose from "mongoose";

// defining the session schema
const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    tokenHash: String,
    expiresAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);

// creating the model from the schema
const Session = mongoose.model("Session", sessionSchema);

export default Session; // exporting the model
