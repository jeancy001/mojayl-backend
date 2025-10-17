import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    nom: { type: String, required: false },
    prenom: { type: String, required: false },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profileUrl: { type: String, required: false },
    tel: { type: String, required: false },
    address: [
      {
        ville: { type: String },
        pays: { type: String },
      },
    ],
    role: {
      type: String,
      enum: ["admin", "client"],
      default: "client",
    },
    isVerified: { type: Boolean, default: false },
    otpCode: { type: String },
    otpExpiry: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    otpLockUntil: { type: Date },
    otpLastAction: { type: String },
    otpLastIp: { type: String },
    refreshToken: { type: String },
    resetCode: { type: String },
    resetCodeExpire: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
