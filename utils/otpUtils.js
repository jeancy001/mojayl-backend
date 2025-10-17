import { User } from "../models/user.model.js";
import { sendEmail } from "./mailer.js";
import bcrypt from "bcryptjs";

/**
 * Génère un code OTP, le hash, le sauvegarde pour l'utilisateur et l'envoie par email
 * @param {string} email - Email de l'utilisateur
 * @param {string} context - Contexte d'utilisation (inscription, connexion, réinitialisation)
 * @param {string} ip - Adresse IP du client
 * @returns {Promise<{success: boolean, message: string}>} - Résultat de l'opération
 */
export const generateAndSendOTP = async (email, context = "verification", ip = "unknown") => {
  try {
    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      return { success: false, message: "Utilisateur non trouvé." };
    }

    // Vérifier si l'utilisateur est bloqué
    if (user.otpLockUntil && new Date(user.otpLockUntil) > new Date()) {
      const remainingTime = Math.ceil((new Date(user.otpLockUntil) - new Date()) / 60000);
      return { 
        success: false, 
        message: `Trop de tentatives échouées. Veuillez réessayer dans ${remainingTime} minute(s).`,
        lockUntil: user.otpLockUntil
      };
    }

    // Générer un code OTP avec la longueur appropriée selon le contexte
    let otpCode;
    if (context === "password_reset") {
      // 6 chiffres pour la réinitialisation de mot de passe
      otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    } else {
      // 4 chiffres pour l'inscription et la connexion
      otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    }
    
    // Définir l'expiration à 10 minutes
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Hasher le code OTP
    const hashedOTP = await bcrypt.hash(otpCode, 10);

    // Mettre à jour l'utilisateur avec le nouveau code OTP hashé
    user.otpCode = hashedOTP;
    user.otpExpiry = otpExpiry;
    user.otpAttempts = 0; // Réinitialiser le compteur de tentatives
    user.otpLockUntil = undefined; // Réinitialiser le blocage
    user.otpLastAction = context;
    user.otpLastIp = ip;
    await user.save();

    // Préparer le sujet et le contenu de l'email en fonction du contexte
    let subject, content;
    const userName = user.nom || user.prenom || "";
    const expiryMinutes = 10; // 10 minutes

    switch (context) {
      case "registration":
        subject = "Vérification de votre compte";
        content = `<p>Bonjour ${userName},</p>
                  <p>Merci de vous être inscrit. Votre code de vérification est : <b>${otpCode}</b></p>
                  <p>Ce code expire dans ${expiryMinutes} minutes.</p>`;
        break;
      case "login":
        subject = "Vérification de votre compte pour la connexion";
        content = `<p>Bonjour ${userName},</p>
                  <p>Votre compte n'est pas encore vérifié. Votre code de vérification est : <b>${otpCode}</b></p>
                  <p>Ce code expire dans ${expiryMinutes} minutes.</p>`;
        break;
      case "password_reset":
        subject = "Réinitialisation de votre mot de passe";
        content = `<p>Bonjour ${userName},</p>
                  <p>Vous avez demandé la réinitialisation de votre mot de passe. Votre code de vérification est : <b>${otpCode}</b></p>
                  <p>Ce code expire dans ${expiryMinutes} minutes.</p>`;
        break;
      default:
        subject = "Votre code de vérification";
        content = `<p>Bonjour ${userName},</p>
                  <p>Votre code de vérification est : <b>${otpCode}</b></p>
                  <p>Ce code expire dans ${expiryMinutes} minutes.</p>`;
    }

    // Envoyer l'email
    await sendEmail(email, subject, content);

    // Logger l'action
    console.log(`[${new Date().toISOString()}] OTP généré pour ${email} (${context}) depuis IP: ${ip}`);

    return { 
      success: true, 
      message: "Code OTP généré et envoyé avec succès.",
      otpExpiry: otpExpiry
    };
  } catch (error) {
    console.error("Erreur lors de la génération ou de l'envoi du code OTP:", error);
    return { success: false, message: error.message };
  }
};

/**
 * Vérifie si un code OTP est valide pour un utilisateur
 * @param {string} email - Email de l'utilisateur
 * @param {string} otpCode - Code OTP à vérifier
 * @param {string} context - Contexte d'utilisation (inscription, connexion, réinitialisation)
 * @param {string} ip - Adresse IP du client
 * @returns {Promise<{success: boolean, message: string, user: Object|null}>} - Résultat de la vérification
 */
export const verifyOTP = async (email, otpCode, context = "verification", ip = "unknown") => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return { success: false, message: "Utilisateur non trouvé.", user: null };
    }

     // Vérifier si l'utilisateur est bloqué
    if (user.otpLockUntil && new Date(user.otpLockUntil) > new Date()) {
      const remainingTime = Math.ceil((new Date(user.otpLockUntil) - new Date()) / 60000);
      return { 
        success: false, 
        message: `Trop de tentatives échouées. Veuillez réessayer dans ${remainingTime} minute(s).`,
        user: null,
        lockUntil: user.otpLockUntil
      };
    }

     // Vérifier si otpCode existe
    if (!user.otpCode) {
      return { 
        success: false, 
        message: "Aucun code de vérification trouvé. Veuillez demander un nouveau code.", 
        user: null 
      };
    }

    // Permettre la vérification OTP même pour password_reset sur compte vérifié
    // if (user.isVerified && context !== "password_reset") {
    //   return { success: false, message: "Ce compte est déjà vérifié.", user };
    // }

    // Vérifier si l'OTP est expiré
    if (Date.now() > user.otpExpiry) {
      // Logger la tentative échouée
      console.log(`[${new Date().toISOString()}] Tentative OTP échouée (expiré) pour ${email} (${context}) depuis IP: ${ip}`);
      
      return { success: false, message: "Code OTP expiré.", user: null };
    }

    // Vérifier si le code OTP correspond
    const isMatch = await bcrypt.compare(otpCode, user.otpCode);
    if (!isMatch) {
      // Incrémenter le compteur de tentatives
      user.otpAttempts += 1;
      
      // Vérifier si le nombre maximum de tentatives est atteint (5 tentatives)
      if (user.otpAttempts >= 5) {
        // Bloquer pendant 10 minutes
        user.otpLockUntil = new Date(Date.now() + 10 * 60 * 1000);
        user.otpAttempts = 0; // Réinitialiser le compteur
        
        await user.save();
        
        // Logger le blocage
        console.log(`[${new Date().toISOString()}] Compte bloqué pour ${email} après 5 tentatives échouées depuis IP: ${ip}`);
        
        return { 
          success: false, 
          message: "Trop de tentatives échouées. Votre compte est temporairement bloqué pendant 10 minutes.", 
          user: null,
          lockUntil: user.otpLockUntil
        };
      }
      
      await user.save();
      
      // Logger la tentative échouée
      console.log(`[${new Date().toISOString()}] Tentative OTP échouée (${user.otpAttempts}/5) pour ${email} (${context}) depuis IP: ${ip}`);
      
      return { 
        success: false, 
        message: `Code OTP invalide. Il vous reste ${5 - user.otpAttempts} tentative(s).`, 
        user: null,
        attemptsLeft: 5 - user.otpAttempts
      };
    }

    // Logger la tentative réussie
    console.log(`[${new Date().toISOString()}] Vérification OTP réussie pour ${email} (${context}) depuis IP: ${ip}`);

    return { success: true, message: "Code OTP valide.", user };
  } catch (error) {
    console.error("Erreur lors de la vérification du code OTP:", error);
    return { success: false, message: error.message, user: null };
  }
};