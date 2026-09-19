# Mobile device QA release gate

Real-device QA is a release gate, not an emulation claim. Record model, OS, browser/PWA mode, tester, date, and evidence link for every run.

| Platform | Minimum run | Current status |
| --- | --- | --- |
| Android | Oldest supported Android, Chrome, installed PWA | BLOCKED - no connected device in this workspace |
| Android | Current Android, Chrome, installed PWA | BLOCKED - no connected device in this workspace |
| iOS | Oldest supported iOS, Safari and Home Screen PWA | BLOCKED - no connected device in this workspace |
| iOS | Current iOS, Safari and Home Screen PWA | BLOCKED - no connected device in this workspace |

## Smoke script

1. Install from HTTPS, launch offline, and confirm the app shell opens.
2. Import TXT, Markdown, selectable-text PDF, EPUB, and DOCX; cancel one import midway.
3. Select a word and phrase by touch; verify lookup sheet, pronunciation, language tabs, and saved vocabulary.
4. Install the production pack, enable airplane mode, relaunch, and look up five words plus two inflections.
5. Background and kill the app; confirm document and position restoration.
6. Share URL/text into the installed PWA; verify success and proxy-failure state.
7. Exercise font size, theme, rotation, keyboard, VoiceOver/TalkBack, and 200% text scaling.
8. Test near-quota behavior, cache clearing, backup/restore, deletion, and pack removal.
9. Update the service worker build and confirm local data remains intact.
10. Attach console/network logs, screenshots, peak storage, and crash/reload evidence.

Deployment may start only after all four rows are PASS with evidence. Responsive browser mode does not satisfy this gate.
