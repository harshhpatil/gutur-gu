import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
	createPairingRequest,
	submitPairingRequest,
} from "../controllers/pairing.controller.js";

const router = Router();

// Route to create a pairing request (generate code)
router.post("/create", authenticate, createPairingRequest);

// Route to submit a pairing request (use code to pair)
router.post("/submit", authenticate, submitPairingRequest);

export default router;