import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

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
  console.log(email);

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
      $set: {
        refreshToken: null,
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

export { registerUser, loginUser, logoutUser };
