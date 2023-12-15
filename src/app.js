import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// Three major configurations for the app

app.use(express.json({ limit: "16kb" })); // JSON data is accepted with a limit of 16kb

app.use(express.urlencoded({ extended: true, limit: "16kb" }));

app.use(express.static("public")); // Stores static files in the public folder

app.use(cookieParser()); // Allows the app to access and set cookies from user's browser

export { app };
