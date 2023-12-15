// require("dotenv").config(); // Import dotenv using require
import dotenv from "dotenv"; // Import dotenv to use .env file
import connectDB from "./db/index.js";

dotenv.config({ path: "./env" }); // Configure dotenv

connectDB();

/*
import express from "express";
const app = express();

// IIFE (Immediately-invoked function expression) : create function and immediately call/execute it
(async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
    app.on("error", (error) => {
      console.log("ERRR: ", error); // Application unable to talk to database
      throw error;
    });

    app.listen(process.env.PORT, () => {
      console.log(`App is listening on port ${process.env.PORT}`);
    });
  } catch (error) {
    console.error("ERROR: ", error);
    throw error;
  }
})();
*/
