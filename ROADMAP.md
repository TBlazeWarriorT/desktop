# Fork roadmap

Pending work and ideas for this GitHub Desktop fork. How to run it and architecture
notes are in `AGENTS.md`.

## Features

1. [x] **Keep other branches up to date without switching to them.**
       - [x] Preview Pull Request fetches first, so its conflict check is current.
       - [x] `↓3 ↑1` next to each branch in the dropdown (behind/ahead of its upstream).
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
4. [ ] **History search** by message, author and SHA.
5. [x] **File history:** Right Click a file → every commit that changed it
       (`git log --follow`). "Show history" in Changes and in a commit's files; the file
       becomes a chip in the History search (searchable, renames followed), and each
       commit opens on that file.
       - [ ] Open on the file in commits from before a rename (old name).
       - [ ] Folder history (a path prefix, no --follow).
6. [ ] **Conflict warning against main:** on each commit, check whether the branch
       conflicts with main (`git merge-tree --write-tree`, no checkout) and mark
       conflicting commits with an icon.
7. [ ] **View whole files**, with the diff's syntax highlighting and line numbers but no
       add/remove coloring (not as "everything added"). Entry points:
       - "View whole file" on any file open in a diff (same commit);
       - Repository > View All Files: the repo's folder tree at HEAD with fuzzy search
         (repos have thousands of files, so a virtualized tree, not a flat list);
       - Right Click a commit in History → "Browse files at this commit".
8. [ ] **Markdown preview** like github.com.
       - [x] Preview/Diff button on `.md` diffs (Changes and History), remembering the last
             choice; relative images inlined from the right version of the file.
       - [ ] Same preview in the viewer from 7.
       - [ ] Relative links between `.md` files (only https links open today, in the browser).
9. [ ] **Simple built-in text editor.**
10. [ ] **Conflicts B:** merge editor (pick one/other/both, edit, reorder lines; pop-out
        later). Builds on 2 and 9.
11. [ ] **Remotes/upstreams:** add/remove/rename/set-url.
12. [ ] **Reword and edit older commits**, not just the last one.

## rAthena syntax

- [ ] **Override (phase 3):** a "Syntax" dropdown next to Diff Options (Auto / rAthena /
      rAthena YAML / Plain text / others), with "remember for this path in this repo" and
      showing the active source (e.g. "rAthena · Gear-Mechanica-Server · 753 cmds").
- [ ] Single-line `Script: "..."` in YAML (only `|` and `>` blocks are handled today).
- [ ] Tooltip with the command's docs (from `doc/script_commands.txt`).
- [ ] Flag unknown commands and `callfunc "F_X"` targets that don't exist.

## Known issues

- [ ] **403 from `api.github.com` on TheGearfinderSociety repos:** the dev build signs in
      with GitHub Desktop's development OAuth app, which the org blocks. Approve that app
      in the org, or register the fork's own OAuth app (needed to distribute anyway).
- [ ] **Preferences rollback:** an added repository disappeared after closing the app via
      the bat file.

## Distributing to the team

- [ ] Production build with its own name and ID, installable next to the official Desktop.
- [ ] Auto-update from the fork's Releases (or disabled), and telemetry disabled.
