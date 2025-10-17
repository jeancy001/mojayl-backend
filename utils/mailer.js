import nodemailer from "nodemailer";

export const sendEmail = async (to, subject, html) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail", 
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, 
      },
    });
    const mailOptions = {
      from: `"Support Team" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <div style="max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
            <h2 style="color: #007bff; text-align: center; margin-bottom: 20px;">${subject}</h2>
            <div style="font-size: 15px; line-height: 1.6;">
              ${html}
            </div>
            <p style="margin-top: 30px; font-size: 13px; color: #777; text-align: center;">
              Merci de nous faire confiance.<br/>– L’équipe Support
            </p>
          </div>
        </div>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`✅ Email envoyé à ${to}`);
  } catch (error) {
    console.error(" Erreur d’envoi email:", error.message);
  }
};
