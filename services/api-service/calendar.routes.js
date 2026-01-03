const express = require("express");
const fs = require("fs");
const { google } = require("googleapis");
const path = require("path");

const HARDCODED_REFRESH_TOKENS = process.env.GOOGLE_REFRESH_TOKEN;
function createCalendarRouter() {
  const router = express.Router();

  const getCalendarClient = (async = () => {
    const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
    const credentials = fs.readFileSync(CREDENTIALS_PATH);
    const { client_id, client_secret, redirect_uris } =
      JSON.parse(credentials).web;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    oAuth2Client.setCredentials({ refresh_token: HARDCODED_REFRESH_TOKENS });

    return google.calendar({
      version: "v3",
      auth: oAuth2Client,
    });
  });

  router.post("/schedule", async (req, res) => {
    const { summary, description, start_time, end_time, attendees } = req.body;
    const { tenant_id } = req.user;

    console.log(`[📅] Scheduling request for tenant ${tenant_id}: ${summary}`);

    if (!summary || !start_time) {
      return res.status(400).json({
        error: "Missing required fields (summary, start_time, end_time).",
      });
    }

    if (!end_time) {
      const startDate = new Date(start_time);
      const endDate = new Date(startDate.getTime() + 180 * 60000);
      end_time = endDate.toISOString();
    }

    try {
      const calendar = await getCalendarClient();

      const event = {
        summary: summary,
        description: description,
        start: { dateTime: start_time },
        end: { dateTime: end_time },
        attendees: attendees ? attendees.map((email) => ({ email })) : [],

        // This magic line adds a Google Meet link!
        conferenceData: {
          createRequest: {
            requestId: "sample123",
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };

      const response = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
        conferenceDataVersion: 1, // Required for Meet link creation
      });

      console.log(`[✅] Event created: ${response.data.htmlLink}`);

      res.json({
        message: "Event scheduled successfully!",
        link: response.data.htmlLink,
        meet_link:
          response.data.conferenceData?.entryPoints?.[0]?.uri ||
          "No Meet Link Generated",
      });
    } catch (error) {
      console.error("Error scheduling event:", error);
      res
        .status(500)
        .json({ error: "Failed to schedule event: " + error.message });
    }
  });

  return router;
}

module.exports = createCalendarRouter;
