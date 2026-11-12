#!/usr/bin/env node
// Fails a PR that adds a known-vulnerable dependency.
//
// main already carries vulnerabilities, so failing on every advisory would
// block every PR over code it did not touch. Instead both sides are audited at
// the same moment, the base branch's lockfiles and this PR's, and only
// advisories that exist on the PR side and not on the base fail the run. A new
// advisory published against a package main already uses shows up on both
// sides, so it cannot fail an unrelated PR; fixing those is its own work.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGES = ['.', 'api', 'frontend'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
const mergeBase = git('merge-base', base, 'HEAD').trim();

function audit(cwd) {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--package-lock-only', '--json'], {
      cwd,
      encoding: 'utf8',
    });
  } catch (e) {
    // npm audit exits non-zero whenever it finds anything; the JSON is still on stdout.
    out = e.stdout;
  }
  const report = JSON.parse(out || '{}');
  if (report.error)
    throw new Error(`npm audit failed in ${cwd}: ${report.error.summary || report.error.code}`);
  const advisories = new Map();
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via === 'object') advisories.set(via.source, { pkg, ...via });
    }
  }
  return advisories;
}

function baseCopy(dir) {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-base-'));
  for (const file of ['package.json', 'package-lock.json']) {
    writeFileSync(
      join(tmp, file),
      git('show', `${mergeBase}:${dir === '.' ? '' : `${dir}/`}${file}`)
    );
  }
  return tmp;
}

// An advisory counts as new only if no package on the base branch has it. One
// already in frontend, pulled into the root by a new tool, is the same known
// problem, and some (braces) have no fixed version to upgrade to.
const onBase = new Set();
const after = [];
for (const dir of PACKAGES) {
  const before = audit(baseCopy(dir));
  const current = audit(dir);
  console.log(`${dir}: ${current.size} advisories (${before.size} on the base branch)`);
  for (const id of before.keys()) onBase.add(id);
  for (const a of current.values()) after.push({ dir, ...a });
}
const added = after.filter((a) => !onBase.has(a.source));

if (added.length) {
  const lines = added.map(
    (a) =>
      `- **${a.severity}** in \`${a.pkg}\` (${a.dir === '.' ? 'root' : a.dir}): ${a.title}. ${a.url}`
  );
  const summary = [
    `### ❌ This PR adds ${added.length} known ${added.length === 1 ? 'vulnerability' : 'vulnerabilities'}`,
    '',
    ...lines,
    '',
    'Upgrade or replace the package, then run `npm install` so the lockfile changes.',
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  for (const a of added) {
    const file = a.dir === '.' ? 'package-lock.json' : `${a.dir}/package-lock.json`;
    console.log(
      `::error file=${file},title=New vulnerability (${a.severity})::${a.pkg}: ${a.title}`
    );
  }
  process.exit(1);
}
console.log('No new vulnerabilities.');
