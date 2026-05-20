import Schedule from "../models/Schedule.model.js";
import User from "../models/User.model.js";

// CREATE: Add a new alarm (e.g., "Lunch ke baad ki gutur gu")
export const createSchedule = async (req, res) => {
  try {
    const { title, time } = req.body;
    const userId = req.user._id;

    // First, verify the user is actually in a Couple
    const user = await User.findById(userId);
    if (!user.coupleId) {
      return res.status(403).json({ error: "You must be paired to create a schedule." });
    }

    const newSchedule = await Schedule.create({
      coupleId: user.coupleId,
      title,
      time, // Format: "HH:mm" (e.g., "14:30")
      createdBy: userId,
    });

    res.status(201).json({ success: true, schedule: newSchedule });
  } catch (error) {
    res.status(500).json({ error: "Failed to create schedule." });
  }
};

// READ: Get all alarms for this couple
export const getCoupleSchedules = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.coupleId) {
      return res.status(403).json({ error: "No partner linked." });
    }

    // Find all schedules belonging to this couple, ordered by time
    const schedules = await Schedule.find({ coupleId: user.coupleId }).sort({ time: 1 });
    
    res.status(200).json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch schedules." });
  }
};

// UPDATE: Change alarm time or toggle it on/off
export const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, time, isActive } = req.body;
    const user = await User.findById(req.user._id);

    // Verify the schedule belongs to their couple ID
    const schedule = await Schedule.findOneAndUpdate(
      { _id: id, coupleId: user.coupleId },
      { title, time, isActive },
      { new: true } // Returns the updated document
    );

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found or unauthorized." });
    }

    res.status(200).json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ error: "Failed to update schedule." });
  }
};

// DELETE: Remove an alarm
export const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user._id);

    const schedule = await Schedule.findOneAndDelete({
      _id: id,
      coupleId: user.coupleId,
    });

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found or unauthorized." });
    }

    res.status(200).json({ success: true, message: "Schedule deleted." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete schedule." });
  }
};