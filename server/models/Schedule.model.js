import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    coupleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Couple",
      required: true,
      index: true, // Speeds up queries when fetching alarms for a couple
    },
    title: {
      type: String,
      required: true,
      trim: true,
      // e.g., "Lunch ke baad ki gutur gu"
    },
    time: {
      type: String,
      required: true,
      // Store in 24-hour format "HH:mm" (e.g., "14:30") so your Node cron job can parse it easily
    },
    timezone: {
      type: String,
      default: process.env.DEFAULT_TIMEZONE || "Asia/Kolkata",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Schedule = mongoose.model("Schedule", scheduleSchema);
export default Schedule;
