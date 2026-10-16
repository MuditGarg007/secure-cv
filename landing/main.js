// Secure landing page: intro, scroll reveals, nav, and the point-cloud renders.
(() => {
  "use strict";

  // Where the app runs. Override with ?app=https://your-host or <html data-app="...">.
  const APP_URL = (new URLSearchParams(location.search).get("app") || document.documentElement.dataset.app || "http://localhost:3000").replace(/\/$/, "");

  // Drop generated media in assets/ and point these at it to replace the canvas renders.
  // Images (.webp/.png) and videos (.webm/.mp4, autoplay muted loop) are both accepted.
  const MEDIA = {
    hero: null, // e.g. "assets/hero-object.webm"
    mission: null, // e.g. "assets/mission-object.webp"
  };

  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) root.classList.add("reduced");

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ---------- App links ----------
  for (const a of document.querySelectorAll("[data-app-href]")) a.href = APP_URL + a.dataset.appHref;

  // ---------- Smooth scroll ----------
  // Lenis drives window scroll, so native scroll events (and onScroll below) still fire.
  const lenis = !reduced && window.Lenis ? new Lenis({ autoRaf: true, anchors: true }) : null;

  // ---------- Intro ----------
  // The intro plays over the hero, so always land at the top: stop the browser restoring
  // the old scroll position on reload ("instant" bypasses scroll-behavior: smooth).
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const toTop = () => {
    if (location.hash) return;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else scrollTo({ top: 0, left: 0, behavior: "instant" });
  };
  toTop();
  const INTRO_MS = reduced ? 0 : 3400;
  document.body.classList.add("is-intro");
  lenis?.stop();
  const start = () => {
    root.classList.add("is-ready");
    toTop();
    setTimeout(() => {
      toTop();
      document.body.classList.remove("is-intro");
      lenis?.start();
      nav.classList.add("is-shown");
      observeWipes();
    }, INTRO_MS);
  };
  const nav = document.querySelector("[data-nav]");
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(start, 30));

  // ---------- Wipe reveals ----------
  function observeWipes() {
    const wipes = [...document.querySelectorAll("[data-wipe]")];
    if (reduced || !("IntersectionObserver" in window)) {
      wipes.forEach((w) => w.classList.add("is-in"));
      return;
    }
    // Stagger lines that share a parent.
    const groups = new Map();
    for (const w of wipes) {
      const list = groups.get(w.parentElement) ?? [];
      list.push(w);
      groups.set(w.parentElement, list);
    }
    for (const list of groups.values()) list.forEach((w, i) => w.style.setProperty("--delay", `${i * 0.12}s`));

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
    );
    wipes.forEach((w) => io.observe(w));
  }

  // ---------- Nav: menu + dock ----------
  const panel = document.querySelector("[data-nav-panel]");
  const menuButton = document.querySelector(".nav__menu");
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
  };
  document.querySelectorAll("[data-nav-toggle]").forEach((b) => b.addEventListener("click", () => setOpen(!nav.classList.contains("is-open"))));
  panel.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) setOpen(false);
  });

  const dock = document.querySelector("[data-nav-dock]");
  const navLinks = [...panel.querySelectorAll("a")];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href")));

  // ---------- Scroll-linked effects ----------
  const heroObject = document.querySelector("[data-hero-object]");
  const hoodWipe = document.querySelector("[data-hood-wipe]");
  const hoodRows = document.querySelectorAll("[data-hood-row]");
  const footer = document.querySelector("[data-footer]");
  const footerStage = footer.querySelector(".footer__stage");
  const menuLabel = menuButton.querySelector("span");

  function onScroll() {
    const vh = innerHeight;
    const y = scrollY;

    if (!reduced) {
      const p = clamp(y / vh);
      heroObject.style.setProperty("--obj-s", String(1 - p * 0.18));
      heroObject.style.setProperty("--obj-y", `${-p * 12}vh`);
    }

    // Second "under the hood" panel wipes up over the first as its row scrolls in.
    if (hoodRows.length > 1) {
      const frame = hoodWipe.parentElement.getBoundingClientRect();
      const row = hoodRows[1].getBoundingClientRect();
      const p = clamp((frame.bottom - row.top) / frame.height);
      hoodWipe.style.setProperty("--wipe-inset", `${(1 - p) * 100}%`);
    }

    // Footer scales up from .92 as it comes into view.
    const f = footer.getBoundingClientRect();
    const fp = clamp((vh - f.top) / f.height);
    footerStage.style.setProperty("--reveal", String(0.92 + 0.08 * fp));
    footerStage.style.setProperty("--lag", String(1 - fp));

    // Dock the nav into the final CTA pill.
    if (nav.classList.contains("is-shown")) {
      const slot = dock.getBoundingClientRect();
      const navH = nav.offsetHeight;
      const fixedTop = vh - parseFloat(getComputedStyle(nav).bottom || "0") - navH;
      const dockTop = slot.top + (slot.height - navH) / 2;
      const docked = nav.classList.contains("is-docked") ? dockTop <= fixedTop + 1 : dockTop <= fixedTop;
      if (docked) {
        nav.style.setProperty("--dock-top", `${y + dockTop}px`);
        nav.classList.add("is-docked");
      } else {
        nav.classList.remove("is-docked");
      }
    }

    // Current section label in the nav.
    let current = 0;
    sections.forEach((s, i) => {
      if (s && s.getBoundingClientRect().top < vh * 0.5) current = i;
    });
    navLinks.forEach((a, i) => (i === current ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    menuLabel.textContent = navLinks[current].textContent.trim();
  }

  let ticking = false;
  const requestScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      onScroll();
    });
  };
  addEventListener("scroll", requestScroll, { passive: true });
  addEventListener("resize", requestScroll);
  onScroll();

  // ---------- Optional generated media ----------
  function swapMedia(canvas, src) {
    if (!src) return false;
    const isVideo = /\.(webm|mp4)$/i.test(src);
    const el = document.createElement(isVideo ? "video" : "img");
    el.src = src;
    el.alt = "";
    if (isVideo) Object.assign(el, { autoplay: true, muted: true, loop: true, playsInline: true });
    canvas.replaceWith(el);
    return true;
  }

  // ---------- Point clouds ----------
  // Each shape is sampled once into points with normals, then rotated and shaded per frame.
  function rand(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function boxSurface(out, r, n, cx, cy, cz, w, h, d, skip) {
    const faces = [
      [w * h, (u, v) => [cx + (u - 0.5) * w, cy + (v - 0.5) * h, cz + d / 2], [0, 0, 1]],
      [w * h, (u, v) => [cx + (u - 0.5) * w, cy + (v - 0.5) * h, cz - d / 2], [0, 0, -1]],
      [d * h, (u, v) => [cx + w / 2, cy + (v - 0.5) * h, cz + (u - 0.5) * d], [1, 0, 0]],
      [d * h, (u, v) => [cx - w / 2, cy + (v - 0.5) * h, cz + (u - 0.5) * d], [-1, 0, 0]],
      [w * d, (u, v) => [cx + (u - 0.5) * w, cy + h / 2, cz + (v - 0.5) * d], [0, 1, 0]],
      [w * d, (u, v) => [cx + (u - 0.5) * w, cy - h / 2, cz + (v - 0.5) * d], [0, -1, 0]],
    ];
    const total = faces.reduce((s, f) => s + f[0], 0);
    for (const [area, at, nrm] of faces) {
      const count = Math.round((n * area) / total);
      for (let i = 0; i < count; i++) {
        const p = at(r(), r());
        if (skip && skip(p, nrm)) continue;
        out.push([...p, ...nrm]);
      }
    }
  }

  function torusArc(out, r, n, cx, cy, cz, R, tube, a0, a1, axis = "z") {
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * r();
      const b = r() * Math.PI * 2;
      const ring = R + tube * Math.cos(b);
      let x = ring * Math.cos(a), y = ring * Math.sin(a), z = tube * Math.sin(b);
      let nx = Math.cos(b) * Math.cos(a), ny = Math.cos(b) * Math.sin(a), nz = Math.sin(b);
      if (axis === "x") { [x, z] = [z, x]; [nx, nz] = [nz, nx]; }
      out.push([cx + x, cy + y, cz + z, nx, ny, nz]);
    }
  }

  function cylinder(out, r, n, x0, x1, cy, cz, rad) {
    for (let i = 0; i < n; i++) {
      const t = r() * Math.PI * 2;
      out.push([x0 + (x1 - x0) * r(), cy + rad * Math.cos(t), cz + rad * Math.sin(t), 0, Math.cos(t), Math.sin(t)]);
    }
  }

  function vcylinder(out, r, n, cx, y0, y1, cz, rad) {
    for (let i = 0; i < n; i++) {
      const t = r() * Math.PI * 2;
      out.push([cx + rad * Math.cos(t), y0 + (y1 - y0) * r(), cz + rad * Math.sin(t), Math.cos(t), 0, Math.sin(t)]);
    }
  }

  const SHAPES = {
    padlock(r) {
      const pts = [];
      const keyhole = ([x, y], nrm) => nrm[2] !== 0 && (Math.hypot(x, y + 0.28) < 0.085 || (Math.abs(x) < 0.035 && y < -0.28 && y > -0.5));
      boxSurface(pts, r, 46000, 0, -0.32, 0, 1.15, 0.92, 0.42, keyhole);
      torusArc(pts, r, 11000, 0, 0.42, 0, 0.36, 0.085, 0, Math.PI);
      vcylinder(pts, r, 3000, -0.36, 0.12, 0.42, 0, 0.085);
      vcylinder(pts, r, 3000, 0.36, 0.12, 0.42, 0, 0.085);
      return pts;
    },
    key(r) {
      const pts = [];
      torusArc(pts, r, 22000, -0.5, 0, 0, 0.3, 0.1, 0, Math.PI * 2);
      cylinder(pts, r, 12000, -0.2, 0.82, 0, 0, 0.075);
      boxSurface(pts, r, 3500, 0.52, -0.15, 0, 0.1, 0.22, 0.12);
      boxSurface(pts, r, 3000, 0.7, -0.12, 0, 0.1, 0.17, 0.12);
      boxSurface(pts, r, 2400, 0.82, -0.09, 0, 0.06, 0.12, 0.12);
      return pts;
    },
  };

  function makeCloud(canvas) {
    const kind = canvas.dataset.cloud;
    const darkInk = canvas.dataset.tone === "dark";
    const r = rand(kind === "padlock" ? 7 : 11);
    const pts = SHAPES[kind](r);
    // Rock-like surface: jitter each point a little along its normal and give it a fixed speckle.
    const N = pts.length;
    const P = new Float32Array(N * 3), Nr = new Float32Array(N * 3), S = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const [x, y, z, nx, ny, nz] = pts[i];
      const j = (r() - 0.5) * 0.03;
      P[i * 3] = x + nx * j; P[i * 3 + 1] = y + ny * j; P[i * 3 + 2] = z + nz * j;
      Nr[i * 3] = nx; Nr[i * 3 + 1] = ny; Nr[i * 3 + 2] = nz;
      S[i] = 0.55 + 0.45 * r();
    }

    const ctx = canvas.getContext("2d");
    const L = [-0.45, 0.6, 0.66];
    let w = 0, h = 0, dpr = 1, visible = true, mx = 0, my = 0, tx = 0, ty = 0;
    let angle = kind === "key" ? 0.6 : -0.5;
    // Points go straight into a pixel buffer (max-blended), which stays fast at ~60k points.
    let img = null, px32 = null, ink = null, touched = new Int32Array(0), nTouched = 0;
    const lut = new Uint32Array(256);
    for (let v = 0; v < 256; v++) {
      const t = v / 255;
      // ImageData is RGBA little-endian: 0xAABBGGRR
      if (darkInk) {
        const a = Math.round(255 * Math.min(1, 0.1 + 0.85 * t));
        lut[v] = (a << 24) | (25 << 16) | (20 << 8) | 19;
      } else {
        const g = Math.round(55 + 200 * t);
        const a = Math.round(255 * Math.min(1, 0.3 + 0.75 * t));
        lut[v] = (a << 24) | (Math.min(255, g + 6) << 16) | (g << 8) | g;
      }
    }

    const resize = () => {
      dpr = Math.min(1.5, devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.round(rect.width * dpr));
      h = canvas.height = Math.max(1, Math.round(rect.height * dpr));
      img = ctx.createImageData(w, h);
      px32 = new Uint32Array(img.data.buffer);
      ink = new Uint8Array(w * h);
      touched = new Int32Array(N * 4);
      nTouched = 0;
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    canvas.closest("section").addEventListener("pointermove", (e) => {
      mx = (e.clientX / innerWidth - 0.5) * 2;
      my = (e.clientY / innerHeight - 0.5) * 2;
    });
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible && w > 1 && h > 1) {
        if (!reduced) angle += dt * (kind === "key" ? 0.28 : 0.22);
        tx += (mx - tx) * 0.04;
        ty += (my - ty) * 0.04;
        draw(angle + tx * 0.35, (kind === "key" ? -0.35 : -0.18) + ty * 0.2);
      }
      requestAnimationFrame(frame);
    }

    function plot(x, y, v) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const idx = y * w + x;
      if (ink[idx] === 0) touched[nTouched++] = idx;
      if (v > ink[idx]) ink[idx] = v;
    }

    function draw(yaw, pitch) {
      for (let i = 0; i < nTouched; i++) {
        const idx = touched[i];
        ink[idx] = 0;
        px32[idx] = 0;
      }
      nTouched = 0;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const scale = Math.min(w, h) * (kind === "key" ? 0.62 : 0.6);
      const ox = w / 2, oy = h / 2 + (kind === "padlock" ? h * 0.03 : 0);
      const cam = 3.2;
      const fat = dpr >= 1.4 || w > 560;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        // yaw around y, then pitch around x
        let x = P[k] * cy + P[k + 2] * sy, z = -P[k] * sy + P[k + 2] * cy, y = P[k + 1];
        const y2 = y * cp - z * sp; z = y * sp + z * cp; y = y2;
        let nx = Nr[k] * cy + Nr[k + 2] * sy, nz = -Nr[k] * sy + Nr[k + 2] * cy, ny = Nr[k + 1];
        const ny2 = ny * cp - nz * sp; nz = ny * sp + nz * cp; ny = ny2;
        if (nz < -0.1) continue; // back-facing
        const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const depth = (z + 1) / 2;
        let t = Math.min(1, (0.2 + 0.95 * Math.pow(lam, 0.9)) * S[i] * (0.8 + 0.2 * depth));
        if (darkInk) t = 0.25 + 0.75 * (1 - t) * S[i];
        const v = Math.max(1, Math.min(255, (t * 255) | 0));
        const f = cam / (cam - z);
        const sx = (ox + x * scale * f) | 0, sy2 = (oy - y * scale * f) | 0;
        plot(sx, sy2, v);
        if (fat) { plot(sx + 1, sy2, v); plot(sx, sy2 + 1, v); }
      }
      for (let i = 0; i < nTouched; i++) {
        const idx = touched[i];
        px32[idx] = lut[ink[idx]];
      }
      ctx.putImageData(img, 0, 0);
    }
    requestAnimationFrame(frame);
  }

  const heroCanvas = document.querySelector('[data-cloud="padlock"]');
  const missionCanvas = document.querySelector('[data-cloud="key"]');
  if (!swapMedia(heroCanvas, MEDIA.hero)) makeCloud(heroCanvas);
  if (!swapMedia(missionCanvas, MEDIA.mission)) makeCloud(missionCanvas);
})();
