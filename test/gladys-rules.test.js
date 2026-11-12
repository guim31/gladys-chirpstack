// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the events
// captured from a real ChirpStack v4 and from an object holding every kind of
// key the mapping knows, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KINDS } from '../src/mapping.js';
import { BROKER_URL, createWorld, fixture, flush, topicOf, uplink } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const LANGUAGES = [undefined, 'en', 'de', 'es'];

function checkDevice(device) {
  const where = device.name;
  // should_poll: true if and only if poll_frequency is provided, in ms.
  if (device.poll_frequency === undefined) {
    assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
  } else {
    assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
    assert.ok(
      table.poll_frequencies_ms.includes(device.poll_frequency),
      `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
    );
  }

  assert.ok(device.features.length > 0, `${where}: no feature`);
  const externalIds = new Set();
  const names = new Set();
  for (const feature of device.features) {
    const at = `${where} / ${feature.name}`;
    const pair = table.pairs[`${feature.category}/${feature.type}`];
    assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
    assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label or icon`);

    assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
    assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${at}: finite min/max`,
    );
    assert.ok(feature.min <= feature.max, `${at}: min > max`);
    assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback must be a boolean`);
    if (feature.unit !== undefined) {
      assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
    }

    assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
    externalIds.add(feature.external_id);
    assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
    names.add(feature.name);
  }
}

// One key per kind (the override list names the ones no word would give).
const EVERY_KIND = Object.fromEntries(Object.keys(KINDS).map((kind) => [`k_${kind}`, 1]));
const OVERRIDES = Object.keys(KINDS)
  .map((kind) => `k_${kind}=${kind}`)
  .join(', ');

for (const language of LANGUAGES) {
  test(`every discovered device follows the Gladys rules (${language ?? 'default language, French'})`, async () => {
    const config = {
      broker_url: BROKER_URL,
      key_overrides: OVERRIDES,
      ...(language ? { language } : {}),
    };
    const world = await createWorld({ config });
    try {
      world.broker.accept();
      const door = '70b3d57ed0000001';
      world.broker.send(topicOf(door, 'up'), JSON.stringify(fixture('up.json')));
      world.broker.send(topicOf(door, 'up'), JSON.stringify(fixture('up-config.json')));
      world.broker.send(topicOf(door, 'status'), JSON.stringify(fixture('status.json')));
      world.broker.send(topicOf('70b3d57ed0000002', 'join'), JSON.stringify(fixture('join.json')));
      world.broker.send(topicOf('70b3d57ed0000003', 'up'), uplink('70b3d57ed0000003', EVERY_KIND));
      // Two codec keys of the same slug, one leaf too deep, a list.
      world.broker.send(
        topicOf('70b3d57ed0000004', 'up'),
        uplink('70b3d57ed0000004', { Temp: 1, temp: 2, a: { b: { c: { d: 1 } } }, l: [1] }),
      );
      await flush();
      const devices = world.gladys.fake.discoveredDevices;
      assert.equal(devices.length, 4, devices.map((d) => d.name).join(', '));
      for (const device of devices) {
        checkDevice(device);
      }
      const all = devices.find((d) => d.external_id.endsWith('70b3d57ed0000003'));
      assert.equal(all.features.length, Object.keys(KINDS).length + 2);
    } finally {
      world.app.stop();
    }
  });
}
