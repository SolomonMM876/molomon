# Molomon

- Keep the site lightweight: static HTML, CSS, and JavaScript for GitHub Pages.
- Keep website titles, descriptions, destinations, section assignments, and
  homepage options in `config.js`.
- Homepage circles open category pages or built-in apps in the same tab.
  Talk remains a secondary link. Every built-in page has a Home link.
- Preserve the ocean green / seafoam palette, white cat and mushrooms, soft
  circular homepage, and the calendar's white background.
- Keep Watchroom and Rummy 500 unchanged. Link to their homepages, never private
  room invitations. Unfinished cards have disabled Coming soon buttons.
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
  `node test/notes-test.cjs`, and `node test/pwa-test.cjs`.
- Check phone layout and keyboard behavior after layout or navigation changes.
  Preserve reduced-motion behavior and accessible labels.
- Add new public files to `scripts/prepare-pages.py` and the service worker's
  static allowlist as needed. Never cache API responses, OAuth query URLs,
  private calendars, notes, or suggestions in the service worker.
