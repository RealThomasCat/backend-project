import { v2 as cloudinary } from "cloudinary";
import fs from "fs"; // fs is Node.js native file system module (helps manage files ,comes default with Node.js)

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Uploads a file on cloudinary and returns the file info
const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    // Upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    // File has been uploaded successfully
    // console.log("File is uploaded on cloudinary", response.url);

    // Remove the file from local storage as it is already uploaded on cloudinary
    fs.unlinkSync(localFilePath);

    // return cloudinary file info to user
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload on cloudinary failed
    return null;
  }
};

// Delete a file from cloudinary using its public_id
const deleteFromCloudinary = async (public_id) => {
  try {
    if (!public_id) return null;
    // Delete the file from cloudinary
    const response = await cloudinary.uploader.destroy(public_id);

    // File has been deleted successfully
    console.log("File is deleted from cloudinary", response.result);

    // return cloudinary response to user
    return response;
  } catch (error) {
    return null;
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };
