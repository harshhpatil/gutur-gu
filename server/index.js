import "dotenv/config";
import http from "http";

import dbConnection from "./configs/dbConnection.js";
import app from "./app.js";
import { initializeSocket } from "./configs/socketIO.js";
import { initializeCronJobs } from "./services/cron.service.js";

// defining the constants
const PORT = process.env.PORT;
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;

// creating raw server
const server = http.createServer(app);

// function for starting the server
async function startServer() {
  if (!PORT) {
    throw new Error("PORT env variable doesn't exists or not loaded properly");
  }

  await dbConnection();
  const io = await initializeSocket(server);

  // initializing cron jobs
  initializeCronJobs(io);

  server.listen(process.env.PORT, () => {
    console.log(
      `server successfully running on ${PORT}. \ncheck the health of the server: ${HEALTH_URL}`,
    );
  });
}

// calling the startServer function
startServer();
