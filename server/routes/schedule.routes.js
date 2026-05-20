import express from "express";
import {
  createSchedule,
  getCoupleSchedules,
  updateSchedule,
  deleteSchedule,
} from "../controllers/schedule.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply auth middleware to all schedule routes
router.use(authenticate);

router.post("/", createSchedule);
router.get("/", getCoupleSchedules);
router.put("/:id", updateSchedule);
router.delete("/:id", deleteSchedule);

export default router;