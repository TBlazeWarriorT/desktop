// Rebuilds a disposable repository that exercises the fork's features.
// Usage: node script/make-test-repo.mjs [path] [--force]
// Default path: ../desktop-testrepo. Its "origin" is a bare repo inside .git.
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const force = args.includes('--force')
const repo = resolve(
  args.find(a => !a.startsWith('--')) ?? join(root, '..', 'desktop-testrepo')
)
const markerName = 'desktop-testrepo'
const origin = join(repo, '.git', 'test-origin.git')

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test Bot',
  GIT_AUTHOR_EMAIL: 'test-bot@example.invalid',
  GIT_COMMITTER_NAME: 'Test Bot',
  GIT_COMMITTER_EMAIL: 'test-bot@example.invalid',
}

// A fake clock: every rebuild makes the same SHAs, so an app that still has the
// old history loaded keeps working.
let clock = Date.UTC(2026, 0, 5, 12) / 1000

function git(...a) {
  const date = `@${clock++} +0000`
  // stderr is piped: it only shows up in the thrown error when git fails.
  return execFileSync('git', a, {
    cwd: repo,
    env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function write(path, content) {
  const full = join(repo, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content.replace(/^\n/, ''))
}

function commit(message, files) {
  for (const [path, content] of Object.entries(files)) {
    write(path, content)
  }
  git('add', '-A')
  git('commit', '-q', '-m', message)
}

// --- Safety: only wipe folders this script created (or --force) -------------

if (existsSync(repo) && readdirSync(repo).length > 0) {
  if (!existsSync(join(repo, '.git', markerName)) && !force) {
    console.error(
      `${repo} exists and was not made by this script. ` +
        'Look at it first; pass --force to replace it.'
    )
    process.exit(1)
  }
  // Keep the folder itself so a running app keeps pointing at it.
  for (const entry of readdirSync(repo)) {
    rmSync(join(repo, entry), { recursive: true, force: true })
  }
}

mkdirSync(repo, { recursive: true })
git('init', '-q', '-b', 'main')
writeFileSync(
  join(repo, '.git', markerName),
  'Made by script/make-test-repo.mjs\n'
)
git('config', 'core.autocrlf', 'false')
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env })
git('remote', 'add', 'origin', origin)

// --- Content ---------------------------------------------------------------

const healer = price => `
//===== Gear Mechanica Test Script ===========================
//= Healer
//===== Description: ========================================
//= Exercises the rAthena highlighter. !TODO drop the delay.
//===========================================================

prontera,150,180,4	script	Healer#test	4_F_KAFRA1,{
	.@price = ${price};
	mes "[^0000FFHealer^000000]";
	mes "A full heal costs ^FF0000" + .@price + "^000000 zeny.";
	next;
	switch (select("Heal me:Bless me:Cancel")) {
	case 1:
		if (Zeny < .@price) {
			mes "You don't have enough zeny.";
			close;
		}
		Zeny -= .@price;
		percentheal 100, 100;
		specialeffect2 EF_HEAL2;
		break;
	case 2:
		callfunc "F_Bless", 10;
		break;
	default:
		goto L_Bye;
	}
	$heal_count++;
	close;

L_Bye:
	mes "See you!";
	close;

OnInit:
	waitingroom "Healer", 0;
	end;
}

prontera,152,180,4	duplicate(Healer#test)	Healer#test2	4_F_KAFRA1
`

const functions = `
// Global functions: callfunc "F_Bless" in healer.txt is highlighted as known.
function	script	F_Bless	{
	sc_start SC_BLESSING, 240000, getarg(0);
	specialeffect2 EF_BLESSING;
	return;
}

function	script	F_Rand	{
	return rand(getarg(0), getarg(1));
}
`

const instance = `
// Teams name their scripts .cpp; instance maps (1@begi) keep one color.
1@begi,50,50,4	script	#begi_start	HIDDEN_WARP_NPC,{
	end;
OnInstanceInit:
	.@map$ = instance_mapname("1@begi");
	monster .@map$, 50, 60, "--ja--", PORING, 5, instance_npcname(strnpcinfo(0)) + "::OnKill";
	end;
OnKill:
	if (mobcount(.@map$, instance_npcname(strnpcinfo(0)) + "::OnKill") < 1) {
		instance_announce 0, "The room is clear!", bc_map;
		enablenpc instance_npcname("#begi_exit");
	}
	end;
}

1@begi,10,10,0	script	#begi_exit	WARPNPC,1,1,{
	end;
OnInstanceInit:
	disablenpc instance_npcname(strnpcinfo(0));
	end;
OnTouch:
	warp "prontera", 150, 170;
	end;
}

-	script	BegiHelper	-1,{
	function ChkResult;
	end;
	function ChkResult {
		return getvariableofinstance('done, instance_id()); // deprecated
	}
}
`

const itemDb = bonus => `
Header:
  Type: ITEM_DB
  Version: 3

Body:
  - Id: 501
    AegisName: Red_Potion
    Name: Red Potion
    Type: Healing
    Buy: 10
    Weight: 70
    Script: |
      itemheal rand(${bonus}),0;
  - Id: 2301
    AegisName: Cotton_Shirt
    Name: Cotton Shirt
    Type: Armor
    Defense: 10
    Locations:
      Armor: true
    Script: |
      bonus bMdef,1;
      if (BaseLevel > 50) {
        bonus2 bAddRace,RC_Demon,5; // !CHECKME stacks?
      }
    EquipScript: >
      specialeffect2 EF_BLESSING;
`

const readme = extra => `
# desktop-testrepo

Disposable playground for the GitHub Desktop fork. Rebuild it any time with
\`node script/make-test-repo.mjs\` in the fork. What to try is in
[TESTING.md](TESTING.md).

![Logo](docs/img/logo.svg)

| Feature | Where |
| --- | --- |
| rAthena syntax | \`npc/\`, \`db/re/item_db.yml\` |
| Conflicts | \`npc/custom/leftover.txt\` |
${extra}`

const logo = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" viewBox="0 0 240 60">
  <rect width="240" height="60" rx="8" fill="#6e40c9"/>
  <text x="120" y="38" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">desktop-testrepo</text>
</svg>
`

const testing = `
# What to try

Rebuild this repository from the fork with \`node script/make-test-repo.mjs\`.
Its \`origin\` is a fake remote inside \`.git\`, so fetch, pull and push work offline
and nothing reaches GitHub.

## rAthena syntax highlighting

- Changes: \`npc/custom/healer.txt\` and \`db/re/item_db.yml\` have uncommitted edits.
- History: every commit touching \`npc/\` and \`db/\`.
- Look for: commands, \`.@\`/\`$\` variables, labels, \`^FF0000\` colors with
  their own background, \`!TODO\`/\`!CHECKME\` comments, \`callfunc "F_Bless"\`
  (known function), \`getvariableofinstance\` (deprecated), \`1@begi\` in one color.
- \`npc/custom/instances/begi.cpp\`: \`.cpp\` scripts are detected too.
- \`doc/sample/hello.txt\` is a script too (the rest of \`doc/\` is not).
- \`doc/script_commands.txt\`: \`*command\` entries bold, \`|1.- Title|\` and \`** sub\`
  headings, numbers, and the tab-indented examples colored as script.
- \`conf/battle/player.conf\` and \`npc/scripts_custom.conf\`: keys, \`npc:\`/\`import:\`,
  numbers, yes/no and comments.
- Tabs show as faint arrows in every rAthena file (scripts, YAML scripts, conf, doc).
- \`doc/notes.txt\` and \`src/notes.txt\` must stay plain.

## Markdown preview

- \`README.md\` has uncommitted edits: use Preview/Diff in its header.
  The logo is a relative image.
- In the Files tab, \`README.md\` has File/Preview in its header, on disk and
  when browsing a commit.

## Conflicts

- \`npc/custom/leftover.txt\` is a normal modified file with conflict markers left
  in it: alert icon in Changes, Conflicts/Diff toggle, "Conflict 1 of 2", ↑↓.
  The second block is diff3 style (with the original version).
- A real merge conflict: Branch > Merge into current branch > \`merge-me-conflict\`.
  Abort it afterwards (or rebuild the repo).
- Merge editor: in Conflicts, Edit. Each block has Current / Incoming / Both /
  Both, incoming first above it; anything can be typed too (Alt+↑/↓ moves lines,
  Ctrl+F searches, Ctrl+Z undoes). Switch files and back: unsaved edits are still
  there. Ctrl+S with no markers left: the file stops being conflicted.
- The conflicts dialog of a cherry-pick or merge has Retry ignoring whitespace: it
  aborts and starts over with \`-X ignore-space-change\` (helps when one side only
  reindented the code). In a repo with its own Prettier, the incoming lines then
  get formatted, uncommitted, with a banner (Undo discards that too).

## Stashes

- Below the changed files: "Stashes (4)". The current branch's come first; the
  one from \`pull/ahead\` shows its branch; one was made with \`git stash\` in a terminal.
- Click one to see its files. Restore (apply + delete), Apply (keep it), Discard.
- Right Click a stash: Restore, Apply, Rename…, Discard….
- "Cheaper heal idea" and the uncommitted \`healer.txt\` edit change the same line:
  Restore or Apply it to get the dialog. Close does nothing; "Stash changes and
  continue" swaps them; "Merge with my changes" leaves conflict markers.
- Stash all changes (Ctrl+Shift+S) asks for an optional name and never replaces
  an older stash. Right Click files > Stash file… stashes only those.

## History search

The search box above the History list; the ⇄ button next to it opens the old
"compare to branch" picker.

| Search | Expected |
| --- | --- |
| \`heal\` | titles: Lower/Raise/Change the heal price… |
| \`potions restore\` | "Add item db with scripts", tagged *in description* |
| \`test-bot\` | every commit, tagged *by author* |
| first 7 characters of any commit's SHA | that commit first |
| \`getvariableofinstance\` with *Search code changes* | "Add global functions and the Begi instance", *in code* |
| \`Raise the heal price\` with *All branches* | the remote-only commits of the pull/* branches |

Each result shows the branches that contain it (\`main +3\`; hover for all). The same
title on two SHAs in different branches shows two different chips.
Right Click a result > Show in history: the search closes and History shows the
commit selected among its neighbors. With *All branches*, the remote-only pull/*
commits have it disabled ("not in this branch"); their Cherry-pick commit… accepts
the current branch as the target. Alt+Tab away and back: the result stays selected.

File history: Right Click \`npc/custom/healer.txt\` (in Changes, or in a commit's file
list) > Show history. History shows only the commits that changed it, each opening
on that file; type in the box to search within them; click the file chip to go back.

## Whole files

- In Changes or History, the switcher above a diff has **File**: the whole file in
  that version (disk in Changes, the commit's in History). Deleted files have no File.
- The **Files** tab (Ctrl+3, View > Files): the folder tree of the working
  directory; type to find a file (\`heal\` finds \`npc/custom/healer.txt\`).
- History: Right Click a commit > Browse files at this commit. The tab shows
  "At commit …" with ✕ to go back to the working directory.
- Right Click a file in the tree: Show in Explorer, Open in editor, Copy path,
  Show history, View on GitHub. At an old commit the open ones say
  "(current version)". On a folder, Show history lists the commits under it.
- Edit: File mode in Changes, or a file in the Files tab (working directory only),
  has an Edit button. Change \`npc/custom/healer.txt\` and switch files: coming back
  reopens the editor with the edits. Save (or Ctrl+S) keeps its line endings; the
  diff updates. Discard throws the edits away. At a commit there is no Edit.

## Conflict warning against main

Switch to \`merge-me-conflict\` or \`pull/conflict\`: in History, their own commit gets
an orange alert (hover: "Conflicts with origin/main if merged: npc/custom/healer.txt").
\`pull/ahead\` changes other files, so it has no alert.

The branch dropdown shows the same ⚠ next to \`merge-me-conflict\` and
\`pull/conflict\` (their latest commit), from any branch.

## Remotes

Repository > Remotes… lists \`origin\` (default). Add remote \`upstream\` with
Choose folder… > \`.git/test-upstream.git\`: it fetches, and \`upstream/upstream-only\`
shows up in the branch dropdown. Then rename it, change its URL, fetch it with its own
button, and remove it (its remote branches go away).

The branch dropdown ends with a collapsed \`origin\` group (and \`upstream\` once
added). Open it: every \`origin/*\` branch is there, \`origin/main\` included, and
clicking \`origin/main\` switches to \`main\` instead of failing. Typing a filter shows
matches inside collapsed groups too.

## Branches and pulling without switching

Open the branch dropdown: each branch shows ↓behind ↑ahead of \`origin\`.
Right Click a branch > Pull from origin:

| Branch | Expected |
| --- | --- |
| \`pull/behind\` | fast-forward (a plain Fetch already does this) |
| \`pull/diverged-merge\` | merge commit, no checkout |
| \`pull/diverged-rebase\` | rebased (\`branch.*.rebase=true\`), no checkout |
| \`pull/conflict\` | "Switch and pull?" dialog |
| \`pull/ahead\` | nothing to pull, ↑1 |
`

const leftover = `
// This file was "resolved" but still has conflict markers.
-	script	Leftover	-1,{
OnInit:
<<<<<<< HEAD
	.reward = 100;
	.item = Red_Potion;
=======
	.reward = 250;
>>>>>>> feature/rewards
	end;

OnPCKillEvent:
<<<<<<< HEAD
	getexp .reward, 0;
||||||| base
	getexp 50, 0;
=======
	getexp .reward * 2, 0;
	dispbottom "Double exp!";
>>>>>>> feature/rewards
	end;
}
`

const leftoverClean = `
// This file was "resolved" but still has conflict markers.
-	script	Leftover	-1,{
OnInit:
	.reward = 100;
	end;

OnPCKillEvent:
	getexp .reward, 0;
	end;
}
`

// --- History on main ---------------------------------------------------------

commit('Initial commit', {
  'README.md': readme(''),
  'TESTING.md': testing,
  'docs/img/logo.svg': logo,
  'src/notes.txt': 'Plain text outside npc/: never highlighted.\nset .@x, 1;\n',
  'doc/script_commands.txt': `//===== rAthena Documentation =====
//= rAthena Script Commands

|1.- Basic commands.|
=====================
---------------------------------------

*mes "<string>"{,"<string>"{,...}};

Displays up to 2 lines in the dialog box.

	mes "Hello, " + strcharinfo(0) + "!";
	close;

** Set a map flag:

*cmd0 <value>;
*cmd1 <value>;
*cmd2 <value>;
*cmd3 <value>;
*cmd4 <value>;
*cmd5 <value>;
*cmd6 <value>;
*cmd7 <value>;
*cmd8 <value>;
*cmd9 <value>;
`,
  'doc/notes.txt': `Plain doc text: not the command reference, not doc/sample.
prontera,150,150,4	script	Example	4_F_KAFRA1,{
	mes "hello";
}
`,
  'doc/sample/hello.txt': `// A sample script: doc/sample is scripts.
prontera,155,180,4	script	Sample Hello	4_F_KAFRA1,{
	mes "[Hello]";
	mes "A sample from doc/sample.";
	close;
}
`,
  'conf/battle/player.conf': `// Players' maximum HP rate? (Default is 100)
hp_rate: 100

// Whether cards of the left hand apply to the right hand (Note 1)
left_cardfix_to_right: yes
server_name: "Gear Mechanica"	// tab before the comment
`,
  'npc/scripts_custom.conf': `// Custom scripts ======================================
npc: npc/custom/healer.txt
import: npc/other/scripts_other.conf
//delnpc: npc/custom/old.txt
`,
})
commit('Add healer NPC', { 'npc/custom/healer.txt': healer(500) })
commit('Add global functions and the Begi instance', {
  'npc/other/functions.txt': functions,
  'npc/custom/instances/begi.cpp': instance,
})
commit(
  'Add item db with scripts\n\nRed potions restore between 45 and 65 HP.',
  { 'db/re/item_db.yml': itemDb('45,65') }
)
commit('Add leftover script', { 'npc/custom/leftover.txt': leftoverClean })
git('push', '-q', '-u', 'origin', 'main')

// --- Branches against origin -------------------------------------------------

/** `local` commits stay local, `remote` ones end up only on origin. */
function scenario(name, { remote = [], local = [], config = {} }) {
  git('checkout', '-q', '-b', name, 'main')
  git('push', '-q', '-u', 'origin', name)
  for (const [k, v] of Object.entries(config)) {
    git('config', `branch.${name}.${k}`, v)
  }
  if (remote.length > 0) {
    remote.forEach(([msg, files]) => commit(msg, files))
    git('push', '-q', 'origin', name)
    git('reset', '-q', '--hard', 'HEAD~' + remote.length)
  }
  local.forEach(([msg, files]) => commit(msg, files))
}

const remoteHealer = [
  'Raise the heal price (remote)',
  { 'npc/custom/healer.txt': healer(800) },
]
scenario('pull/behind', { remote: [remoteHealer] })
scenario('pull/diverged-merge', {
  remote: [remoteHealer],
  local: [
    ['Tweak potion heal (local)', { 'db/re/item_db.yml': itemDb('50,70') }],
  ],
})
scenario('pull/diverged-rebase', {
  remote: [remoteHealer],
  local: [
    ['Tweak potion heal (local)', { 'db/re/item_db.yml': itemDb('50,70') }],
  ],
  config: { rebase: 'true' },
})
scenario('pull/conflict', {
  remote: [remoteHealer],
  local: [
    ['Lower the heal price (local)', { 'npc/custom/healer.txt': healer(300) }],
  ],
})
scenario('pull/ahead', {
  local: [
    [
      'Local-only README note',
      { 'README.md': readme('| Ahead | this branch |\n') },
    ],
  ],
})

git('checkout', '-q', '-b', 'merge-me-conflict', 'main')
commit('Change the heal price differently', {
  'npc/custom/healer.txt': healer(999),
})

// --- Uncommitted changes on main ---------------------------------------------

git('checkout', '-q', 'main')
commit('Lower the heal price', { 'npc/custom/healer.txt': healer(400) })
git('push', '-q', 'origin', 'main')

// --- A second remote, left for the Remotes settings to add -------------------

const upstream = join(repo, '.git', 'test-upstream.git')
execFileSync('git', ['clone', '-q', '--bare', origin, upstream], { env })
git('push', '-q', upstream, 'main:refs/heads/upstream-only')

// --- Stashes -----------------------------------------------------------------

/** Desktop's stash message: an optional name, then the branch marker. */
function stash(branch, title, files) {
  for (const [path, content] of Object.entries(files)) {
    write(path, content)
  }
  const marker = `!!GitHub_Desktop<${branch}>`
  git('stash', 'push', '-q', '-m', title ? `${title} ${marker}` : marker)
}

git('checkout', '-q', 'pull/ahead')
stash('pull/ahead', 'README wording', {
  'README.md': readme('| Stash | from another branch |\n'),
})
git('checkout', '-q', 'main')
stash('main', '', {
  'src/notes.txt': 'An unnamed stash, as Desktop made them.\n',
})
write('npc/other/functions.txt', functions.replace('240000', '60000'))
git('stash', 'push', '-q', '-m', 'Experiment from the terminal')
stash('main', 'Cheaper heal idea', { 'npc/custom/healer.txt': healer(100) })
write(
  'npc/custom/healer.txt',
  healer(450).replace(
    '$heal_count++;',
    '$heal_count++;\n\tdispbottom "Healed " + $heal_count + " times.";'
  )
)
write('db/re/item_db.yml', itemDb('60,80'))
write('npc/custom/leftover.txt', leftover)
write('README.md', readme('| Markdown | this table, rendered with Preview |\n'))

console.log(`Test repository ready at ${repo}`)
console.log('Add it in the app: File > Add local repository.')
