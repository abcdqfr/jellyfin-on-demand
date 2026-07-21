#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(readFileSync(`${root}docs/design/fixtures/ranker-cases.json`, 'utf8'));
const context = { window: { JellyfinEnhanced: {} } };
vm.runInNewContext(
  readFileSync(`${root}plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/js/swarm/ranker.js`, 'utf8'),
  context,
);

const releases = fixture.releases.map(release => ({ ...release, query_title: fixture.query_title }));
const actual = context.window.JellyfinEnhanced.swarmRanker.rank(releases).map(release => release.id);
const expected = fixture.expected_order;

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(`expected: ${expected.join(',')}\nactual:   ${actual.join(',')}`);
  process.exit(1);
}
console.log(`ranker: ${actual.join(',')}`);
