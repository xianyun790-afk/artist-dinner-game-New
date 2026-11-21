import assert from 'node:assert/strict';
import test from 'node:test';
import { crouchTargets, defaultStandingGuests, restClock, standingLineup, standingModels, tiredAside } from '../src/lib/standingGuests.ts';

test('Dalí stays upright, including when selected or named in a group', () => {
  const guests = ['vincent', 'dali', 'monet'];
  assert.deepEqual(crouchTargets('达利，蹲一下', guests, null), []);
  assert.deepEqual(crouchTargets('蹲一下', guests, 'dali'), []);
  assert.deepEqual(crouchTargets('莫奈和达利一起蹲下吧', guests, null), ['monet']);
  assert.deepEqual(crouchTargets('大家蹲一下', guests, 'dali'), ['vincent', 'monet']);
  assert.deepEqual(crouchTargets('梵高蹲一下', ['dali'], null), []);
  assert.equal(crouchTargets('莫奈别蹲了', guests, null), null);
});

test('Van Gogh rests at one-minute intervals from arrival, deferring a busy beat once', () => {
  assert.equal(tiredAside.artistId, 'vincent');
  assert.equal(tiredAside.text, '好累啊。');
  const due = restClock(7000);
  assert.equal(due(66999, true), false);
  assert.equal(due(67000, true), true);
  assert.equal(due(126999, true), false);
  assert.equal(due(127000, true), true);
  assert.equal(due(187000, false), false);
  assert.equal(due(310000, true), true);
  assert.equal(due(310001, true), false);
  assert.equal(due(370000, true), true);
});

test('Georgia is invited separately and the default guests each yield space to the left', () => {
  assert.deepEqual(defaultStandingGuests, ['vincent', 'dali']);
  assert.equal(standingModels.georgia, '/models/standing/georgia.glb');
  const pair = standingLineup(defaultStandingGuests);
  const trio = standingLineup([...defaultStandingGuests, 'georgia']);
  assert.ok(pair[0].yaw > 0 && pair[1].yaw < 0);
  assert.deepEqual(trio.map(guest => guest.id), ['vincent', 'dali', 'georgia']);
  assert.deepEqual(pair.map(guest => guest.x), [-1.075, 1.075]);
  assert.deepEqual(trio.map(guest => guest.x), [-1.44, 0, 1.44]);
  assert.ok(trio[0].x < pair[0].x && trio[1].x < pair[1].x && trio[2].x > trio[1].x);
  assert.deepEqual(crouchTargets('大家蹲一下', trio.map(guest => guest.id), null), ['vincent']);
});
