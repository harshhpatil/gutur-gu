import cron from "node-cron";
import Schedule from "../models/Schedule.model.js";

export const initializeCronJobs = (io) => {
  // This cron expression '* * * * *' means "run at the start of every minute"
  cron.schedule("* * * * *", async () => {
    try {
      // 1. Get the current time in "HH:mm" format (e.g., "14:30")
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, "0");
      const currentMinutes = String(now.getMinutes()).padStart(2, "0");
      const currentTime = `${currentHours}:${currentMinutes}`;

      console.log(`Checking schedules for time: ${currentTime}`);

      // 2. Find all active alarms that match this exact minute
      const activeAlarms = await Schedule.find({
        time: currentTime,
        isActive: true,
      });

      if (activeAlarms.length === 0) return;

      // 3. Loop through the matched alarms and trigger the socket events
      activeAlarms.forEach((alarm) => {
        const coupleRoomId = alarm.coupleId.toString();
        
        console.log(`Triggering "${alarm.title}" for couple ${coupleRoomId}`);

        // Emit the pop-up event specifically to this couple's private room
        io.to(coupleRoomId).emit("trigger_popup", {
          title: alarm.title,
          scheduleId: alarm._id,
        });
      });
      
    } catch (error) {
      console.error("Error running schedule cron job:", error);
    }
  });
};