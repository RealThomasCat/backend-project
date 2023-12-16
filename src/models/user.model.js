import mongoose, { Schema } from "mogoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true, // remove whitespace
      index: true, // improve query performance (searchability)
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true, // remove whitespace
    },
    fullName: {
      type: String,
      required: true,
      trim: true, // remove whitespace
      index: true,
    },
    avatar: {
      type: String, // cloudinary url
      required: true,
    },
    coverImage: {
      type: String, // cloudinary url
    },
    watchHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    password: {
      type: String,
      required: [true, "Password is required"], // custom error message
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Using pre hook to hash password before saving to database
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next; // NEGATIVE CHECK : If password is not modified, skip this step
  this.password = bcrypt.hashSync(this.password, 10);
  next();
});

// Designing custom method for password comparison
userSchema.methods.isPasswordCorrect = async function (password) {
  // Give user's password string and encrypted password string to bcrypt.compareSync() for comparison
  return await bcrypt.compare(password, this.password); // Will return true or false
};

// Designing custom method for generating JWT tokens
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      // Payload
      _id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

// Designing custom method for generating JWT tokens
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      // Payload
      _id: this._id, // Referesh token have less information than access token
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
  );
};

export const User = mongoose.model("User", userSchema);
