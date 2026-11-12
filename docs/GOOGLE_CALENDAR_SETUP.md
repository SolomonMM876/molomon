# Google Calendar setup

Calendar reads Google Calendar directly from each person's browser. There is no backend, no billing, and no client secret. Events are never stored; the Google access token stays in the open tab and lasts about an hour.

## 1. Check the Google OAuth client (once, by the site owner)

Open [Google Auth Platform](https://console.cloud.google.com/auth/clients) in the Google Cloud project that owns the Calendar Web client in `config.js` (`calendar.googleClientId`).

1. Enable the **Google Calendar API** in that project's APIs & Services library.
2. In **Audience**, add both of your Google accounts as Test users if the app is in Testing.
3. In **Data Access**, include these read-only scopes:
   - `https://www.googleapis.com/auth/calendar.events.freebusy`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `https://www.googleapis.com/auth/calendar.events.readonly`
4. Open the **Web application** client. Under **Authorized JavaScript origins**, keep `https://solomonmm876.github.io`. Add `http://127.0.0.1:8080` and `http://localhost:8080` if you preview locally. No redirect URI and no client secret are needed.

The client ID in `config.js` is public by design. Never put a client secret in this repository.

## 2. Share your calendars with each other (once each)

In Google Calendar on a computer:

1. Open **Settings**, choose your calendar under *Settings for my calendars*, and find **Share with specific people or groups**.
2. Add your partner's Google account with **See all event details**. (Choose *See only free/busy* if you prefer; their view then shows “Busy” without event names.)
3. Your partner opens the email from Google and chooses **Add this calendar**.

Do the same in the other direction. Share any extra calendars (work, travel) the same way.

## 3. Connect on each device

1. Open [Calendar](https://solomonmm876.github.io/molomon/calendar.html) and press **Connect Google Calendar**. Choose your Google account and allow the read-only Calendar permissions.
2. In the **You** panel, tick your calendars. Your main calendar is ticked for you the first time.
3. In the **Partner** panel, tick the calendar your partner shared with you. If it is missing, finish step 2 above and press **Refresh**.
4. Set both names, time zones (IANA names such as `Pacific/Honolulu` or `Europe/London`), available hours, and days.

These settings are saved on that device only, so each of you does this once on each device you use. On your partner's device, their calendar is **You** and yours is **Partner**.

## Each visit

Press **Connect Google Calendar** once. Google remembers the permission and the account last used on that device, so its window usually closes by itself. Google's browser sign-in lasts about an hour; when the page says it has ended, press the button again. While connected, both calendars refresh about once a minute, and when you return to the tab.

## Privacy

- The browser talks only to Google. No event names, times, or tokens are sent to Molomon, GitHub, or Firebase, and none are stored.
- Saved on the device: names, time zones, hours, days, chosen calendar IDs and names, and the Google account email used last (so Google can skip its account chooser).
- Events marked Private or Confidential show as “Private event”, including your own, because the page is meant to be looked at together.
- Access is read-only. Molomon cannot create or edit Google events.
- **Disconnect** withdraws Molomon's Google permission while connected and forgets the calendar choices on that device. You can also remove Molomon under [third-party access](https://myaccount.google.com/connections) in your Google Account.

## Troubleshooting

- **The Google window does not open:** allow popups for the site, then press the button again.
- **“Access blocked” or “not verified”:** the account is not a Test user (step 1.2), or the page's address is not an authorized JavaScript origin (step 1.4).
- **Partner's calendar is not in the list:** they have not shared it, or you have not accepted the emailed link. Press **Refresh** afterwards.
- **A calendar “could not be read”:** it is no longer shared with this account. Untick it or share it again.
- **“Busy” without names:** that calendar is shared as free/busy only.
- **Free time says it is waiting:** both people need at least one ticked calendar that loaded in the last five minutes.
