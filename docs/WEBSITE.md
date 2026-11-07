# Public website

REGRA has a public introduction and playground, alongside its installed local dashboard. The website uses a pure black canvas, charcoal work surfaces, silver test layers and lime accents. A mineral and olive day theme remains available. Instrument Sans is self-hosted under its included SIL Open Font License. The page contains a working repair demo, repository workflow explorer and four installation options. Its three CSS 3D layers represent the original code, proposed patch and saved lesson; cell colors and counts come from actual demo results. Scope details and the local-dashboard capture open on demand. There are no runtime dependencies, remote fonts, analytics, model calls, or connections to a visitor's local services.

## Preview locally

From the REGRA repository folder:

```powershell
npm run site:preview
```

Open **http://127.0.0.1:4318/regra/**. The preview runs on a different port from the real dashboard at 4317. It binds to the local machine and uses the GitHub Pages project path. Press Ctrl+C to stop it. After editing source assets, run `npm run site:build` and refresh the preview, or restart `site:preview` to rebuild automatically.

Node.js 22.13+ is enough to build and preview the public website. `npm ci` is needed for work on the full package, not for this static page.

## Files to edit

| File | Purpose |
| --- | --- |
| `site/index.html` | Page content, navigation, metadata and fallback install instructions |
| `site/styles.css` | Theme, layout, responsive rules and focus states |
| `site/theme.js` | Black default, persistent day/night choice and cross-tab synchronization before paint |
| `site/repository.mjs` | Progressive repository workflow navigation, including keyboard controls |
| `site/main.mjs` | Demo controls, install modes, client selectors and copy buttons |
| `site/scene.mjs` | Result-driven 3D surfaces and pointer tilt that respects reduced-motion preferences |
| `site/demo.mjs` | Prepared functions, case expectations, browser verification and replay |
| `site/assets/` | REGRA mark, actual dashboard screenshot and social preview image |
| `site/assets/fonts/` | Instrument Sans Latin variable font and its unmodified OFL license |
| `site/404.html` | Recovery links for missing Pages routes |
| `scripts/site/build.mjs` | Copies the fixed public-asset allowlist into ignored `_site/` |
| `scripts/site/preview.mjs` | Local preview with the `/regra/` project path |
| `.github/workflows/pages.yml` | Builds, checks and deploys the static website |
| `tests/site.test.mjs` | Demo behavior, parity with the engine, build and route checks |

`_site/` is generated and replaced on each build. Do not put hand-edited files there. The build deploys only its fixed asset list; repository source, `.regra`, MCP configuration and other project data are not copied.

## Appearance and repository workflow

The first visit uses black. The header button chooses an explicit theme and stores only `regra-theme` in localStorage. An existing day-mode preference is preserved; choices survive reloads and synchronize between open tabs. If storage is unavailable, switching still works for the current page. Removing the preference returns to black. The synchronous theme bootstrap runs before the stylesheet; without JavaScript, CSS uses black and hides the inactive toggle. The 404 page uses the same preference.

The repository explorer presents four real CLI stages: inspect, preview, verify and read evidence. Each copies a complete, single-line command suitable for PowerShell or a POSIX shell. Workflow buttons support arrows, Home, End, Enter and Space. All four stages remain readable without JavaScript. These are instructions for the installed CLI, not repository execution in the browser.

The page distinguishes read-only inspection/planning from trusted host execution, explains the three possible decisions, and links to the full repository guide. The installation selector adds a Repository CLI route alongside agent, library and dashboard setup. Repository proof files are explicitly separate from retained function lessons; reusable repository lessons and automatic hook installation are not advertised as shipped features.

Hover states cover navigation, buttons, case choices, result rows, workflow steps and disclosures. Keyboard focus is visible in both themes. The existing reduced-motion handling also disables new CSS transitions. There are no scroll-triggered text reveals or hidden essential content.

## What the demo does

The three prepared examples are empty-input averaging, whitespace in a URL slug and an empty search result. Visitors can:

1. Run an incomplete repair and observe failed existing-behavior checks.
2. Run the correct repair against every case, three times per case.
3. Keep a lesson only after a verified result.
4. Reintroduce the original function and observe the retained case catch it.
5. Download the browser results, switch examples, or reset the entire demo.

The actual prepared function bodies are invoked with fresh inputs; there is no `eval`, arbitrary source input or model-generated code. The displayed source comes from those functions. The first example executes on page load using the same verification function as the Run checks button. Patch labels describe their changes, and the result reports the observed pass/fail count. Visitors can inspect and copy a valid REGRA case contract, including the project's expected inputs and outputs. Demo lessons are scoped per example and kept only in page memory; reloading clears them. Downloaded JSON identifies itself as browser-demo data, not an installed-engine proof.

The installed engine has separate process execution, setup-error handling, project scoping and persistent evidence. The public example is deliberately limited to illustrating its behavior. Node tests compare the demo's case expectations and outcomes with the shipped examples and real engine.

The hero keeps the three separated layers without a duplicate status strip, file label or motion/layer controls. The graphic stays still until a fine mouse pointer moves over it. Tilt respects reduced motion and resets when the pointer leaves, the scene goes offscreen or the document is hidden. There is no continuous animation or background glow. The public page uses no WebGL or animation library; the installed dashboard retains its own theme.

## Installation content

The default route is a GitHub source install:

```sh
npm install --global github:mahekara28/regra
```

This needs Node, npm and Git, and the repository must contain the current CLI implementation. The website says the npm registry release is pending. Do not replace this with a registry install or advertise an npm version until a real release has been published and checked.

Agent mode generates setup for Cursor, Claude Code, Codex or VS Code. All commands use the existing current project folder (`--root .`), avoiding a placeholder path that does not exist. Library mode shows a runnable SDK example; local-app mode starts the real demo and dashboard. Copy failures select the text and explain how to copy manually.

## Publish on GitHub Pages

The intended address is **https://mahekara28.github.io/regra/**. For a public repository, GitHub Pages is available on GitHub Free. See [GitHub's custom Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

1. Open the REGRA repository on GitHub → **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Commit and push the website changes to `main`.
4. Open **Actions → REGRA website** and wait for its build and deployment jobs to succeed.
5. Open the address above. If needed, use **Run workflow** on `main` to deploy again.

From this project's current Windows folder:

```powershell
cd "C:\Users\Mehek\Documents\Codex\2026-11-06\can-reject-a-solution-that-fails\outputs\regra"
git status
git add site scripts/site/build.mjs tests/site.test.mjs README.md docs/WEBSITE.md docs/VALIDATION.md
git commit -m "Redesign REGRA website with interactive test layers"
git push origin main
```

The workflow checks pull requests without deploying them. Matching pushes and manual runs on `main` upload only `_site/` and publish through the `github-pages` environment. No separate hosting account, personal access token or paid domain is required for this GitHub Pages address.

If **Configure Pages** fails with `Get Pages site failed` or `HttpError: Not Found`, enable **GitHub Actions** as the publishing source in [REGRA's Pages settings](https://github.com/mahekara28/regra/settings/pages), then open [the website workflow](https://github.com/mahekara28/regra/actions/workflows/pages.yml) and rerun the failed jobs or use **Run workflow** on `main`. A successful commit or push alone does not enable Pages. A change only to the package smoke test or CI workflow does not trigger the website workflow, so use that manual rerun after changing the setting.

The site uses relative asset URLs. Its canonical URL, social metadata, sitemap, robots file and 404 links target `/regra/`; update them together if moving to another repository name or domain.

## Validation

```sh
npm run test:site
npm test
```

The website tests use Node's built-in test runner, so the Pages workflow does not install dependencies. The main CI matrix also runs them with the other package checks. Browser coverage and the latest validation results are recorded in [VALIDATION.md](VALIDATION.md).
