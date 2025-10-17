import cron from "node-cron";
import axios from "axios";

// ✅ Render backend URL (make sure this is set in your .env file)
const BACKEND_URL = process.env.BACKEND_URL;

export const startKeepAlive = () => {
  if (!BACKEND_URL) {
    console.warn("⚠️ BACKEND_URL is not defined in environment variables.");
    return;
  }

  // Run every 3 minutes to prevent Render sleep
  cron.schedule("*/3 * * * *", async () => {
    try {
      const res = await axios.get(BACKEND_URL);
      console.log(
        `⏱️ Keep-alive ping successful at ${new Date().toLocaleTimeString()} — Status: ${res.status}`
      );
    } catch (err) {
      console.error(
        `🚨 Keep-alive ping failed at ${new Date().toLocaleTimeString()}:`,
        err.response?.statusText || err.message
      );
    }
  });

  console.log("✅ Keep-alive cron job started (every 3 minutes)");
};
