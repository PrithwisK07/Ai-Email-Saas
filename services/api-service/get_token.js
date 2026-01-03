const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const readLine = require("readline");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
];

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("Authorize this app by visiting this url:", authUrl);

  const rl = readLine.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Enter the code from that page here: ", async (code) => {
    rl.close();
    const { tokens } = await oAuth2Client.getToken(code);
    console.log("\n--- YOUR REFRESH TOKEN ---");
    console.log(tokens.refresh_token);
    console.log("--------------------------\n");
    console.log("Save this token! You will need it for the calendar routes.");
  });
}

async function main() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  await getAccessToken(oAuth2Client);
}

main();
