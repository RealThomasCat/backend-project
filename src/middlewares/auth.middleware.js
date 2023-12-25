import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

// This middelware is used to check if the user is authenticated or not
export const verifyJWT = asyncHandler(async (req, _, next) => {
  // res is not used, so we use _ to ignore it
  try {
    // Get access token from cookie or request header
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", ""); // Header contain "Bearer <token>", so we remove "Bearer " and space to get the token

    if (!token) {
      throw new ApiError(401, "Unauthorized request"); // If token does not exist, return error
    }

    // Verify token (Decoding using the secret key)
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Find user by id
    const user = await User.findById(decodedToken?._id).select(
      // We generated the token using the user id, email, username and fullname. so we can use the id to find the user
      "-password -refreshToken"
    );

    // If user does not exist, return error
    if (!user) {
      throw new ApiError(401, "Invalid access token");
    }

    // Add user to request object
    req.user = user;
    next(); // Call next to continue to the next middleware
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});
