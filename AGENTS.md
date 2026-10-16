# GitHub Desktop fork

Personal fork of GitHub Desktop, the owner's Git client for everything. It also has
first-class support for rAthena servers (the Gear Mechanica project). Never contributed
back, but we keep merging upstream releases: don't break upstream behavior or diverge
from it without a reason, and prefer putting fork code in new files with thin hooks into
upstream files (a prop, a call, a menu entry) over editing large upstream functions;
drop that preference when it would make the design worse. Upstream code conventions are
in
`.github/copilot-instructions.md`. What is planned or pending is in `ROADMAP.md`;
keep it updated when something lands.

## Running

- Open the app only through `dev-start.bat` (or its desktop shortcut). The dev exe in
  `dist/` loads the renderer from the webpack server on port 3100 and shows a white
  screen when opened directly.
- The standalone build for daily use is GitHub Desktop Blazium: `blazium-build.bat`
  runs `build:prod` into `dist/GitHubDesktopBlazium-win32-x64` (only that folder is
  replaced, the dev build stays). Production builds of this fork always get that name,
  app ID and icon (`app/package-info.ts`, `app/static/logos/blazium`), so their data
  lives in `%APPDATA%\GitHub Desktop Blazium`, apart from the official app and dev.
- Port 3000 is always taken by the Gear-Mechanica-Client vite server. Never use it.
- `dev-start.bat` runs `yarn start`, which watches every bundle into `dist/`. A full
  `build:dev` happens on its own only when `script/dev-build-stamp.mjs` sees dependencies,
  `app/static` or `script/build.ts` change. Reload the window with **Ctrl+Alt+R**.
- Never force-kill the dev app (`taskkill /f`): it has lost the user's login and
  preferences before. Close it gracefully, as `dev-rebuild.bat` does.
- Global Node is newer than `.nvmrc` and there is no global yarn: use
  `node vendor/yarn-1.21.1.js <cmd>`, with `--ignore-engines` for installs.
- Dev bundles are transpile-only (`app/webpack.common.ts`), so webpack does not report
  type errors; the background `tsc --watch` in `script/start.ts` does. Check with
  `node_modules/.bin/tsc -p tsconfig.json --noEmit` and
  `-p app/src/highlighter/tsconfig.json` (the root tsconfig excludes the highlighter).
- Manual testing happens in `../desktop-testrepo`, rebuilt from scratch by
  `node script/make-test-repo.mjs` (fake `origin` inside its `.git`, one scenario per
  feature, listed in its `TESTING.md`). Add a scenario there when a feature lands.
- Tests: `node script/test.mjs --no-experimental-webstorage app/test/unit/<file>-test.ts`.
  Node 25's built-in `localStorage` stub hides jsdom's, so without the flag any test that
  imports UI code fails with `localStorage.getItem is not a function` (upstream tests too).

## rAthena syntax highlighting

- The highlighter runs in a web worker (`app/src/highlighter/`) with CodeMirror 5 modes;
  `rathena.ts` holds the `rathena` and `rathena-yaml` modes. The worker cannot read the
  disk, so `app/src/lib/rathena/context.ts` (renderer) resolves each repository's
  context and passes it in the highlight request.
- Detection is deliberately strict, and only in a repo with `npc/`: scripts are `.txt`/
  `.cpp` under `npc/` or `doc/sample/` that contain an NPC header line (the team names
  scripts `.cpp`); `.yml` with `*Script: |`/`>` blocks; `.conf` files (`rathena-conf`);
  and `doc/*.txt` with at least ten `*command` entries, like `script_commands.txt`
  (`rathena-doc`, tab-indented examples as script). The rest of `doc/` stays plain.
  These modes are in `rathena-files.ts`, which also draws tabs as arrows.
- Commands and constants come from the repo's server source, found via `.rathena.json`
  `source`, the repo itself, or the `map-server.exe` symlink (how
  Gear-Mechanica-Server-Ferrus points to Gear-Mechanica-Server). A found source
  replaces the baseline entirely: the server removes and renames base commands.
- `app/src/lib/rathena/baseline.json` is generated from rathena master by
  `yarn generate-rathena-baseline`. Do not edit it by hand.
- Items and mobs are not script constants (AegisNames only appear in strings). The only
  db-driven constants are `RDMOPT_*`, `JOB_*` and `EAJ_*`, covered by prefixes.
