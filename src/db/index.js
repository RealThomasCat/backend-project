import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    console.log(
      `\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`
    ); // Console log the host of the monogodb database wherever connected
  } catch (error) {
    console.log("MONGODB connection FAILED  ", error);
    process.exit(1); // Exit with failure
  }
};

export default connectDB;
