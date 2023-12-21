import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

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
  const existedUser = User.findOne({
    $or: [{ username }, { email }], // Find a user where either the username or email matches the values provided
  });

  // If user exists, return error message to user
  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  // Check for images
  const avatarLocalPath = req.files?.avatar[0]?.path; // If avatar exists, get the path
  const coverImageLocalPath = req.files?.coverImage[0]?.path; // If coverImage exists, get the path

  // Check for avatar because it is required
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
    coverImage: coverImage?.url || "", // If cover image exists, send url, else send empty string
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

export { registerUser };
