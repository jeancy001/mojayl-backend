import express from "express";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectDB } from "./config/db.js";
import { userRouter } from "./routes/User.js";
import { startKeepAlive } from "./config/keepAlive.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: "*", 
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Database Connection
connectDB();

// Keep Alive (Render / MongoDB)
startKeepAlive();

// Routes
app.use("/api/v1/auth", userRouter);

// Root Endpoint
app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running successfully " });
});

// Start Server
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});
