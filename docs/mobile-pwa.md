# Mobile UI and iOS PWA

- At viewport widths of 900 CSS pixels or less, qBinder switches automatically
  to bottom navigation and a touch-oriented torrent list. Rotation and resizing
  re-evaluate the layout; no user-agent detection or stored mobile preference
  is required.
- Touch devices up to 1100 CSS pixels wide retain the mobile layout in landscape.
- Mobile navigation uses a floating frosted-glass capsule Dock. Cards remain
  square covers, in two columns. Tap to add torrents; long press to edit
  (850ms, or release after 450ms). Hold for 450ms then move to sort within the same lane.
  Swiping without holding scrolls the page. Desktop drag and context editing remain.
- Lane creation stays next to the account picker on both desktop and mobile.
  Torrent search, filters and refresh share one row below the mobile account picker.
- Mobile traffic charts are centered: tap a sector or legend to highlight it;
  tapping a different sector clears selection. Desktop hover details remain.
- Each torrent has an explicit actions button, multi-selection checkbox, and
  expandable path/tag/Tracker details. Desktop table preferences are preserved.
- Install on iOS: open the deployed HTTPS URL in Safari, choose Share, then
  Add to Home Screen. No App Store package is required.
- Service workers require HTTPS (localhost is allowed for development). An
  ordinary HTTP LAN address still loads the responsive UI, but cannot register
  the offline worker. Use a trusted TLS certificate for installation testing.
- Serve the Vite `dist` directory at the site root using the Go server or an
  equivalent reverse proxy. Keep `sw.js`, the manifest, and HTML revalidating;
  do not configure a long immutable cache for these files.
- The worker caches only a public offline page. It does not cache account,
  credentials, torrent, or traffic API responses, and does not queue mutations.
  Live torrent management requires a connection to the server.
- The manifest, 192/512 pixel icons, and 180 pixel Apple touch icon are built
  from `public/`. Registration runs only in production builds on secure origins.
- `agents.md` is a local-only change index excluded by `.gitignore`. Update it
  with each task's added/modified/deleted files, purpose and verification.
- Automated viewport checks do not replace testing on a physical iPhone,
  especially for the software keyboard, safe areas and Add to Home Screen.

## Verification

Build with `npm run build`, then start `npm run preview -- --port 4173`.
Run `node tests/mobile-pwa-smoke.mjs` with Playwright available. Set
`PLAYWRIGHT_MODULE` to an absolute Playwright `index.mjs` path when using an
external runtime. `TEST_BROWSER=webkit` exercises WebKit; the default is installed
Edge. Install the corresponding Playwright WebKit browser before that run.
`TEST_URL` overrides the preview URL and `TEST_OUTPUT` selects the screenshots
directory (default `.gocache/mobile-qa`, which must not be committed).
