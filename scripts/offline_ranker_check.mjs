#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(readFileSync(`${root}docs/design/fixtures/ranker-cases.json`, 'utf8'));
const context = { window: { JellyfinOnDemand: {} } };
vm.runInNewContext(
  readFileSync(`${root}plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/js/swarm/ranker.js`, 'utf8'),
  context,
);

const releases = fixture.releases.map(release => ({ ...release, query_title: fixture.query_title }));
const actual = context.window.JellyfinOnDemand.swarmRanker.rank(releases).map(release => release.id);
const expected = fixture.expected_order;

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(`expected: ${expected.join(',')}\nactual:   ${actual.join(',')}`);
  process.exit(1);
}

// Apostrophe / stopword relevance (Straight A's → From Straight As…; reject "Straight To The A").
const R = context.window.JellyfinOnDemand.swarmRanker;
const q = "Straight A's to XXX 2017";
const keep = R.filterRelevant(
  [
    { title: "From.Straight.As.to.XXX.2017.720p.HDTV.x264.AAC-ETRG" },
    { title: "Straight.To.The.A.4.XXX" },
    { title: "Straight To The A 4 2003 XXX" },
  ],
  q,
  0.67,
).map((r) => r.title);
if (!keep.some((t) => /From\.Straight\.As/i.test(t))) {
  console.error('filterRelevant must keep From.Straight.As.to.XXX 2017');
  process.exit(1);
}
if (keep.some((t) => /Straight\.To\.The\.A|Straight To The A/i.test(t))) {
  console.error('filterRelevant must drop Straight To The A junk', keep);
  process.exit(1);
}

console.log(`ranker: ${actual.join(',')}`);
