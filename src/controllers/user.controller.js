import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/Cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// Make a function to generate access and refresh tokens
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    // Find user by id
    const user = await User.findById(userId);

    // generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Add refresh token to user and save to database
    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false }); // validateBeforeSave: false because we are not validating before saving

    // Return tokens
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // Get user details from frontend : first name, last name, email, password, cover image, avatar image,
  const { fullName, email, username, password } = req.body;
  console.log("email: ", email);

  // Validate user details
  if (
    // Advanced method to check if any of the fields is empty
    [fullName, email, username, password].some(
      (field) => field?.trim() === "" // if field exists then trim it, if after trimming it is empty then return true
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // We can also use individual if statements to check if any of the fields is empty
  //
  // if (fullName === "") {
  //   throw new ApiError(400, "fullname is required");
  // }

  // Check if user already exists: username, email
  const existedUser = await User.findOne({
    // Await because database query takes time
    $or: [{ username }, { email }], // Find a user where either the username or email matches the values provided
  });

  // If user exists, return error message to user
  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  // console.log("req.files: ", req.files);

  // Check for images
  const avatarLocalPath = req.files?.avatar?.[0]?.path; // If avatar exists, get the path

  // We can also use if statements to check for images
  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  // Check for avatar if it is extracted or not because it is required
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  // Upload them to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath); // Upload takes time so we use await
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // Check again for avatar because it is required
  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  // Create user object
  const user = await User.create({
    // Create user takes time
    fullName,
    avatar: avatar.url, // Send only url of image from all the file info we get from cloudinary
    coverImage: coverImage?.url || "", // If cover image exists, send url, else send empty string ( Error can occur if : undefined.url )
    email,
    password,
    username: username.toLowerCase(),
  });

  // Check if user is created by id (_id field is automatically created by mongoose)
  const createdUser = await User.findById(user._id).select(
    // If user is created then remove password and refresh token field from response
    "-password -refreshToken"
  );

  // Throw error if user is not created
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  // Return response
  return res.status(201).json(
    // Create a response object
    new ApiResponse(200, createdUser, "User registered successfully")
  );
});

const loginUser = asyncHandler(async (req, res) => {
  // Get user details from frontend : email, password
  const { email, username, password } = req.body;
  // console.log(email);

  // Validate user details
  if (!username && !email) {
    throw new ApiError(400, "username or email is required"); // If both username and password are empty send error
  }

  // Check if user exists
  const user = await User.findOne({
    // Await because database query takes time
    $or: [{ username }, { email }], // Find a user where either the username or email matches the values provided
  });

  // If user does not exist, send error
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // Check password if user exists
  const isPasswordValid = await user.isPasswordCorrect(password); // Await because of bcrypt

  // If password is incorrect, send error
  if (!isPasswordValid) {
    throw new ApiError(404, "Invalid user credentials");
  }

  // Create, save and store tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  // Either update the user with the new refresh token or fetch updated user again from database
  const loggedInUser = await User.findById(user._id) // Find user by id from database
    .select("-password -refreshToken"); // Don't need password and refresh token field

  // Initialize cookie options
  const options = {
    // These options will ensure that cookie can only be modified by the server
    httpOnly: true,
    secure: true,
  };

  // Send cookie with response
  return res
    .status(200)
    .cookie("accessToken", accessToken, options) // .cookie(key, value, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          // Send user details and tokens in response for user to use (store in local storage, etc)
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  // Find user by id and update refresh token to null
  await User.findByIdAndUpdate(
    req.user._id, // User id is added to request object by verifyJWT middleware
    {
      // Update refresh token to null
      $unset: {
        refreshToken: 1, // This will remove refresh token field from user document
      },
    },
    {
      new: true, // Return updated user instead of old user in response
    }
  );

  // Initialize cookie options
  const options = {
    // These options will ensure that cookie can only be modified by the server
    httpOnly: true,
    secure: true,
  };

  // Send cookie with response
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});

// Controller to refresh access token
const refreshAccessToken = asyncHandler(async (req, res) => {
  // We have to generate new access and refresh tokens if access token is expired.
  // First we will match the refresh token sent by the user with the refresh token stored in the database
  // If they match, we will generate new tokens and send them to the user and update the refresh token in the database

  // First get refresh token from cookie or body (stored in encrypted form in cookie)
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  // Throw error if we did not get refresh token
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    // Match incoming refresh token with the refresh token stored in the database
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    // Find user by id
    const user = await User.findById(decodedToken?._id);

    // Throw error if user does not exist
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    // If refresh token stored in database is not equal to the incoming refresh token, throw error
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // If refresh token is valid, generate new access and refresh tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );

    // Initialize cookie options
    const options = {
      httpOnly: true,
      secure: true,
    };

    // Send cookie with response
    return res
      .status(200)
      .cookie("accessToken", accessToken, options) // .cookie(key, value, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  // Get current and new password from user
  const { oldPassword, newPassword } = req.body;

  // Get user by id (user is added to request object by verifyJWT middleware)
  const user = await User.findById(req.user?._id);

  // Check if old password is correct
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword); // isPasswordCorrect() method is defined in user model

  // Throw error if old password is incorrect
  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid old password");
  }

  // If old password is correct, set old password = new password
  user.password = newPassword;

  // Save user to database
  await user.save({ validateBeforeSave: false });

  // Return response
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully")); // ApiResponse(statusCode, data, message)
});

// Get current user (without password and refresh token)
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  // We are updating all fields together
  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required"); // If any of the fields is empty send error
  }

  // Find user by id, update details and return updated user
  const user = User.findByIdAndUpdate(
    req.user?._id,
    {
      // Set new values
      $set: {
        fullName,
        email,
      },
    },
    { new: true } // Return updated user instead of old user in response
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  // Get avatar image from frontend
  const avatarLocalPath = req.file?.path; // Get path of avatar image using multer

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  // Get old avatar image public_id from database

  // Upload avatar image to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  // console.log("avatar: ", avatar);

  // Throw error if avatar is not uploaded to cloudinary (if url is missing from avatar object)
  if (!avatar.url) {
    throw new ApiError(
      400,
      "Something went wrong while uploading avatar image"
    );
  }

  // TO DO : Delete old avatar image from cloudinary
  // *** Don't have old public_id in database ***
  // await deleteFromCloudinary(oldAvatar?.public_id);

  // Update user avatar in database
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url, // Avatar is a string (url)
      },
    },
    { new: true } // Return updated user instead of old user in response
  ).select("-password");

  // Return response
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  // Get cover image from frontend
  const coverImageLocalPath = req.file?.path; // Get path of cover image using multer

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is required");
  }

  // Upload cover image to cloudinary
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // Throw error if Cover Image is not uploaded to cloudinary (if url is missing from coverImage object)
  if (!coverImage.url) {
    throw new ApiError(400, "Something went wrong while uploading cover image");
  }

  // Update user coverImage in database
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url, // coverImage is a string (url)
      },
    },
    { new: true } // Return updated user instead of old user in response
  ).select("-password");

  // Return response
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

// Using mongodb aggregation pipeline to get user channel profile
const getUserChannelProfile = asyncHandler(async (req, res) => {
  // Get username from params
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  // Instead of using find (by username) and then fetching details we can use mongodb aggregation pipeline
  // to get user user channel profile returned as an object in an array
  const channel = await User.aggregate([
    // First stage : match username - filter documents by username (unique)
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    // Second stage : lookup - join user and subscription collections to get subscribers object
    {
      $lookup: {
        from: "subscriptions", // Name of collection/model becomes lowercase and plural
        localField: "_id",
        foreignField: "channel", // Subscribtion documents wherever this user is a subscribed channel
        as: "subscribers",
      },
    },
    // Third stage : lookup - join user and subscription collections to get subscribedTo object
    {
      $lookup: {
        from: "subscriptions", // Name of collection/model becomes lowercase and plural
        localField: "_id",
        foreignField: "subscriber", // Subscribtion documents wherever this user is a subscriber
        as: "subscribedTo",
      },
    },
    // Fourth stage : addFields - add subscribersCount, channelsSubscribedToCount and isSubscribed fields to user profile
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers", // Get length of subscribers object
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo", // Get length of subscribedTo object
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] }, // Check if current user is in subscribers object
            then: true, // If yes, then set isSubscribed = true
            else: false, // Else false
          },
        },
      },
    },
    // Fifth stage : project - select fields to return in response
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
        createdAt: 1,
      },
    },
  ]);

  // If channel is not found (first object in array), throw error
  if (!channel?.length) {
    throw new ApiError(404, "Channel not found");
  }

  // Return response
  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    ); // Return channel object (first object in array)
});

// Using mongodb nested aggregation pipeline to get user watch history videos
const getWatchHistory = asyncHandler(async (req, res) => {
  // Get user by id and populate watch history using nested pipeline
  const user = await User.aggregate([
    {
      $match: {
        // req.user._id returns string, but we need object id (Usually mongoose automatically converts string to object id)
        _id: new mongoose.Types.ObjectId(req.user._id), // Convert user id to mongodb object id (mongoose don't do it automatically in aggregation pipeline)
      },
    },
    {
      // Use nested pipeline to get watch history
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        // Use nested pipeline to get owner
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              // Use nested pipeline to select fields to return
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          // This pipepile returns owner which is an array with data in its first element
          {
            $addFields: {
              // overwrite owner field with first element of its array (optional data transformation step for frontend)
              owner: {
                $first: "$owner", // $first returns first element of owner array
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
