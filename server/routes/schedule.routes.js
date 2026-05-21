import express from "express";
import {
  createSchedule,
  getCoupleSchedules,
  updateSchedule,
  deleteSchedule,
} from "../controllers/schedule.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { scheduleSchema } from "../utils/validation.js";

const router = express.Router();

// Apply auth middleware to all schedule routes
router.use(authenticate);

router.post("/", validate(scheduleSchema), createSchedule);
router.get("/", getCoupleSchedules);
router.put("/:id", validate(scheduleSchema), updateSchedule);
router.delete("/:id", deleteSchedule);

export default router;
