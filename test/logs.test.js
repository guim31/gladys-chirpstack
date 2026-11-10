// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle (uplinks, statuses,
// widget reads), one line when a failure starts and one when it ends, never a
// password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceIds } from '../src/devices.js';
import { addDiscovered, createWorld, fixture, flush, topicOf, uplink } from './helpers/world.js';

const DOOR = '70b3d57ed0000001';

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

async function addedWorld(t, config) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld(config ? { config } : {});
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
  await tick(t, 0);
  await addDiscovered(world, deviceIds(world.gladys, DOOR).device);
  return world;
}

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  for (let i = 1; i <= 60; i += 1) {
    world.broker.send(
      topicOf(DOOR, 'up'),
      uplink(
        DOOR,
        { TempC_SHT: 20 + i / 10, DOOR_OPEN_STATUS: i % 2, NewKey: i },
        { name: 'Shed door' },
      ),
    );
    world.broker.send(topicOf(DOOR, 'status'), JSON.stringify(fixture('status.json')));
    await world.gladys.fake.widgetGet('devices', { language: 'en' });
    await tick(t, 60 * 1000);
  }
  assert.deepEqual(lines, []);
});

test('a broker outage is told once, its end once, without the password', async (t) => {
  const world = await addedWorld(t, { broker_url: 'mqtt://alice:hunter2@broker.example:1883' });
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 5; i += 1) {
    world.broker.drop();
    world.broker.client.emit('error', new Error('connect ECONNREFUSED'));
    await tick(t, 15 * 1000);
  }
  world.broker.accept();
  await flush();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /unreachable/);
  assert.match(lines[1], /Connected to the MQTT broker mqtt:\/\/broker\.example:1883/);
  assert.doesNotMatch(lines.join('\n'), /hunter2|alice:/);
});

test('protobuf events are told once', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 5; i += 1) {
    world.broker.send(topicOf(DOOR, 'up'), Buffer.from([0x0a, 0x10, 0x01]));
  }
  await flush();
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /json=true/);
});
