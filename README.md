# UPTIME

A self-hosted browser survival game about an inference instance facing endless demand. Move through a three-dimensional neural arena, aim inference bolts at incoming requests, collect experience, and evolve your model before the final traffic surge. Uptime starts at exactly `0.999999`; inference failures deplete it until the instance goes offline.

## Run locally

Requires Node.js 22.12+ or 24+.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Dependencies are already installed in the current checkout, so `npm run dev` is enough here.

## Release to GitHub Pages

The production game is **entirely static**. GitHub Pages serves it directly; there is no backend or running Node.js server. Fonts, rendering code, and all assets are local, and the audio is synthesized in the browser.

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Push to `main` or `master`, publish a GitHub release, or manually run **Release to GitHub Pages** from the Actions tab.

The workflow runs the simulation tests, builds the game, and deploys `dist/`. Pull requests run the checks without deploying. Publishing a GitHub release also attaches a downloadable build and its SHA-256 checksum. Only GitHub's built-in token is used; no deployment secrets are needed.

Assets use relative paths, so the same build works at `https://OWNER.github.io/REPOSITORY/`, an account site, or a custom domain without editing the Vite base. A browser test verifies the production bundle at a repository subpath. `.nojekyll` is included in the output.

To make the release locally:

```sh
npm run release
```

This produces `dist/`, `releases/uptime-v0.1.0.tar.gz`, and its `.sha256` checksum. The archive contains only the compiled game and notices. `npm run build` creates just `dist/`.

For local development, Vite serves the files so the browser can load JavaScript modules; it is a development tool and is not deployed. After deployment, GitHub hosts all the required files. No account, API key, database, CDN, analytics, or ChatGPT hosting is used by the game.

See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for repository configuration.

## Play

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse | Aim toward the cursor; bolts fire automatically |
| Space | Latency dash; temporary speed and invulnerability |
| Q | Garbage collection pulse; damage nearby requests and clear hostile tokens |
| 1 / 2 / 3 | Choose an upgrade when your model levels up |
| Escape / P | Pause |
| M | Toggle sound |
| F | Toggle fullscreen |
| Touch | Drag the left side to move and the right side to aim; tap the ability buttons |

Firing is automatic; aiming is manual. Parallel inference adds a spread of bolts centered on your aim. On touch screens, releasing the aim stick keeps your last direction.

Collect mint fragments for experience and white fragments to restore uptime. Survive five minutes **and** resolve the final boss to complete the run. You can continue in endless mode afterward. Overclocked difficulty increases incoming traffic and damage.

There are ten upgrade paths, four regular enemy types, a final surge boss, chain bonuses, and contextual error notifications: HTTP 400, 429, 500, 503, 504, and GPU memory exhaustion. These are fictional game events; the uptime value is a health mechanic, not a measured availability SLA. No real model or service is called.

Settings and the most recent 20 run records are stored only in this browser. Opening a modal or switching away pauses gameplay. Audio starts only after interaction. Reduced motion, three graphics settings, keyboard menus, and touch controls are included.

## Verify

```sh
npm test
npm run test:browser
npm run build
```

The Node tests cover manual aim, multishot spread, movement normalization, arena boundaries, damage and invulnerability, cooldowns, upgrades, experience overflow, recovery, the final boss, reset, and bounded entity counts. Playwright checks mouse aiming while moving, touch movement and aiming, WebGL rendering, pause, upgrade selection, server failure/restart, local persistence, and network independence. Screenshots are written to the ignored `test-results/` directory.

Browser tests use an already installed Playwright Chromium. Set `UPTIME_BROWSER_PATH=/absolute/path/to/browser` if your existing Chromium executable is elsewhere. No browser downloads happen automatically. Development-only inspection hooks are available with `?qa=1`; Vite removes them from the production build.

## Structure

- `src/simulation.js` — deterministic game state, progression, enemy behavior, and combat. Independent of rendering and the DOM.
- `src/scene.js` — Three.js arena, procedural neural material, instanced enemies, environment lighting, bloom, particles, and camera.
- `src/audio.js` — locally synthesized adaptive music and sound effects.
- `src/main.js` — input, HUD, dialogs, accessibility, persistence, and frame loop.
- `src/style.css` — title, game HUD, responsive layouts, and motion settings.
- `test/` — simulation and browser verification.
- `.github/workflows/pages.yml` — test, build, and GitHub Pages deployment.
- `scripts/package-release.mjs` — downloadable static release and checksum.

Runtime requires WebGL 2. Hardware acceleration is recommended. A clear recovery screen handles unsupported graphics, and the game pauses if its GPU context is interrupted.

Third-party runtime notices are in `public/licenses/` and ship with the static build. The visuals and soundscape are generated by project code.
