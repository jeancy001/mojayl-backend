import express from "express";
import {
  register,
  userLogin,
  updateProfile,
  updatePassword,
  getMe,
  logout,
  getProfiles,
  requestCode,
  resetPassword,
  deleteProfile,
  resendOtp,
  verifyOtp,
  testRoute 
} from "../controllers/userController.js";
import { authenticated} from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/upload.js";
const router = express.Router();


router.get("/test", testRoute);
//routes Public
router.post("/register", register);
router.post("/login", userLogin);
router.post("/verify-otp", verifyOtp); // Route pour vérifier l'OTP
router.post("/request-code", requestCode);
router.post("/reset-password", resetPassword);
router.post("/resend-otp", resendOtp); // Route pour renvoyer un OTP

// Protected routes
router.get("/me", authenticated, getMe);
router.get("/profile", authenticated, getProfiles);
router.put("/update-profile", authenticated, upload.single("profileImage"), updateProfile);
router.put("/update-password", authenticated, updatePassword);
router.post("/logout", authenticated, logout);
router.delete("/delete", authenticated, deleteProfile);
router.get("/profiles", authenticated, getProfiles);

export {router as userRouter};
