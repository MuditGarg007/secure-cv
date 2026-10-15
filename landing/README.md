# Landing page

Static marketing page for Secure. Layout and motion follow roomandpillar.com (dark/light sections, wipe-reveal headings, floating nav that docks into the final CTA, scaling footer); copy and visuals are ours.

No build step. Serve the folder and open it:

```sh
cd landing && python3 -m http.server 4321   # http://localhost:4321
```

CTAs point at the app on `http://localhost:3000`. Point them elsewhere with `?app=https://your-host` or `<html data-app="https://your-host">`.

- `index.html` / `styles.css` / `main.js`: page, styles (desktop sizes in `--d` units of a 1440px design, mobile in `--m` units of a 375px design), behaviour.
- `assets/`: SVG illustrations, decorative frames, favicon.
- Hero padlock and mission key are live canvas point clouds. To use rendered media instead, drop files in `assets/` and set `MEDIA.hero` / `MEDIA.mission` at the top of `main.js` (images or muted looping video).
- Fonts: Geist + Geist Mono from Google Fonts.
