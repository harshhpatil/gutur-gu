import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
	createPairingRequest,
	submitPairingRequest,
} from "../controllers/pairing.controller.js";
import { pairingCodeSchema } from "../utils/validation.js";

const router = Router();

// Route to create a pairing request (generate code)
router.post("/create", authenticate, createPairingRequest);

// Route to submit a pairing request (use code to pair)
router.post("/submit", authenticate, validate(pairingCodeSchema), submitPairingRequest);

export default router;
