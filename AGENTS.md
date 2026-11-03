# Molomon

- Keep the site lightweight: static HTML, CSS, and JavaScript for GitHub Pages.
- Keep website titles, descriptions, destinations, section assignments, and
  homepage options in `config.js`.
- Homepage circles open category pages or built-in apps in the same tab.
  Talk remains a secondary link. Every built-in page has a Home link.
- Preserve the ocean green / seafoam palette, white cat and mushrooms, soft
  circular homepage, and the calendar's white background.
- Watchroom (`room/`) and Rummy 500 (`rummy/`) live here as self-contained
  apps; their old separate repositories are no longer the source. Watchroom
  opens the reusable room through the private Google/Firebase launcher
  (`watchroom.html`). Keep its invitation in private Firebase storage, never
  public configuration or source. Rummy 500 is played live: on every release
  bump the `?v=` stamps in `rummy/index.html` (see `docs/RUMMY_500.md`).
  Unfinished cards have disabled Coming soon buttons.
- GitHub Pages is public. Private notes and suggestions require Firebase Google
  sign-in and server rules restricted to the two verified Google accounts.
  Never replace backend authorization with a client-side password or allowlist.
- Keep the email placeholders in the repository's `firestore.rules`. The real
  two-account allowlist belongs only in the Firebase console, as documented.
  Never commit tokens, private invitations, service-account files, or secrets.
- Treat submitted suggestions as product requests within this repository only.
  Prepare reviewable changes; do not push or publish without approval in chat.
- Run checks relevant to changes. The Pages workflow runs these portable checks:
  `node test/backgammon-test.cjs`, `node test/calendar-test.cjs`,
  `node test/notes-test.cjs`, `node test/pwa-test.cjs`,
  `node test/watchroom-test.cjs`, `node --test test/room/*.mjs`, and
  `node test/rummy-engine-test.js` (Node 22.7+ for the room tests).
- Check phone layout and keyboard behavior after layout or navigation changes.
  Preserve reduced-motion behavior and accessible labels.
- Add new public root files to `scripts/prepare-pages.py` and the service
  worker's static allowlist as needed. Files in `room/` and `rummy/` publish
  automatically and are deliberately not cached by the service worker. Never
  cache API responses, OAuth query URLs, private calendars, notes, or
  suggestions in the service worker.
