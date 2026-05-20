import mongoose from "mongoose";

const coupleSchema = new mongoose.Schema(
  {
    partnerA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    partnerB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "broken"], // 'pending' if waiting for B to accept
      default: "pending",
    },
    // You can add shared settings here later (e.g., anniversary date)
  },
  { timestamps: true }
);

const Couple = mongoose.model("Couple", coupleSchema);
export default Couple;