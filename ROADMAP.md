# Fork roadmap

Pending work and ideas for this GitHub Desktop fork. How to run it and architecture
notes are in `AGENTS.md`.

## Features

1. [x] **Keep other branches up to date without switching to them.**
       - [x] Preview Pull Request fetches first, so its conflict check is current.
       - [x] `1↑ 3↓` next to each branch in the dropdown (ahead/behind its upstream, like the Push button).
       - [x] Right Click → Pull from origin on any branch: fast-forward, or merge
             (`merge-tree` + `commit-tree`) / rebase (`git replay`) per pull settings,
             without checkout. Conflicts → dialog offering to switch and pull.
       - [x] One-click "switch and pull" on conflicts instead of a plain message.
2. [x] **Conflicts A:** find, count, navigate and display conflict markers in any
       uncommitted file (read-only, with syntax highlighting).
       - [x] Conflicts/Diff toggle: the whole file with current/incoming blocks colored,
             "Conflict 2 of 5" and ↑↓ buttons (`ui/diff/conflict-view.tsx`).
       - [x] Leftover markers in files that are no longer conflicted get the alert icon
             in Changes (`git diff --check` limited to the changed files).
3. [x] **Named stashes:** list, names, apply/pop/drop, no per-branch overwrite.
       - [x] "Stashes (n)" in Changes: every stash, other branches and `git stash` ones
             included; Restore, Apply (keep), Rename, Discard.
       - [x] Stash all changes asks for an optional name; Right Click files → Stash
             selected files. Names go before Desktop's marker, so the official app
             still reads them.
4. [x] **History search** by message, author and SHA.
       - [x] Each result shows the branches that contain it ("main +2", all in the tooltip).
       - [x] Right Click a result > Show in history: the full list, scrolled to it and
             selected (disabled for commits outside the current branch). Cherry-pick
             accepts the current branch as the target when the commits aren't in it.
5. [x] **File history:** Right Click a file → every commit that changed it
       (`git log --follow`). "Show history" in Changes and in a commit's files; the file
       becomes a chip in the History search (searchable, renames followed), and each
       commit opens on that file.
       - [ ] Open on the file in commits from before a rename (old name).
       - [x] Folder history: Right Click a folder in the Files tab > Show history.
6. [x] **Conflict warning against main:** each of the branch's newest 50 commits
       not in the remote main (origin/HEAD, else origin/main or master) is checked with
       `git merge-tree --write-tree`, no checkout; conflicting ones get an orange alert
       with the files in its tooltip. Results are cached per commit and main.
       - [x] Branch dropdown: ⚠ next to local branches whose latest commit would
             conflict (two checks at a time, same cache).
       - [ ] Recheck right after a fetch moves origin/main (today: when the list reloads).
7. [x] **View whole files**, with the diff's syntax highlighting and line numbers.
       - [x] **File** in the diff's view switcher (Changes: disk; History: that commit).
       - [x] **Files** tab (Ctrl+3): working-directory tree with fuzzy find.
       - [x] Right Click a commit → Browse files at this commit.
       - [x] Right Click in the tree: reveal, open, copy path, history, View on GitHub.
       - [x] Back/Forward between visited files and commits: ← → in the header, mouse
             side buttons, Alt+Left/Right (`lib/files-navigation.ts`).
       - [ ] Image files (binary files only say "not shown" today).
8. [ ] **Markdown preview** like github.com.
       - [x] Preview/Diff button on `.md` diffs (Changes and History), remembering the last
             choice; relative images inlined from the right version of the file.
       - [x] Same preview in the viewer from 7 (File/Preview in the Files tab header).
       - [ ] Relative links between `.md` files (only https links open today, in the browser).
       - [ ] Ctrl+F in the Markdown preview (it's an iframe; File mode has Ctrl+F meanwhile).
9. [x] **Simple built-in text editor.** Edit in File mode (Changes) and in the Files
       tab, working directory only (`ui/editor/file-editor.tsx`, shared with 10): Save
       or Discard closes it, Ctrl+S saves and stays, line endings are kept, and unsaved
       edits reopen when coming back to the file (until the app closes).
10. [x] **Conflicts B:** merge editor. Conflicts > Edit: each block gets Current /
        Incoming / Both / Both, incoming first, and the file is editable (CodeMirror 6,
        `ui/editor/code-editor.tsx`, highlighted by our worker). Ctrl+S keeps the line
        endings; unsaved edits survive switching files.
        - [ ] "Resolve here" next to "Open in editor" in the conflicts dialog.
        - [ ] Pop-out window.
        - [ ] Three-pane layout (current | incoming over the result), if inline falls short.
        - [x] "Retry ignoring whitespace" in the conflicts dialog of cherry-pick and merge:
              aborts and starts over with `-X ignore-space-change` (clears conflicts
              from reindented code; what comes in keeps its own indentation).
              The dialog simulates it first (`merge-tree`) and says when it would
              clear all or some of the conflicts.
              When the retry finishes, the project's own Prettier (if it has one and
              a config) formats only the incoming lines, left uncommitted with a banner
              (`lib/format-incoming.ts`).
        - [ ] Without a formatter: reindent incoming lines by their neighbors' shift,
              using `.editorconfig` for tabs/spaces. clang-format/ruff as adapters if a
              repo starts using them (both format line ranges natively).
        - [ ] Same retry for rebase.
11. [x] **Remotes/upstreams:** Repository > Remotes… lists every remote, with add (URL
        or local folder, then fetch), edit name/URL, remove and per-remote Fetch (a plain
        Fetch only covers the default remote and a fork's parent).
        - [x] Branch dropdown: one collapsible group per remote (origin first) with all
              its branches, tracked ones included; collapsed unless opened, remembered
              per repository. A tracked remote branch switches to its local branch.
        - [ ] Cherry-pick from a remote branch without checking it out (today, picking it
              in the dropdown creates a local branch and switches to it).
12. [ ] **Reword and edit older commits**, not just the last one.
13. [ ] **Patches:** create and apply, for what github.com's `.patch` URLs can't cover
        (unpushed commits, repos outside GitHub, several commits at once).
        - [ ] Right Click a commit > Save as patch…; with several selected, Save as
              merged patch… (one squashed file) or Save as N patches… (picks a folder).
        - [ ] Apply: drop a `.patch` on the window, or a menu entry to pick one;
              `git am` (commits) or `git apply` (plain diff), with the same "Retry
              ignoring whitespace" as cherry-pick when it doesn't apply cleanly.

## rAthena syntax

- [x] Labels where they are used: after goto/callsub/jump_zero, menu's label slots,
      cmdothernpc's command and "Npc::OnEvent" strings (by position, not checked).
- [x] `doc/sample/` scripts, `.conf` files (conf and npc), every other `doc/*.txt`
      (`*command` entries, examples as script), and tabs drawn as arrows in every rAthena
      file. Also `.bat`/`.cmd`, `.sln`, `.psm1`/`.psd1` and `.vcxproj.filters`.
- [x] **Override (phase 3):** "Syntax: Auto" next to Diff Options and in the Files tab
      header: Auto / the four rAthena modes / Plain text / Other languages, remembered for
      the path in the repo (`lib/syntax-override.ts`); the menu shows the active source
      ("rAthena · Gear-Mechanica-Server · 753 commands").
- [ ] Single-line `Script: "..."` in YAML (only `|` and `>` blocks are handled today).
- [x] Tooltip with the command's docs: hovering a command (diff, whole file, editor)
      shows its `doc/script_commands.txt` entry from the active source
      (`lib/rathena/command-docs.ts`).
- [ ] Flag unknown commands and `callfunc "F_X"` targets that don't exist.
- [ ] Maybe: autocomplete of commands (and constants, labels, `callfunc` targets) in the
      editor, from the active source; its docs entry alongside, as in the tooltip.

## Known issues

- [ ] **403 from `api.github.com` on TheGearfinderSociety repos:** the dev build signs in
      with GitHub Desktop's development OAuth app, which the org blocks. Approve that app
      in the org, or register the fork's own OAuth app (needed to distribute anyway).
- [ ] **Preferences rollback:** an added repository disappeared after closing the app via
      the bat file.

## Distributing to the team

- [x] Production build with its own name and ID next to the official Desktop: GitHub
      Desktop Blazium (`blazium-build.bat`; own data folder, app ID, exe and icon;
      adds itself to the Start menu).
      - [ ] An installer (today it runs from `dist/`), and its own OAuth app (see Known
            issues).
- [x] Telemetry and update checks disabled (`app/src/lib/fork.ts`).
      - [ ] Auto-update from the fork's Releases.
