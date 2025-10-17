import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()
// ----------------- HELPER FUNCTIONS -----------------
const generateAccessToken = (user) => {
  return jwt.sign(
    { _id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" } // short-lived access token
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { _id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

export {generateAccessToken, generateRefreshToken}