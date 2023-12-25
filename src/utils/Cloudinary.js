import { v2 as cloudinary } from "cloudinary";
import fs from "fs"; // fs is Node.js native file system module (helps manage files ,comes default with Node.js)

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

export { uploadOnCloudinary };
