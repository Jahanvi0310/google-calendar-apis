const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = 3000;
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Load credentials
const loadCredentials = () => {
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
};

// Save token
const saveToken = (token) => {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to', TOKEN_PATH);
};

// Authorize with OAuth 2.0
const createOAuth2Client = () => {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
};

// Fetch Google Meet Invitations
const fetchGoogleMeetEvents = async (auth, email) => {
  const calendar = google.calendar({ version: 'v3', auth });
  let events = [];
  let pageToken = null;

  do {
    const res = await calendar.events.list({
      calendarId: 'jahanvi@geekyants.com', // Use the provided email address
      timeMin: new Date().toISOString(), // Start from now
      singleEvents: true,
      orderBy: 'startTime',
      pageToken: pageToken, // Include the token for paginated results
    });

    // Filter for Google Meet events in the current batch
    const meetEvents = res.data.items
      .filter(event =>
        event.conferenceData?.conferenceSolution?.name === 'Google Meet'
      )
      .map(event => ({
        summary: event.summary,
        start: event.start.dateTime || event.start.date,
        meetLink: event.conferenceData.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri,
      }));

    events = events.concat(meetEvents); // Add to the result array
    pageToken = res.data.nextPageToken; // Update the token for the next page

  } while (pageToken);

  return events;
};

// Generate Auth URL
app.get('/auth', (req, res) => {
  const oAuth2Client = createOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.send(`Authorize this app by visiting this URL: <a href="${authUrl}" target="_blank">${authUrl}</a>`);
});

// Handle OAuth2 Callback
app.get('/', async (req, res) => {
  const code = req.query.code;
  const email = 'jahanvi@geekyants.com'//req.query.email; // Fetch email from query parameter

  if (!code) {
    res.send('Error: Authorization code not found.');
    return;
  }

  if (!email) {
    res.send('Error: Email address is required.');
    return;
  }

  const oAuth2Client = createOAuth2Client();
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    saveToken(tokens);

    const events = await fetchGoogleMeetEvents(oAuth2Client, email);
    res.json(events);
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Error retrieving access token');
  }
});

app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));
