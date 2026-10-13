# Molomon

A shared starting page with circular navigation around the white cat and mushrooms. Watch, Play, and Together open their own category pages with circular app choices; Calendar, Notes, and Memories open the included apps. Talk and Favorites are smaller header links. Vanilla HTML, CSS, and JavaScript; no framework or package install required.

Use **Add names** on the homepage to personalize it. Names are saved on that browser/device. Calendar, Backgammon, and Notes open the included activities; Watchroom opens the same private shared room, and Rummy 500 opens its existing website.

Use **Add to phone** for installation. On Android, supported browsers show an install prompt. On iPhone, open Molomon in Safari, tap **Share → Add to Home Screen**. Installed pages use the same website and receive updates when refreshed. Offline use needs an initial online visit; live calendars, cloud notes, and remote games need a connection.

## Edit links

All names, descriptions, section assignments, icons, and destinations live in **`config.js`**. It defines `window.MOLOMON_CONFIG`:

- `title`: the website name.
- `partners`: optional names. Leave the array empty until you want names displayed.
- `sections`: each section's unique `id`, `name`, and short `description`. Their order determines navigation and page order.
- `links`: each card's unique `id`, `section`, `title`, `description`, `icon`, and `url`. The `section` must match a section ID. Their order determines card order within each section.
- `homeOptions`: circle entries use `section` for a category, or `link` for an app ID from `links`.
- `secondarySections`: category IDs to show as smaller header links.
- `secret`: Snowy's fish-bone destination and the message on the unlisted page.

To add a website, copy a link entry and change its values:

```js
{
  id: 'shared-playlist',
  section: 'together',
  title: 'Our playlist',
  description: 'Listen together.',
  icon: 'music',
  url: null
}
```

Set `url` to a complete `https://...` destination, or `./page.html` for an included activity, to enable **Open**. Keep `url: null` for unfinished cards: they show **Coming soon** / **Needs a link** and have a disabled button. Options and website links use the same tab. Use Home inside the included apps, or Browser Back after visiting an external site. Available icons: `watch`, `talk`, `chat`, `play`, `cards`, `music`, `spark`, `bookmark`, `note`, `photo`, `calendar`.

Watchroom uses an included launcher that reads its room settings only after the same private Google/Firebase authorization used by Notes. Keep individual room invitations and private access links out of this public hub. Rummy 500 is linked as a separate website.

## Included activities

Watchroom opens the same shared room and skips its create/join and name-entry page. Signed-in approved Google accounts open it automatically; otherwise the launcher asks for Google sign-in. Configure the reusable room once using [the private Watchroom setup](docs/WATCHROOM_SETUP.md). Either person can arrive first and keep the room open for the other.

Calendar combines two people's busy time and finds free slots within their chosen daily hours. Pick both time zones; proposed times appear in each zone. Import Google Calendar exports (`.ics`) to use it immediately. For live Google sign-in, follow [the one-time setup](docs/GOOGLE_CALENDAR_SETUP.md), then put the public web client ID in `config.js` → `calendar.googleClientId`. No client secret belongs in the website.

Connected Google calendars refresh every minute while visible, and when you return to the page. Availability snapshots can also be exchanged between devices; send a new snapshot after schedule changes. Shared Google calendars can be read with an account that has permission to view their busy time. Molomon does not store calendar data on a server.

Backgammon uses a Rummy-style name-entry screen. Enter your display name to start a remote table, or open an invitation and choose **Join table**. Your name is remembered on this device; no account is required. **Play on one screen** opens local pass-and-play. The host keeps the game tab open. Room invitations belong in your private chat, not `config.js`. This is a casual game without a doubling cube. Remote connections use WebRTC and PeerJS; some networks block direct connections.

Notes uses notebook tabs and bullet lists. Shared cloud storage needs [Firebase setup](docs/SHARED_NOTES_SETUP.md). Put Firebase's public web-app configuration in `config.js` → `notes.firebase`, enable Google sign-in, and restrict the database rules to your two verified Google accounts. Until configured, the notes preview saves on this device. Invitations identify your space; they do not give anyone else access. Export backups from the notes page.

Memories opens from its own homepage circle. Add a title, an optional date, and a little note about something you did together. Cards appear newest memory first, and can be edited or deleted. Memories uses the same private space, Google sign-in, drafts, and conflict protection as Notes; an existing Notes invitation works here too. On another device, sign in and join that same space through Settings. The built-in **Memories** notebook in Notes holds these entries as plain text, including their dates. **Export backup** on either page saves both notes and memories. Personal memories are never bundled into the public website.

GitHub Pages serves the homepage and static files publicly. Private notes are protected by Firebase's server rules after setup. Do not put private room invitations, access tokens, credentials, or private content into `config.js`. [Private GitHub Pages sites](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site) require an organization using GitHub Enterprise Cloud; a personal Pages hub does not provide that access gate.

Suggestions queues private website change requests after the same Firebase setup. A scheduled check in this Codex chat runs every 15 minutes, prepares changes, and asks for publishing approval. Keep the computer on, Codex running, and its controllable browser signed in to Suggestions. The checker stays quiet until the site and Firebase are configured. [Workflow details](docs/SUGGESTIONS.md), [scheduled tasks](https://learn.chatgpt.com/docs/automations).

## Local preview

From this directory, run:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). Stop the server with **Ctrl+C**. Before publishing, check section navigation, supplied links, keyboard Tab/Enter use, disabled cards, and a narrow phone-sized viewport.

## First publication — after approval

`molomon` is the repository name. The signed-in account was verified as `SolomonMM876`; the intended address is [https://solomonmm876.github.io/molomon/](https://solomonmm876.github.io/molomon/).

1. Create the **`molomon`** repository under that account and upload this project's source files to its **`main`** branch, including `.github/workflows/pages.yml`. GitHub Free supports Pages with a public repository.
2. In the repository, open **Settings → Pages → Build and deployment**, then select **GitHub Actions** as the source.
3. Open **Actions → Publish Molomon → Run workflow**, choosing **main**. Wait for both jobs to finish successfully; the deployment lists the site URL.

The workflow also runs automatically on every push to **main**. It copies only the public pages, their CSS/JavaScript, install files, and permitted assets into a Pages artifact. README, setup instructions, tests, scripts, Git metadata, and local preview files are excluded. The homepage needs no external services. Optional Google sign-in contacts Google; remote Backgammon contacts PeerJS's signaling service; configured notes contact Firebase.

## Publish updates

Edit `config.js`, preview the change, then commit and push to **main**. You can also edit `config.js` on GitHub and commit directly to **main**. After **Publish Molomon** succeeds in Actions, refresh the website; if a browser retains old files, use a hard refresh.

For local Git updates:

```sh
git add config.js
git commit -m "Update Molomon links"
git push origin main
```

To inspect the exact deployment folder locally, run `python3 scripts/prepare-pages.py`. `_site/` is generated and should stay out of Git. If you add another root HTML/CSS/JavaScript file, include it in `PUBLIC_FILES` in the prepare script. Bundled library licenses are alongside their files in `assets/vendor/`.

The workflow checks configuration syntax, Backgammon rules, calendar time-zone/recurrence logic, notes backup/conflict logic, and offline/update behavior before deploying. Real Google/Firebase connections require setup. Live Backgammon reached signaling in QA, but this network could not open its WebRTC connection; remote play remains unverified here.

GitHub references: [Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
