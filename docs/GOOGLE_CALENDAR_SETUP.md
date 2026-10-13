# Google Calendar in Molomon

The calendar works with `.ics` imports and availability share codes. Live Google sign-in uses one Google OAuth client ID. Both partners can open Molomon on their own devices, sign into their own Google accounts, and load both calendars. Share calendars with **See all event details** to display event names; free/busy sharing displays availability only.

## One-time Google setup

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create or select a project named **Molomon**.
2. Under **APIs & Services → Library**, enable **Google Calendar API**.
3. Open **Google Auth Platform**. Set the app name to **Molomon**, provide your support/contact email, and choose **External** audience for personal Google accounts. While the app is in **Testing**, add both of your Google email addresses under **Audience → Test users**.
4. Under **Data Access**, add these read-only scopes:

   ```text
   https://www.googleapis.com/auth/calendar.events.freebusy
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   https://www.googleapis.com/auth/calendar.events.readonly
   ```

   These read availability, the calendar list, and events on calendars the signed-in person can access. Molomon requests only event titles, times, and availability/privacy metadata from the Events API; it does not request descriptions, locations, or attendees, and it cannot edit calendars. For an existing setup, add `calendar.events.readonly` and sign in again to approve event access. Declining event access keeps busy-time comparison available. The narrower `calendar.freebusy` scope covers only the person's own availability and does not serve the shared-calendar flow. [Google's Calendar scopes](https://developers.google.com/workspace/calendar/api/auth) explain the difference.

5. Under **Clients → Create client**, choose **Web application**. Add these **Authorized JavaScript origins** as needed:

   ```text
   https://solomonmm876.github.io
   http://127.0.0.1:4317
   http://localhost:8080
   http://127.0.0.1:8080
   ```

   An origin is scheme + hostname + port; **do not append `/molomon`, `/calendar.html`, or a trailing path**. Add the exact origin you use for any different local preview port. Google allows HTTP on localhost and loopback IP addresses; deployed sites use HTTPS. No redirect URI is needed by this popup token flow. [Origin validation](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow#validation), [client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid).

6. Copy the **Client ID**, ending in `.apps.googleusercontent.com`, into `config.js`:

   ```js
   calendar: {
     googleClientId: "YOUR_CLIENT_ID.apps.googleusercontent.com"
   },
   ```

   Replace the existing `calendar.googleClientId` value, rather than adding a duplicate `calendar` property. The client ID identifies the app and may be public. Do not put a client secret or access token in the configuration. Molomon calls the API with a Google-issued bearer token, so no API key is needed.

7. Preview the calendar from an authorized origin, reload, and press **Sign in with Google** in your panel. Choose your own account and grant the availability, calendar-list, and event-read permissions. Publish the update through the usual GitHub Pages workflow after approving publication.

Google's [JavaScript quickstart](https://developers.google.com/workspace/calendar/api/quickstart/js) describes project/API/consent/client creation. Molomon uses [Google Identity Services' token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), the [CalendarList API](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), the [Freebusy API](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), and [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) directly. Freebusy remains the authority for free-time calculations; failure to read event names does not make busy time look free.

## See both calendars on separate devices

First, each person shares their calendar with their partner in Google Calendar:

1. On a computer, open Google Calendar. Next to your calendar, choose **Settings and sharing**.
2. Under **Shared with** / **Share with specific people**, add your partner's Google email address. Select **See all event details** and send the invitation. Your partner accepts it. If already shared, change the permission from free/busy to See all event details. Events marked **Private** still hide their names from a partner with this read-only sharing permission; Molomon respects Google's access restrictions. If you prefer to share only availability, keep **See only free/busy (hide details)**.
3. Under **Integrate calendar**, copy the **Calendar ID** and give that ID to your partner. It is often an email address for a primary calendar, or an address ending in `@group.calendar.google.com` for an additional calendar.
4. Your partner does the same for their calendar. Only share with each other; public calendar sharing is unnecessary. Google explains [sharing permissions here](https://support.google.com/calendar/answer/37082?hl=en).

On each person's device:

1. Set the two names and IANA time zones, such as `Pacific/Honolulu` or `Europe/London`. Both initially use the device's zone until changed. Set the daily windows and available days in **each person's own time zone**.
2. In your own panel, **Sign in with Google** using your own account. The **Google calendars** checklist then lists the calendars you can access. Select your main calendar and any other calendars whose busy times should count for you. Calendar IDs remain available as a manual fallback; `primary` means your own main calendar.
3. In your partner's panel, replace `primary` with their explicit shared Calendar ID, then press **Load shared calendar**. This uses your existing connection and also shows the named calendar checklist in that panel; choose only calendars that should count for your partner. Your partner does not need to sign into your device.
4. Both calendars appear in **Shared week**. Event names are displayed where permitted; tap or focus a block and press Enter to see its full name, calendar, and times in both relevant zones. Overlapping events remain separate. Events marked Free use an outlined block and do not remove free time. **Free time** lists overlaps within your chosen available hours and minimum duration, with the equivalent local times for both people.

You can select up to 50 calendars in a panel. To include a separately shared activity calendar, select it in the relevant panels or enter its ID. If an ID is inaccessible, Molomon reports the error and does not treat that failed response as free time. Names and IDs from CalendarList stay on the device; chosen IDs are saved in browser preferences to make the next visit easier.

Connected Google calendars fetch current busy time and permitted event names about **once per minute while the tab is visible**, and on returning to the tab. Changing the week or calendar selection also triggers a new fetch. **Refresh Google** is available for an immediate check. The last update time and loaded week are displayed. Requests for an obsolete week or selection are discarded, and duplicate in-flight requests are not started. If event-name access is denied or a refresh fails, busy times still load and the affected calendars show Busy.

Google access tokens are short-lived. If one expires, Molomon marks previous data as a snapshot, pauses live availability, and asks you to **Sign in with Google** again. It never opens a login popup automatically. Each page refresh clears calendar data and tokens, so sign in again to resume live updates. Names, zones, hours, and chosen calendar IDs remain in that browser. `.ics` files and availability codes remain snapshots and do not auto-refresh.

## Import without Google sign-in

1. In Google Calendar on a computer, open **Settings → Import & export → Export**.
2. Unzip the download and select the relevant `.ics` files using **Import calendar .ics files** in your panel. Multiple files can be selected at once; each new import replaces that panel's previous import.
3. Import your partner's files only if they have chosen to give them to you. Otherwise exchange the availability codes below.

Import supports UTC dates, IANA `TZID` values, embedded `VTIMEZONE`, all-day events, floating local times, recurrence rules, recurrence additions/exclusions, and changed occurrences. Floating dates use the export's `X-WR-TIMEZONE`, or that person's chosen zone when the export has no valid calendar zone. All-day event end dates are exclusive. Transparent / “Free” and cancelled events do not block time.

The bundled parser is [ICAL.js 2.2.1](https://github.com/kewisch/ical.js/releases/tag/v2.2.1), under MPL-2.0. Unknown timezone definitions, invalid data, or excessive recurrence expansion produce a visible error rather than assumed availability. Imports are processed in memory, not uploaded to Molomon, GitHub, or Google.

## Availability codes

In your panel, open **Share availability → Create code → Copy code**. Send it privately to your partner. They select the same week, paste it into the other panel's **Availability code** box, and press **Load pasted code**. A code for a different week is rejected with an explanation; the selected week and existing calendar stay unchanged.

A code contains only your chosen name/time zone, week, last-update time, and busy intervals. It includes timezone boundary coverage so the same week can be viewed from different time zones. It contains no event titles, full calendar file, calendar IDs, or authorization tokens. It is readable data, not encryption. It is a snapshot; create and send a new code after changes or when choosing another week.

## Reserve a time

The **Add … minutes to calendars** button downloads `molomon-plan.ics` for the selected minimum duration starting at that free window's beginning. Import it into your Google calendars or share the plan file with your partner. This does not book a time automatically or send an invitation. Direct calendar creation would require a different permission and implementation.

## Troubleshooting

- **Google sign-in needs setup:** `calendar.googleClientId` is still empty, or the configuration has not been reloaded.
- **origin_mismatch:** add the exact browser origin to the Web application's Authorized JavaScript origins. Ports and `localhost` versus `127.0.0.1` are different origins.
- **Access blocked:** check External audience and both Test users, API enablement, and the declared read-only scopes. Work/school Google accounts may have administrator restrictions.
- **Busy but no event names:** add `calendar.events.readonly` under Google Auth Platform → Data Access and sign in again. Each partner must grant the other **See all event details** in Google Calendar's Settings and sharing. Private events stay hidden from a partner with read-only sharing. Imports and availability codes show busy times only.
- **Popup closed / blocked:** try again in a normal browser with Google popups allowed. Google authorization may reject embedded app browsers; use Safari, Chrome, or another regular browser.
- **Calendar could not be read:** check the explicit Calendar ID, accepted sharing invitation, and at least free/busy access. An entire failed calendar is not assumed free.
- **No free windows:** verify both data sources cover the selected week, then check days, zones, hours, and minimum duration. A window ending at or before its start crosses midnight; equal start/end represents 24 hours.

OAuth apps in Testing have a limited test audience and expiring test authorization. Follow Google's [audience configuration](https://support.google.com/cloud/answer/15549945) and [verification exceptions for personal use](https://support.google.com/cloud/answer/13464323?hl=en) if you later change publication status.
