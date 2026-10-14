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
       - [ ] Image files (binary files only say "not shown" today).
8. [ ] **Markdown preview** like github.com.
       - [x] Preview/Diff button on `.md` diffs (Changes and History), remembering the last
             choice; relative images inlined from the right version of the file.
       - [x] Same preview in the viewer from 7 (File/Preview in the Files tab header).
       - [ ] Relative links between `.md` files (only https links open today, in the browser).
9. [ ] **Simple built-in text editor.**
10. [ ] **Conflicts B:** merge editor (pick one/other/both, edit, reorder lines; pop-out
        later). Builds on 2 and 9.
11. [x] **Remotes/upstreams:** Repository > Remotes… lists every remote, with add (URL
        or local folder, then fetch), edit name/URL, remove and per-remote Fetch (a plain
        Fetch only covers the default remote and a fork's parent).
        - [ ] Cherry-pick from a remote branch without checking it out (today, picking it
              in the dropdown creates a local branch and switches to it).
12. [ ] **Reword and edit older commits**, not just the last one.

## rAthena syntax

- [x] Labels where they are used: after goto/callsub/jump_zero, menu's label slots,
      cmdothernpc's command and "Npc::OnEvent" strings (by position, not checked).
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
