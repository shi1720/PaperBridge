# Responsive release verification

The responsive suite exercises the public homepage and authenticated development fixtures in Chromium and mobile/touch WebKit. It runs in GitHub CI alongside the real Firebase emulator integration suite. Fixtures and attachment data remain local to the tests.

## Coverage

- Phone widths: 320, 375, and 390 CSS pixels.
- Tablet portrait: 768×1024 and 820×1180.
- Tablet landscape: 1024×768 and 1180×820.
- Short phone landscape: 667×375 and 844×390.
- Fourteen workspace routes, including AI settings, researcher profiles, request discussion/activity, PDF reading, community, and messaging.
- Both page overflow and controls clipped by ancestor containers; intentionally scrollable PDF and category regions remain usable.
- Drawer keyboard focus, Escape, footer access on short screens, background inertness, and reset across the desktop breakpoint.
- PDF fit after rotation, preservation of unsaved notes, saving/searching notes, and in-app request collaboration.
- Image/PDF attachment dialogs with long filenames, access to Close/download/page controls while scrolling, post editing, and attachment PDF refit after rotation.
- Signup/privacy dialogs preserve input and role selection at phone, tablet, and landscape sizes.

## Reproduced defects fixed

AI settings buttons forced the phone grid beyond the viewport. WebKit's native review-coverage selector contributed additional horizontal overflow. Settings tabs clipped on 320px screens. The sidebar had no scroll region on short screens and occupied too much of a portrait tablet. Mobile homepage section links were unavailable. Long media filenames pushed dialog dismissal off-screen. Community actions and reader controls had small touch targets. Profile text overlapped the dark cover. Attachment PDF rendering did not respond to container resizing.

## Commands

```sh
npx playwright install --with-deps chromium webkit
npm run test:full
```

The focused device checks can be run with `npx playwright test tests/*responsive.spec.ts`. They use the local Vite servers configured by Playwright; authentication checks use the emulator-configured server. Browser emulation validates the layouts and workflows; physical-device testing remains useful for OS keyboards and browser chrome behavior.
