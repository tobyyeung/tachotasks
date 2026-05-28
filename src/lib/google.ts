import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export async function getCalendarClient(userId: string) {
  // 1. Find the user's Google tokens in our database
  const account = await prisma.account.findFirst({
    where: {
      userId: userId,
      provider: "google",
    },
  });

  if (!account || !account.access_token) {
    throw new Error("Google account not found or missing access token");
  }

  // 2. Set up the Google Auth Client using your .env secrets
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // 3. Load the user's specific keys into the client
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // 4. Return the fully authorized Calendar API
  return google.calendar({ version: "v3", auth: oauth2Client });
}