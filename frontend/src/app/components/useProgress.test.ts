import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STEP_TO_ROUTE } from './useProgress';

// STEP_TO_ROUTE is where a student gets sent for the step they are on. A route
// with no page sends them to a 404 mid-class, and a step missing from the table
// sends them nowhere.

const appDir = join(__dirname, '..');
const schema = readFileSync(join(__dirname, '../../../../database-files/Pandployer.sql'), 'utf8');

function progressSteps(): string[] {
  const table = /CREATE TABLE `Progress` \(([\s\S]*?)\n\)/.exec(schema);
  const column = table && /`step` enum\(([^)]*)\)/.exec(table[1]);
  if (!column) throw new Error('Could not find Progress.step in Pandployer.sql');
  return column[1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
}

describe('STEP_TO_ROUTE', () => {
  it('has a route for every value Progress.step can hold', () => {
    expect(Object.keys(STEP_TO_ROUTE).sort()).toEqual(progressSteps().sort());
  });

  it.each(Object.entries(STEP_TO_ROUTE))('%s routes to a page that exists (%s)', (_step, route) => {
    expect(existsSync(join(appDir, route, 'page.tsx'))).toBe(true);
  });
});
