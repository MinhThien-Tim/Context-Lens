# Context Lens browser extension

Manifest V3 extension for Chromium browsers. It opens the current page or a link in the standalone Context Lens application; it does not scrape page content or request broad host permissions.

Development:

1. Build and preview Context Lens with `npm run build` and `npm run preview`.
2. Open the browser's extensions page and enable developer mode.
3. Choose **Load unpacked** and select this `extension` directory.
4. Open extension options and set the Context Lens application URL.

The application receives the URL through the existing Web Share Target-compatible query contract and performs its normal client-first Readability import.
