import cron from "node-cron";
import Schedule from "../models/Schedule.model.js";

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";

const getTimeForTimezone = (date, timezone) => {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone || DEFAULT_TIMEZONE,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: DEFAULT_TIMEZONE,
    }).format(date);
  }
};

export const initializeCronJobs = (io) => {
  // This cron expression '* * * * *' means "run at the start of every minute"
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      console.log("Checking active schedules for reminder triggers");

      const activeSchedules = await Schedule.find({
        isActive: true,
      });

      const dueSchedules = activeSchedules.filter((schedule) => {
        const scheduleTimezone = schedule.timezone || DEFAULT_TIMEZONE;
        return schedule.time === getTimeForTimezone(now, scheduleTimezone);
      });

      if (dueSchedules.length === 0) return;

      dueSchedules.forEach((alarm) => {
        const coupleRoomId = alarm.coupleId.toString();
        
        console.log(
          `Triggering "${alarm.title}" for couple ${coupleRoomId} at ${alarm.time} ${alarm.timezone || DEFAULT_TIMEZONE}`,
        );

        io.to(coupleRoomId).emit("trigger_popup", {
          title: alarm.title,
          scheduleId: alarm._id.toString(),
        });
      });
      
    } catch (error) {
      console.error("Error running schedule cron job:", error);
    }
  });
};
