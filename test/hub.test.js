// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake broker
// carrying the events captured from a real ChirpStack v4: discovery, states,
// the battery of the status, the triggers, the downlink scene action, the
// action, the widget, and the device list kept across a restart.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { deviceIds } from '../src/devices.js';
import { memoryStorage } from '../src/store.js';
import {
  APP_ID,
  BROKER_URL,
  addDiscovered,
  createWorld,
  fixture,
  flush,
  lastState,
  topicOf,
  uplink,
} from './helpers/world.js';

const HOUR = 60 * 60 * 1000;
const DOOR = '70b3d57ed0000001';
const CELLAR = '70b3d57ed0000002';

/** The door sensor heard (real uplink) and added in Gladys. */
async function addedWorld(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
  await tick(t, 0);
  await addDiscovered(world, deviceIds(world.gladys, DOOR).device);
  return world;
}

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

const door = (world, key) => deviceIds(world.gladys, DOOR).feature(key);
const events = (world, key) => world.gladys.fake.sceneEvents.filter((e) => e.key === key);

test('not configured: the integration says so, and connects to nothing', async () => {
  const world = await createWorld({ config: {} });
  try {
    assert.equal(world.broker.clients.length, 0);
    assert.equal(world.gladys.fake.connectionStatus.connected, false);
    assert.match(world.gladys.fake.connectionStatus.message.fr, /broker MQTT/);
  } finally {
    world.app.stop();
  }
});

test('connects with the credentials and subscribes to the ChirpStack events', async () => {
  const world = await createWorld({
    config: {
      broker_url: '192.0.2.10',
      username: 'gladys',
      password: 'secret',
      topic_prefix: 'eu',
    },
  });
  try {
    const { url, options } = world.broker.connections[0];
    assert.equal(url, 'mqtt://192.0.2.10');
    assert.equal(options.username, 'gladys');
    assert.equal(options.password, 'secret');
    world.broker.accept();
    await flush();
    assert.deepEqual(world.broker.client.subscriptions, ['eu/+/device/+/event/+']);
    assert.equal(world.gladys.fake.connectionStatus.connected, true);
  } finally {
    world.app.stop();
  }
});

test('a real uplink makes a discovered device with a feature per decoded value', async () => {
  const world = await createWorld();
  try {
    world.broker.accept();
    world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
    await flush();
    const [device] = world.gladys.fake.discoveredDevices;
    assert.equal(device.name, 'Shed door');
    assert.equal(device.model, 'LHT65-like door sensor');
    assert.equal(device.should_poll, false);
    assert.deepEqual(
      device.features.map((f) => [
        f.external_id.split(':').pop(),
        f.category,
        f.type,
        f.unit,
        f.name,
      ]),
      [
        ['o_batv', 'energy-sensor', 'voltage', 'volt', 'Tension (BatV)'],
        [
          'o_door_open_status',
          'opening-sensor',
          'binary',
          undefined,
          'Ouverture (DOOR_OPEN_STATUS)',
        ],
        ['o_hum_sht', 'humidity-sensor', 'decimal', 'percent', 'Humidité (Hum_SHT)'],
        ['o_sensor_co2', 'co2-sensor', 'integer', 'ppm', 'CO2 (sensor.co2)'],
        ['o_tempc_ds', 'temperature-sensor', 'decimal', 'celsius', 'Température (TempC_DS)'],
        ['o_tempc_sht', 'temperature-sensor', 'decimal', 'celsius', 'Température (TempC_SHT)'],
        ['o_water_leak', 'leak-sensor', 'binary', undefined, 'Fuite (WATER_LEAK)'],
        ['rssi', 'signal', 'integer', undefined, 'Signal RSSI (dBm)'],
        ['snr', 'signal', 'integer', undefined, 'Signal SNR (dB)'],
      ],
    );
    // Work_mode ("Door") is a text: no feature.
    assert.ok(!device.features.some((f) => f.external_id.endsWith('work_mode')));
  } finally {
    world.app.stop();
  }
});

test('once added, the values of each uplink are published, the open door as 0', async (t) => {
  const world = await addedWorld(t);
  // onDeviceCreated republishes what the first uplink said.
  assert.equal(lastState(world, door(world, 'o_tempc_sht')), 21.53);
  assert.equal(lastState(world, door(world, 'o_door_open_status')), 0);
  assert.equal(lastState(world, door(world, 'o_water_leak')), 0);
  assert.equal(lastState(world, door(world, 'o_sensor_co2')), 612);
  assert.equal(lastState(world, door(world, 'rssi')), -97);
  assert.equal(lastState(world, door(world, 'snr')), 8);

  // Door closed, warmer, weaker signal.
  world.broker.send(
    topicOf(DOOR, 'up'),
    uplink(DOOR, { TempC_SHT: 22.1, DOOR_OPEN_STATUS: 0, Hum_SHT: 48.2 }, { rssi: -110, snr: -4 }),
  );
  await flush();
  assert.equal(lastState(world, door(world, 'o_tempc_sht')), 22.1);
  assert.equal(lastState(world, door(world, 'o_door_open_status')), 1);
  assert.equal(lastState(world, door(world, 'rssi')), -110);
  // An unchanged value is not published again.
  const humidity = world.gladys.fake.states.filter(
    (s) => s.device_feature_external_id === door(world, 'o_hum_sht'),
  );
  assert.equal(humidity.length, 1);
});

test('a frame with other keys (config port) adds them to Discovery, never removes any', async (t) => {
  const world = await addedWorld(t);
  world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up-config.json')));
  await tick(t, 0);
  const device = world.gladys.fake.discoveredDevices.find((d) => d.name === 'Shed door');
  const keys = device.features.map((f) => f.external_id.split(':').pop());
  assert.ok(keys.includes('o_version'));
  assert.ok(keys.includes('o_tempc_sht'));
  // Not added in Gladys yet: its state is not sent.
  assert.equal(lastState(world, door(world, 'o_version')), undefined);
});

test('the battery of the LoRaWAN status becomes a feature, published once added', async (t) => {
  const world = await addedWorld(t);
  world.broker.send(topicOf(DOOR, 'status'), JSON.stringify(fixture('status.json')));
  await tick(t, 0);
  const device = world.gladys.fake.discoveredDevices.find((d) => d.name === 'Shed door');
  const battery = device.features.find((f) => f.external_id === door(world, 'status_battery'));
  assert.equal(battery.category, 'battery');
  assert.equal(battery.name, 'Batterie (statut LoRaWAN)');
  await world.gladys.fake.deviceUpdated(device);
  await flush();
  assert.equal(lastState(world, door(world, 'status_battery')), 79);
});

test('key overrides change a kind or hide a key', async () => {
  const world = await createWorld({
    config: {
      broker_url: BROKER_URL,
      key_overrides: 'BatV=ignore, TempC_DS=number',
      language: 'en',
    },
  });
  try {
    world.broker.accept();
    world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
    await flush();
    const [device] = world.gladys.fake.discoveredDevices;
    const byKey = Object.fromEntries(
      device.features.map((f) => [f.external_id.split(':').pop(), f]),
    );
    assert.equal(byKey.o_batv, undefined);
    assert.equal(byKey.o_tempc_ds.category, 'unknown');
    assert.equal(byKey.o_tempc_ds.name, 'Value (TempC_DS)');
  } finally {
    world.app.stop();
  }
});

test('uplink_received fires on every uplink of an added device, even with the same values', async (t) => {
  const world = await addedWorld(t);
  world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
  world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
  await flush();
  const fired = events(world, 'uplink_received');
  assert.equal(fired.length, 2);
  assert.deepEqual(fired[0].data, {
    device: deviceIds(world.gladys, DOOR).device,
    device_name: 'Shed door',
    f_port: 2,
    f_cnt: 2,
    payload_hex: '0bea086901e2079e01000264',
    rssi: -97,
  });
  // A device not added in Gladys fires nothing.
  world.broker.send(topicOf(CELLAR, 'up'), uplink(CELLAR, { temperature: 12 }));
  await flush();
  assert.equal(events(world, 'uplink_received').length, 2);
});

test('device_joined fires on the join of an added device', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.send(topicOf(CELLAR, 'join'), JSON.stringify(fixture('join.json')));
  await tick(t, 0);
  assert.equal(events(world, 'device_joined').length, 0, 'not added yet');
  const device = await addDiscovered(world, deviceIds(world.gladys, CELLAR).device);
  assert.equal(device.name, 'Cellar leak sensor');
  world.broker.send(topicOf(CELLAR, 'join'), JSON.stringify(fixture('join.json')));
  await flush();
  assert.deepEqual(events(world, 'device_joined')[0].data, {
    device: deviceIds(world.gladys, CELLAR).device,
    device_name: 'Cellar leak sensor',
  });
});

test('device_silent fires once past the delay, device_back on the next uplink', async (t) => {
  const world = await addedWorld(t, { config: { broker_url: BROKER_URL, silent_after: '6' } });
  await tick(t, 5 * HOUR);
  assert.equal(events(world, 'device_silent').length, 0);
  await tick(t, HOUR);
  assert.deepEqual(events(world, 'device_silent')[0]?.data, {
    device: deviceIds(world.gladys, DOOR).device,
    device_name: 'Shed door',
    hours: 6,
  });
  await tick(t, 3 * HOUR);
  assert.equal(events(world, 'device_silent').length, 1, 'once per silence');
  world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
  await flush();
  assert.equal(events(world, 'device_back').length, 1);
  assert.equal(events(world, 'device_silent').length, 1);
});

test('a broker outage does not make the sensors silent: the delay restarts at the reconnection', async (t) => {
  const world = await addedWorld(t, { config: { broker_url: BROKER_URL, silent_after: '1' } });
  world.broker.drop();
  await tick(t, 3 * HOUR);
  world.broker.accept();
  await tick(t, 50 * 60 * 1000);
  assert.equal(events(world, 'device_silent').length, 0);
  await tick(t, 10 * 60 * 1000);
  assert.equal(events(world, 'device_silent').length, 1);
});

test('the device list survives a restart: Discovery, silence and downlinks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const storage = memoryStorage();
  const first = await createWorld({ storage });
  first.broker.accept();
  first.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
  await flush();
  await first.app.stop();
  assert.equal(storage.data.devices[DOOR].keys.TempC_SHT, 'temperature');

  const added = first.gladys.fake.discoveredDevices[0];
  const second = await createWorld({ storage, devices: [added] });
  t.after(() => second.app.stop());
  second.broker.accept();
  await second.hub.publishDiscovery({ force: true });
  assert.equal(second.gladys.fake.discoveredDevices[0].features.length, added.features.length);
  // The application is known: a downlink can go before any new uplink.
  const result = await second.hub.sendDownlink({
    device: added.external_id,
    f_port: 10,
    payload: '01',
  });
  assert.equal(result.sent, true);
  assert.equal(
    second.broker.published[0].topic,
    `application/${APP_ID}/device/${DOOR}/command/down`,
  );
});

test('send_downlink queues the payload on the command topic, and explains a refusal', async (t) => {
  const world = await addedWorld(t);
  const device = deviceIds(world.gladys, DOOR).device;
  const result = await world.gladys.fake.sceneAction('send_downlink', {
    device,
    f_port: 10,
    payload: '01 00 FF',
    confirmed: true,
  });
  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(result.data.outputs, {
    summary: 'Message descendant mis en file pour Shed door : 3 octet(s) sur le fPort 10.',
    sent: true,
  });
  const [published] = world.broker.published;
  assert.equal(published.topic, `application/${APP_ID}/device/${DOOR}/command/down`);
  assert.deepEqual(JSON.parse(published.payload), {
    devEui: DOOR,
    confirmed: true,
    fPort: 10,
    data: 'AQD/',
  });
  assert.equal(published.opts.qos, 1);

  const refused = async (fields) =>
    world.gladys.fake.sceneAction('send_downlink', { device, f_port: 1, payload: '01', ...fields });
  assert.match((await refused({ f_port: 0 })).error, /fPort/);
  assert.match((await refused({ payload: 'xyz' })).error, /hexadécimal/);
  assert.match(
    (await refused({ device: 'ext:other:1' })).error,
    /n'est pas un appareil ChirpStack/,
  );
  world.broker.drop();
  await flush();
  assert.match((await refused({})).error, /pas connecté/);
  assert.equal(world.broker.published.length, 1);
});

test('check_connection tells the broker state and the devices heard', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld({ config: { broker_url: BROKER_URL, language: 'en' } });
  t.after(() => world.app.stop());
  const run = async () => (await world.gladys.fake.action('check_connection')).data.message;
  assert.match(await run(), /Connecting/);
  world.broker.accept();
  await flush();
  assert.match(await run(), /No ChirpStack uplink yet/);
  world.broker.send(topicOf(DOOR, 'up'), Buffer.from([0x0a, 0x10, 0x01]));
  await flush();
  assert.match(await run(), /json=true/);
  world.broker.send(topicOf(DOOR, 'up'), JSON.stringify(fixture('up.json')));
  await flush();
  assert.equal(
    await run(),
    'Connected to mqtt://broker.example:1883. 1 LoRaWAN device(s) heard, 0 added to Gladys.',
  );
});

test('the widget lists the added sensors, silent first, with valid content', async (t) => {
  const world = await addedWorld(t, { config: { broker_url: BROKER_URL, silent_after: '1' } });
  world.broker.send(
    topicOf(CELLAR, 'up'),
    uplink(CELLAR, { temperature: 12 }, { name: 'Cellar', rssi: -80 }),
  );
  await tick(t, 0);
  await addDiscovered(world, deviceIds(world.gladys, CELLAR).device);
  await tick(t, 30 * 60 * 1000);
  world.broker.send(
    topicOf(CELLAR, 'up'),
    uplink(CELLAR, { temperature: 12 }, { name: 'Cellar', rssi: -80 }),
  );
  await tick(t, 35 * 60 * 1000);

  const get = async (settings = {}, language = 'en') =>
    (await world.gladys.fake.widgetGet('devices', { settings, language })).data.content;
  const content = await get();
  validateWidgetContent(content);
  assert.deepEqual(
    content.components[0].items.map((item) => [item.label, item.value, item.color]),
    [
      ['Shed door', 'Silent (1 h ago)', 'danger'],
      ['Cellar', '35 min ago · -80 dBm', 'success'],
    ],
  );
  const french = await get({ show_signal: false }, 'fr');
  assert.equal(french.components[0].items[1].value, 'il y a 35 min');
  const onlySilent = await get({ only_silent: true });
  assert.equal(onlySilent.components[0].items.length, 1);
});

test('the widget explains what is missing', async () => {
  const empty = await createWorld({ config: {} });
  const world = await createWorld();
  try {
    const text = async (w) =>
      (await w.gladys.fake.widgetGet('devices', { language: 'en' })).data.content.components[0]
        .text;
    assert.match(await text(empty), /address of the MQTT broker/);
    assert.match(await text(world), /Add the LoRaWAN sensors/);
  } finally {
    empty.app.stop();
    world.app.stop();
  }
});
