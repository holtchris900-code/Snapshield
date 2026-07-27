#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const git = require('../lib/git');
const store = require('../lib/store');

const HELP = `snapshield — a safety net for AI coding agents

Snapshots the FULL state of your repo (tracked + staged + untracked files)
into hidden, ref-pinned commits that never touch your real branch, index,
or working tree — until you explicitly restore one. Works even if an agent
just ran "git reset --hard" or deleted files out from under you.

Usage:
  snapshield init                     Set up snapshield in the current git repo
  snapshield snapshot ["message"]     Take a manual snapshot right now
  snapshield list [-n N]              List recent snapshots (default 20)
  snapshield diff <id>                Show what changed since snapshot <id>
  snapshield restore <id> [--clean]   Restore repo to snapshot <id>
                                       (auto-backs-up current state first)
  snapshield undo                     Shortcut: restore the checkpoint before
                                       the most recent one
  snapshield run -- <command...>      Snapshot, run <command>, snapshot again,
                                       and print a diffstat + one-line undo hint.
                                       Use this to wrap an AI coding agent:
                                         snapshield run -- claude
                                         snapshield run -- codex
  snapshield watch [--interval SEC]   Auto-snapshot every SEC seconds (default
                                       120) until Ctrl+C. Run this in a spare
                                       terminal tab while an agent works.
  snapshield help                     Show this message
`;

function printHelp() {
  console.log(HELP);
}

function fmtEntry(e) {
  const short = e.sha.slice(0, 8);
  return `#${e.id}  ${e.time}  [${e.kind}]  ${short}  ${e.message}`;
}

function cmdInit() {
  git.assertInsideRepo();
  git.headSha(); // exits with a helpful message if there are no commits yet
  store.storeDir();
  console.log('snapshield: initialized. Try `snapshield snapshot "first checkpoint"` to test it.');
}

function cmdSnapshot(message, kind = 'manual') {
  git.assertInsideRepo();
  const entries = store.loadAll();
  const id = store.nextId(entries);
  const { sha } = git.createSnapshotCommit(message || `snapshot #${id}`);
  const ref = `refs/snapshield/snap-${id}`;
  git.updateRef(ref, sha);
  const entry = {
    id,
    sha,
    ref,
    time: new Date().toISOString(),
    message: message || `snapshot #${id}`,
    branch: git.currentBranch(),
    kind,
  };
  store.append(entry);
  store.pruneAutoSnapshots();
  return entry;
}

function cmdList(args) {
  git.assertInsideRepo();
  let n = 20;
  const idx = args.indexOf('-n');
  if (idx !== -1 && args[idx + 1]) n = Number(args[idx + 1]);
  const entries = store.loadAll();
  if (!entries.length) {
    console.log('snapshield: no snapshots yet. Run `snapshield snapshot` to create one.');
    return;
  }
  entries.slice(-n).forEach((e) => console.log(fmtEntry(e)));
}

function requireEntry(idArg, label = 'snapshot') {
  if (!idArg) {
    console.error(`snapshield: usage requires a ${label} id. Run \`snapshield list\` to see options.`);
    process.exit(1);
  }
  const entry = store.findById(idArg);
  if (!entry) {
    console.error(`snapshield: no ${label} found with id ${idArg}.`);
    process.exit(1);
  }
  return entry;
}

function cmdDiff(idArg) {
  git.assertInsideRepo();
  const entry = requireEntry(idArg);
  console.log(git.diffStat(entry.sha, 'HEAD'));
}

function cmdRestore(idArg, flags) {
  git.assertInsideRepo();
  const entry = requireEntry(idArg);
  const backup = cmdSnapshot(`auto-backup before restoring to #${entry.id}`, 'auto');
  console.log(`snapshield: backed up current state as #${backup.id} first, just in case.`);
  const clean = flags.includes('--clean');
  git.hardResetTo(entry.sha, { clean });
  if (!clean) {
    const untracked = git.untrackedNewSince(entry.sha);
    if (untracked.length) {
      console.log(
        `snapshield: note — ${untracked.length} untracked file(s) created after this snapshot were ` +
          `left in place (re-run with --clean to remove them too):`
      );
      untracked.slice(0, 10).forEach((f) => console.log(`  ${f}`));
    }
  }
  console.log(`snapshield: restored to snapshot #${entry.id} ("${entry.message}").`);
  console.log(`snapshield: changed your mind? \`snapshield restore ${backup.id}\` undoes this restore.`);
}

function cmdUndo() {
  const entries = store.loadAll();
  if (!entries.length) {
    console.error('snapshield: no snapshots to undo to yet.');
    process.exit(1);
  }
  // The most recent snapshot usually marks "right now" (e.g. the post-run
  // snapshot after `snapshield run`, or the latest `watch` tick) — which may
  // already include whatever just went wrong. So "undo" targets the
  // checkpoint before that one, not the latest one itself.
  const target = entries.length >= 2 ? entries[entries.length - 2] : entries[entries.length - 1];
  cmdRestore(String(target.id), []);
}

function cmdRun(cmdArgs) {
  git.assertInsideRepo();
  if (!cmdArgs.length) {
    console.error('snapshield: usage: snapshield run -- <command...>');
    process.exit(1);
  }
  const pre = cmdSnapshot(`pre-run: ${cmdArgs.join(' ')}`, 'auto');
  console.log(`snapshield: snapshot #${pre.id} taken. Running: ${cmdArgs.join(' ')}\n`);
  const result = spawnSync(cmdArgs[0], cmdArgs.slice(1), { stdio: 'inherit' });
  const post = cmdSnapshot(`post-run: ${cmdArgs.join(' ')}`, 'auto');
  console.log(`\nsnapshield: command exited with code ${result.status}.`);
  console.log(`snapshield: what changed (snapshot #${pre.id} -> #${post.id}):`);
  console.log(git.diffStat(pre.sha, post.sha));
  console.log(`snapshield: not happy with the result? \`snapshield restore ${pre.id}\` undoes everything this command did.`);
}

function cmdWatch(args) {
  git.assertInsideRepo();
  let interval = 120;
  const idx = args.indexOf('--interval');
  if (idx !== -1 && args[idx + 1]) interval = Number(args[idx + 1]);
  console.log(`snapshield: watching this repo, snapshotting every ${interval}s. Press Ctrl+C to stop.`);
  const tick = () => {
    const e = cmdSnapshot('auto (watch)', 'auto');
    console.log(`snapshield: snapshot #${e.id} at ${e.time}`);
  };
  tick();
  const handle = setInterval(tick, interval * 1000);
  process.on('SIGINT', () => {
    clearInterval(handle);
    console.log('\nsnapshield: stopped watching.');
    process.exit(0);
  });
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case 'init':
      return cmdInit();
    case 'snapshot': {
      const entry = cmdSnapshot(rest.join(' '), 'manual');
      console.log(`snapshield: created snapshot #${entry.id} (${entry.sha.slice(0, 8)}).`);
      return;
    }
    case 'list':
      return cmdList(rest);
    case 'diff':
      return cmdDiff(rest[0]);
    case 'restore':
      return cmdRestore(rest[0], rest.slice(1));
    case 'undo':
      return cmdUndo();
    case 'run': {
      const dashDash = rest.indexOf('--');
      const cmdArgs = dashDash !== -1 ? rest.slice(dashDash + 1) : rest;
      return cmdRun(cmdArgs);
    }
    case 'watch':
      return cmdWatch(rest);
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      return printHelp();
    default:
      console.error(`snapshield: unknown command "${cmd}"\n`);
      printHelp();
      process.exit(1);
  }
}

main();
