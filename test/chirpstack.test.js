// -----------------------------------------------------------------------------
// The ChirpStack topics and payloads, on events captured from a real
// ChirpStack v4 (chirpstack-docker, a simulated gateway, an ABP and an OTAA
// device): test/fixtures/chirpstack/.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToHex,
  bestReception,
  buildDownlink,
  downlinkTopic,
  parseMessage,
  subscriptions,
} from '../src/chirpstack.js';
import { APP_ID, fixture, topicOf } from './helpers/world.js';

const DEV_EUI = '70b3d57ed0000001';

test('subscribes to every device event of every application', () => {
  assert.deepEqual(subscriptions('application'), ['application/+/device/+/event/+']);
});

test('reads a real v4 uplink: device, fPort, raw payload, decoded object, best reception', () => {
  const event = parseMessage(
    'application',
    topicOf(DEV_EUI, 'up'),
    JSON.stringify(fixture('up.json')),
  );
  assert.equal(event.event, 'up');
  assert.deepEqual(event.device, {
    devEui: DEV_EUI,
    applicationId: APP_ID,
    applicationName: 'Garden',
    name: 'Shed door',
    profile: 'LHT65-like door sensor',
    tags: { room: 'shed' },
  });
  assert.equal(event.fPort, 2);
  assert.equal(event.fCnt, 2);
  assert.equal(event.dataHex, '0bea086901e2079e01000264');
  assert.equal(event.object.TempC_SHT, 21.53);
  assert.deepEqual(event.reception, { rssi: -97, snr: 7.5 });
});

test('reads a real status event: the battery level, unless unavailable or mains powered', () => {
  const status = fixture('status.json');
  const read = (body) =>
    parseMessage('application', topicOf(DEV_EUI, 'status'), JSON.stringify(body));
  assert.equal(read(status).battery, 78.74016);
  assert.equal(read({ ...status, batteryLevelUnavailable: true }).battery, null);
  assert.equal(read({ ...status, externalPowerSource: true, batteryLevel: 0 }).battery, null);
});

test('reads a real join event', () => {
  const event = parseMessage(
    'application',
    topicOf('70b3d57ed0000002', 'join'),
    JSON.stringify(fixture('join.json')),
  );
  assert.equal(event.event, 'join');
  assert.equal(event.device.name, 'Cellar leak sensor');
});

test('reads the v3 Application Server format too', () => {
  const v3 = {
    applicationID: '1',
    applicationName: 'garden',
    deviceName: 'old-sensor',
    devEUI: 'cLPVftAAAAM=',
    rxInfo: [
      { rssi: -110, loRaSNR: -3.5 },
      { rssi: -88, loRaSNR: 6 },
    ],
    fCnt: 7,
    fPort: 1,
    data: 'AQI=',
    object: { temperature: 12.5 },
  };
  const event = parseMessage(
    'application',
    'application/1/device/70b3d57ed0000003/event/up',
    JSON.stringify(v3),
  );
  assert.equal(event.device.name, 'old-sensor');
  assert.equal(event.device.applicationId, '1');
  assert.deepEqual(event.reception, { rssi: -88, snr: 6 });
  assert.equal(event.dataHex, '0102');
});

test('ignores the other topics and events, flags payloads that are not JSON', () => {
  const up = JSON.stringify(fixture('up.json'));
  assert.equal(parseMessage('application', topicOf(DEV_EUI, 'txack'), up), null);
  assert.equal(parseMessage('application', topicOf(DEV_EUI, 'log'), up), null);
  assert.equal(parseMessage('application', `application/${APP_ID}/device/zz/event/up`, up), null);
  assert.equal(parseMessage('other', topicOf(DEV_EUI, 'up'), up), null);
  assert.equal(parseMessage('application', `${topicOf(DEV_EUI, 'up')}/x`, up), null);
  // The protobuf marshaler.
  assert.deepEqual(
    parseMessage('application', topicOf(DEV_EUI, 'up'), Buffer.from([0x0a, 0x24, 0xff])),
    {
      event: 'invalid',
      topic: topicOf(DEV_EUI, 'up'),
    },
  );
  // The DevEUI of the topic is read in lowercase.
  assert.equal(
    parseMessage('application', topicOf(DEV_EUI.toUpperCase(), 'up'), up).device.devEui,
    DEV_EUI,
  );
});

test('the best reception is the strongest gateway, absent without rxInfo', () => {
  assert.equal(bestReception(undefined), null);
  assert.deepEqual(bestReception([{ rssi: -120, snr: -10 }, { rssi: -80 }]), {
    rssi: -80,
    snr: null,
  });
  assert.equal(base64ToHex(''), '');
});

test('builds a downlink as ChirpStack reads it, and refuses a bad fPort or payload', () => {
  assert.equal(
    downlinkTopic('application', APP_ID, DEV_EUI),
    `application/${APP_ID}/device/${DEV_EUI}/command/down`,
  );
  assert.deepEqual(buildDownlink({ devEui: DEV_EUI, fPort: '10', payload: '01 00 ff' }), {
    devEui: DEV_EUI,
    confirmed: false,
    fPort: 10,
    data: 'AQD/',
  });
  assert.equal(
    buildDownlink({ devEui: DEV_EUI, fPort: 1, payload: '0x0A', confirmed: true }).confirmed,
    true,
  );
  for (const fPort of [0, 224, 1.5, 'x', undefined]) {
    assert.throws(() => buildDownlink({ devEui: DEV_EUI, fPort, payload: '01' }), {
      code: 'f_port',
    });
  }
  for (const payload of ['', '0', 'zz', '01'.repeat(243), undefined]) {
    assert.throws(() => buildDownlink({ devEui: DEV_EUI, fPort: 1, payload }), { code: 'payload' });
  }
});
