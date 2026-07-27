# Launch notes for snapshield

## The demo (record this, it's the whole pitch)

This is the exact scenario tested and verified while building it — screen-record
this in a terminal, it needs zero staging:

1. Show a small project with a file open, something visibly "yours" (e.g. a
   half-written function).
2. Run `snapshield run -- claude` (or whatever agent you use) and give it a
   task.
3. Cut to the agent doing something clearly destructive — the easiest to
   demo honestly is asking it to "clean up and simplify this file" and
   letting it overwrite something you wanted, or literally typing
   `git reset --hard && rm important_file.js` yourself on camera and saying
   "let's pretend the agent just did this."
4. Show the damage: `cat` the wrecked file, `ls` the missing one.
5. Run `snapshield undo`.
6. Show the file back, untouched, like nothing happened.

That's the whole video. No voiceover needed beyond "my AI agent just deleted
my work" → "one command" → "it's back." This matches the pain-point-demo
format (problem → demo → result, under 30 seconds) that's currently the
highest-converting structure on TikTok/TikTok Shop.

## Suggested caption / hook lines

Pick one, they're all pulled from real language people use about this pain
point:

- "My coding agent just nuked my repo. Watch this."
- "POV: your AI agent ran git reset --hard and you didn't back anything up"
- "I built the undo button AI coding agents don't have"
- "This happened to me once. It will never happen again."

## Where to post it first

Communities that are already primed for this exact pain point (people who
use Claude Code / Cursor / Codex daily and complain about this specific
failure mode):

- r/ClaudeAI, r/cursor, r/LocalLLaMA — mention the actual disaster story,
  not just the tool
- Indie Hackers (as a "show IH" style post — the analyzed-complaints post
  that partly inspired this is exactly the kind of thread that gets traction
  there)
- Hacker News "Show HN: snapshield – an undo button for AI coding agents"
- X/Twitter, tagging into the ongoing "vibe coding gone wrong" conversation

## Show HN post (ready to copy-paste)

**Title** (80 char HN limit):

```
Show HN: Snapshield – an undo button for AI coding agents
```

**Body** (post as a comment on your own submission, HN convention):

```
I kept reading the same story on r/ClaudeAI and r/cursor: someone lets an
agent loose on their repo, it runs something like `git reset --hard` or
deletes a file it decided was unnecessary, and an afternoon of work is gone.
Git itself doesn't really help here if the damage happened before anything
was committed.

Snapshield is a small, dependency-free CLI that sits in front of an agent
session. Before the agent runs, it snapshots the *entire* working tree —
tracked, staged, and untracked-but-not-gitignored files — into a hidden git
commit that's pinned to its own ref namespace (refs/snapshield/*), so it
never touches your real branch, index, or working tree, and git won't
garbage-collect it. If the agent wrecks something, `snapshield undo` puts it
all back in one command, including files that were deleted, not just files
that were modified.

  snapshield run -- claude    # or codex, cursor-agent, whatever
  snapshield undo             # if it goes wrong

It's ~250 lines, no dependencies beyond git itself, MIT licensed:
[link to repo]

To be upfront about what this is and isn't: it's a fast, tested prototype,
not an audited security boundary, and it's local-machine only right now — it
protects you from bad commands, not from losing the whole disk. I built and
smoke-tested it in an afternoon after noticing how often this exact failure
mode comes up, and I'd rather get it in front of people who hit this problem
than keep polishing it in private.

Genuinely curious whether people would rather have this (guaranteed
recovery, no matter what happened) versus the rule/policy-based tools
already out there that try to stop the agent from doing the bad thing in
the first place. Feedback welcome, especially on where the snapshot
approach breaks down.
```

## Before you post: the honest caveat to state up front

Say plainly that this is a fast prototype, not an audited security tool, and
that it protects against bad commands, not bad disks (no remote backup yet).
Developers trust tools more, not less, when the limits are stated up front —
and it heads off the inevitable "what if X" comments in advance.

## To actually publish (needs your own accounts — I can't do this part for you)

```bash
# 1. Push the code somewhere public (GitHub)
cd snapshield
git init
git add .
git commit -m "Initial release: snapshield 0.1.0"
gh repo create snapshield --public --source=. --push
# (or create the repo on github.com and `git remote add origin ...` + push)

# 2. Publish to npm (the name is currently free — confirmed via the registry)
npm login
npm publish
```

After that, `npx snapshield init` works for anyone, no install step required
— worth leading with that in the post since it removes all friction from
someone trying it live.
