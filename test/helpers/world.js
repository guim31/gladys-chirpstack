// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MQTT broker the test
// publishes ChirpStack events on, a memory storage for the device list, and
// the integration wired on top through registerHandlers — the same wiring as
// index.js.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { memoryStorage } from '../../src/store.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const BROKER_URL = 'mqtt://broker.example:1883';
export const CLIENT_ID = 'gladys-chirpstack-0a1b2c3d';
export const APP_ID = '7b2d5233-1a42-433e-9455-5ea9bb6becde';

/** A ChirpStack event captured from a real ChirpStack v4 (test/fixtures/chirpstack/). */
export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/chirpstack/${name}`, import.meta.url), 'utf8'));

export const topicOf = (devEui, event, appId = APP_ID) =>
  `application/${appId}/device/${devEui}/event/${event}`;

/**
 * An uplink in the exact v4 format (the captured one, with another device,
 * object and reception).
 */
export function uplink(devEui, object, { name, rssi = -97, snr = 7.5, fPort = 2, fCnt = 10 } = {}) {
  const event = fixture('up.json');
  event.deviceInfo.devEui = devEui;
  event.deviceInfo.deviceName = name ?? `sensor-${devEui.slice(-4)}`;
  event.deviceInfo.applicationId = APP_ID;
  event.fPort = fPort;
  event.fCnt = fCnt;
  if (object === undefined) {
    delete event.object;
  } else {
    event.object = object;
  }
  event.rxInfo = event.rxInfo.map((rx) => ({ ...rx, rssi, snr }));
  return JSON.stringify(event);
}

/** A fake broker: mqtt.connect() returning a client the test drives. */
export function createFakeBroker() {
  const broker = {
    clients: [],
    connections: [],
    published: [],
    grantedQos: 0,
    publishError: null,
    get client() {
      return broker.clients[broker.clients.length - 1];
    },
    connect(url, options) {
      const client = new EventEmitter();
      client.subscriptions = [];
      client.ended = false;
      client.subscribe = (topics, opts, callback) => {
        const list = [].concat(topics);
        client.subscriptions.push(...list);
        callback?.(
          null,
          list.map((topic) => ({ topic, qos: broker.grantedQos })),
        );
      };
      client.publish = (topic, payload, opts, callback) => {
        broker.published.push({ topic, payload: String(payload), opts });
        callback?.(broker.publishError);
      };
      client.end = () => {
        client.ended = true;
      };
      broker.clients.push(client);
      broker.connections.push({ url, options });
      return client;
    },
    accept() {
      broker.client.emit('connect');
    },
    send(topic, payload) {
      broker.client.emit('message', topic, Buffer.from(String(payload)));
    },
    drop() {
      broker.client.emit('close');
      broker.client.emit('offline');
    },
  };
  return broker;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {object} [options.storage] the device list storage
 * @param {object} [options.timings]
 */
export async function createWorld({
  config = { broker_url: BROKER_URL },
  devices = [],
  storage = memoryStorage(),
  timings,
} = {}) {
  const broker = createFakeBroker();
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    connectMqtt: broker.connect,
    loadClientId: async () => ({ clientId: CLIENT_ID, persisted: true }),
    storage,
    timings: { discoveryDelayMs: 0, ...timings },
  });
  await gladys.connect();
  await flush();
  return { gladys, broker, app, hub: app.hub, storage };
}

/** Let the pending promise callbacks and zero-delay timers run. */
export const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** Add the discovered device with that external id, as the user would. */
export async function addDiscovered(world, externalId) {
  const device = world.gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  if (!device) {
    throw new Error(`${externalId} was not discovered`);
  }
  await world.gladys.fake.deviceCreated(device);
  await flush();
  return device;
}

/** The last published state of a feature. */
export function lastState(world, featureExternalId) {
  const states = world.gladys.fake.states.filter(
    (s) => s.device_feature_external_id === featureExternalId,
  );
  const last = states[states.length - 1];
  return last === undefined ? undefined : (last.text ?? last.state);
}
