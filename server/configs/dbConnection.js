import mongoose from "mongoose";

const dbConnection = async () => {
  // check if the connection string is loaded through the env variables or not
  if (!process.env.MONGO_URI) {
    throw new Error(".MONGO_URI env variable doesn't exist or not loaded properly");
  }

  try {
    // if the connection is already established then return
    if (mongoose.connection.readyState === 1) {
      console.log("already connected to the database")
      return
    }

    // handeling the connection events
    mongoose.connection.on("disconnected", () => {
      console.log("disconnected from the database");
    });
    mongoose.connection.on("error", (err) => {
      console.log("error occured in the database: ", err);
    })

    // connecting to the database
    await mongoose.connect(process.env.MONGO_URI);
    console.log("connected to the database successfully");
  } catch (err) {
    console.error("database connection failed,", err.message);
    throw err;
  }
};

export default dbConnection; // exporting the connection function