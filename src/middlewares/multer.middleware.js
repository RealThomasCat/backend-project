import multer from "multer";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/temp"); // cb : callback
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // save file name as original name of file uploaded by user (not good practice)
  },
});

export const upload = multer({ storage });
