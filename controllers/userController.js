import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { generateAccessToken, generateRefreshToken } from "../services/tokens.js";
import { sendEmail } from "../utils/mailer.js";
import { supabase } from "../utils/supabase.js";
// Mettre à jour l'import pour inclure verifyOTP
import { generateAndSendOTP, verifyOTP } from "../utils/otpUtils.js";


// 📍 Route de test simple
export const testRoute = async (req, res) => {
  try {
    console.log('Route de test appelée avec succès');
    res.status(200).json({
      success: true,
      message: 'API fonctionne correctement!',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      data: {
        server: 'Express.js',
        status: 'online',
        version: '1.0.0'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors du test',
      error: error.message
    });
  }
};

/**
 * ----------------- REGISTER -----------------
 */
const register = async (req, res) => {
  try {
    const { nom, prenom, email, password, tel } = req.body;

    console.log('Données reçues:', { nom, prenom, email, tel });

    // Rendre le nom et prénom optionnels
    if (!email || !password) {
      console.log('Email ou mot de passe manquant');
      return res.status(400).json({ success: false, message: "Email et mot de passe sont requis." });
    }

    const existUser = await User.findOne({ email });
    if (existUser) {
      console.log("L'utilisateur existe déjà:", email); 
      return res.status(409).json({ success: false, message: "Un utilisateur avec cet email existe déjà." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      nom: nom || "",
      prenom: prenom || "", 
      email,
      password: hashedPassword,
      tel: tel || "",
      isVerified: false
    });

    console.log('💾 Tentative de sauvegarde utilisateur...'); 
    await newUser.save();
    console.log('Utilisateur sauvegardé avec ID:', newUser._id); 

    // Générer et envoyer un OTP pour la vérification du compte
    console.log('📧 Génération OTP pour:', email); 
    const otpResult = await generateAndSendOTP(email, "registration");

    if (!otpResult.success) {
      console.log('Erreur OTP:', otpResult.message); 
      return res.status(500).json({ 
        success: false, 
        message: "Erreur lors de l'envoi du code de vérification." 
      });
    }

    console.log('OTP envoyé avec succès'); 

    res.status(201).json({
      success: true,
      message: "Utilisateur enregistré avec succès. Veuillez vérifier votre email pour activer votre compte.",
      user: {
        id: newUser._id,
        nom: newUser.nom,
        prenom: newUser.prenom,
        email: newUser.email,
      },
    });

  } catch (error) {
    console.error('Erreur register:', error); 
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- LOGIN -----------------
 */
const userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email et mot de passe requis." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur non trouvé." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Mot de passe incorrect." });
    }

    // Vérifier si le compte est vérifié
    if (!user.isVerified) {
      // Générer et envoyer un nouveau code OTP
      await generateAndSendOTP(email, "login");

      return res.status(403).json({
        success: false,
        message: "Votre compte n'est pas vérifié. Un nouveau code de vérification a été envoyé à votre email.",
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await User.findByIdAndUpdate(user._id, { refreshToken });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    });

    res.status(200).json({
      success: true,
      message: "Connexion réussie.",
      accessToken,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- REQUEST RESET CODE -----------------
 */
const requestCode = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip || req.connection.remoteAddress || "unknown";

    // Utiliser la fonction utilitaire pour générer et envoyer l'OTP
    const result = await generateAndSendOTP(email, "password_reset", ip);

    if (!result.success) {
      // Si l'utilisateur est bloqué, renvoyer le temps de blocage
      if (result.lockUntil) {
        return res.status(429).json({
          success: false,
          message: result.message,
          lockUntil: result.lockUntil
        });
      }
      
      return res.status(404).json({ success: false, message: result.message });
    }

    res.status(200).json({ 
      success: true, 
      message: "Code de réinitialisation envoyé à l'email.",
      expiresAt: result.otpExpiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- RESET PASSWORD -----------------
 */
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const ip = req.ip || req.connection.remoteAddress || "unknown";

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, code et nouveau mot de passe sont requis." });
    }

    const otpResult = await verifyOTP(email, code, "password_reset", ip);

    if (!otpResult.success) {
      if (otpResult.lockUntil) {
        return res.status(429).json({
          success: false,
          message: otpResult.message,
          lockUntil: otpResult.lockUntil
        });
      }
      
      if (otpResult.attemptsLeft !== undefined) {
        return res.status(400).json({
          success: false,
          message: otpResult.message,
          attemptsLeft: otpResult.attemptsLeft
        });
      }
      
      return res.status(400).json({ success: false, message: otpResult.message });
    }

    const user = otpResult.user;

    // 🔥 SUCCÈS : Code OTP valide, réinitialiser le mot de passe
    user.password = await bcrypt.hash(newPassword, 10);
    
    // Réinitialiser les données OTP après utilisation réussie
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
    user.otpLockUntil = undefined;
    
    await user.save();

    // Envoyer un email de confirmation
    await sendEmail(
      user.email,
      "Mot de passe modifié avec succès",
      `<p>Bonjour ${user.nom || user.prenom || ""},</p>
       <p>Votre mot de passe a été modifié avec succès.</p>
       <p>Si vous n'avez pas effectué cette modification, veuillez contacter le support immédiatement.</p>`
    );

    // Logger l'action
    console.log(`[${new Date().toISOString()}] Réinitialisation de mot de passe réussie pour ${email} depuis IP: ${ip}`);

    res.status(200).json({ success: true, message: "Mot de passe réinitialisé avec succès." });
  } catch (error) {
    console.error("Erreur lors de la réinitialisation du mot de passe:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- UPDATE PASSWORD -----------------
 */
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé." });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Mot de passe actuel incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await sendEmail(
      user.email,
      "Mot de passe modifié avec succès",
      `<p>Bonjour ${user.username || user.nom || ""},</p>
       <p>Votre mot de passe a été modifié avec succès.</p>
       <p>Si vous n'avez pas effectué cette modification, veuillez contacter le support immédiatement.</p>`
    );

    res.status(200).json({ success: true, message: "Mot de passe changé avec succès." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- UPDATE PROFILE -----------------
 */
const updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const profileImage = req.file;

    if (profileImage) {
      const { data, error } = await supabase.storage
        .from("profile-images")
        .upload(`users/${Date.now()}_${profileImage.originalname}`, profileImage.buffer, {
          cacheControl: "3600",
          upsert: true,
          contentType: profileImage.mimetype,
        });

      if (error) return res.status(500).json({ success: false, message: "Supabase upload failed", error });

      updates.profileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/profile-images/${data.path}`;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select("-password");

    res.status(200).json({ success: true, message: "Profil mis à jour.", user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- REFRESH TOKEN -----------------
 */
const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: "Token manquant." });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded._id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ success: false, message: "Token invalide." });
    }

    const accessToken = generateAccessToken(user);

    res.status(200).json({ success: true, accessToken });
  } catch (error) {
    res.status(403).json({ success: false, message: "Token expiré ou invalide." });
  }
};

/**
 * ----------------- GET PROFILES -----------------
 */
const getProfiles = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


/**
 * ----------------- DELETE PROFILE -----------------
 */
const deleteProfile = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Profil supprimé." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- LOGOUT -----------------
 */
const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      await User.findByIdAndUpdate(decoded._id, { refreshToken: null });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({ success: true, message: "Déconnexion réussie." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- GET ME -----------------
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé." });

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur serveur interne" });
  }
};

/**
 * ----------------- VERIFY OTP -----------------
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otpCode, context = "verification" } = req.body;
    const ip = req.ip || req.connection.remoteAddress || "unknown";

    if (!email || !otpCode) {
      return res.status(400).json({ success: false, message: "Email et code OTP sont requis." });
    }

    const result = await verifyOTP(email, otpCode, context, ip);

    if (!result.success) {
      // Gestion des erreurs...
      if (result.lockUntil) {
        return res.status(429).json({
          success: false,
          message: result.message,
          lockUntil: result.lockUntil
        });
      }
      
      if (result.attemptsLeft !== undefined) {
        return res.status(400).json({
          success: false,
          message: result.message,
          attemptsLeft: result.attemptsLeft
        });
      }
      
      return res.status(400).json({ success: false, message: result.message });
    }

    const user = result.user;

    // 🔥 CORRECTION : NE PAS EFFACER LE CODE OTP POUR password_reset
    if (context !== "password_reset") {
      // Pour les autres contextes, valider le compte et effacer l'OTP
      user.isVerified = true;
      
      // Réinitialiser les données OTP
      user.otpCode = undefined;
      user.otpExpiry = undefined;
      user.otpAttempts = 0;
    }
    // 🔥 Pour password_reset, on garde le code OTP pour l'étape suivante
    
    await user.save();

    // Générer les tokens seulement si ce n'est pas password_reset
    let accessToken, refreshToken;
    if (context !== "password_reset") {
      accessToken = generateAccessToken(user);
      refreshToken = generateRefreshToken(user);

      await User.findByIdAndUpdate(user._id, { refreshToken });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
      });
    }

    res.status(200).json({
      success: true,
      message: context === "password_reset" 
        ? "Code de réinitialisation vérifié avec succès." 
        : "Compte vérifié avec succès.",
      accessToken: context !== "password_reset" ? accessToken : undefined,
      user: context !== "password_reset" ? {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
      } : undefined,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ----------------- RESEND OTP -----------------
 */
const resendOtp = async (req, res) => {
  try {
    const { email, context = "verification" } = req.body;
    const ip = req.ip || req.connection.remoteAddress || "unknown";

    if (!email) {
      return res.status(400).json({ success: false, message: "Email requis." });
    }

    // Vérifier si le contexte est valide
    const validContexts = ["registration", "login", "password_reset", "verification"];
    if (!validContexts.includes(context)) {
      return res.status(400).json({ 
        success: false, 
        message: "Contexte invalide. Les valeurs acceptées sont: registration, login, password_reset, verification" 
      });
    }

    // Utiliser la fonction utilitaire pour générer et envoyer l'OTP
    const result = await generateAndSendOTP(email, context, ip);

    if (!result.success) {
      // Si l'utilisateur est bloqué, renvoyer le temps de blocage
      if (result.lockUntil) {
        return res.status(429).json({
          success: false,
          message: result.message,
          lockUntil: result.lockUntil
        });
      }
      
      return res.status(404).json({ success: false, message: result.message });
    }

    res.status(200).json({ 
      success: true, 
      message: "Un nouveau code de vérification a été envoyé à votre email.",
      expiresAt: result.otpExpiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  register,
  userLogin,
  requestCode,
  resetPassword,
  updatePassword,
  updateProfile,
  refreshAccessToken,
  getProfiles,
  deleteProfile,
  logout,
  getMe,
  resendOtp,
  verifyOtp
};
