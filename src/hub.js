// -----------------------------------------------------------------------------
// The hub: the MQTT client, the devices heard and everything Gladys sees from
// them — discovered devices, states, scene events, connection status.
//
// Each uplink updates its device (new codec keys, names) and publishes the
// states that changed (publishChangedStates, with a heartbeat so a steady value
// never looks stale). Every minute the devices added in Gladys are checked for
// silence; the delay counts from the last uplink, or from the broker connection
// when that is later, so an outage of the broker or of the integration never
// makes every sensor look silent.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDownlink, downlinkTopic, parseMessage, subscriptions } from './chirpstack.js';
import { isConfigured, safeUrl } from './config.js';
import { MAX_FEATURES, buildDevice, devEuiOf, deviceIds, measures } from './devices.js';
import { createIssueLog } from './issues.js';
import { flatten, guessKind, toState } from './mapping.js';
import { createClient } from './mqtt.js';
import { DeviceStore, fileStorage } from './store.js';
import { CHECK_TEXT, DOWNLINK_TEXT, MESSAGES, pick } from './texts.js';

const logger = createLogger({ name: 'chirpstack-hub' });

export const WIDGET_KEY = 'devices';
export const TRIGGER = {
  UPLINK_RECEIVED: 'uplink_received',
  DEVICE_SILENT: 'device_silent',
  DEVICE_BACK: 'device_back',
  DEVICE_JOINED: 'device_joined',
};

export const HOUR_MS = 60 * 60_000;
export const DEFAULT_TIMINGS = {
  // A discovery list that changed is sent again after this quiet time.
  discoveryDelayMs: 5_000,
  silenceCheckMs: 60_000,
  // A steady state is published again after that long (the front says "no
  // recent value" past 48 h).
  heartbeatMs: 12 * HOUR_MS,
};
export const MAX_DISCOVERED = 200;
// Keys a codec may grow before new ones are no longer recorded.
const MAX_KEYS = MAX_FEATURES * 2;

/** An error whose message is already for the user. */
const userError = (message) => Object.assign(new Error(message), { userFacing: true });

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {() => number} [options.now]
   * @param {Function} [options.connectMqtt] test seam: mqtt.connect
   * @param {() => Promise<{ clientId: string }>} options.loadClientId
   * @param {{ load: Function, save: Function }} [options.storage]
   * @param {object} [options.timings]
   */
  constructor({
    gladys,
    now = () => Date.now(),
    connectMqtt,
    loadClientId,
    storage = fileStorage(),
    timings = {},
  }) {
    this.gladys = gladys;
    this.now = now;
    this.connectMqtt = connectMqtt;
    this.loadClientId = loadClientId;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.store = new DeviceStore(storage, logger);
    this.loaded = null;
    this.config = null;
    this.client = null;
    this.connectedAt = null;
    this.invalidMessages = 0;
    /** @type {Map<string, Map<string, number>>} DevEUI -> feature key -> last state */
    this.values = new Map();
    this.discoveryKey = '';
    this.discoveryTimer = null;
    this.silenceTimer = null;
    this.generation = 0;
  }

  // --- lifecycle --------------------------------------------------------------

  async configure(config) {
    // Any newer configuration, even an empty one, cancels a connection still
    // waiting for its client id.
    const generation = ++this.generation;
    this.loaded ??= this.store.load();
    await this.loaded;
    if (generation !== this.generation) {
      return;
    }
    const previous = this.config;
    this.config = config;
    const sameLink =
      previous &&
      previous.broker_url === config.broker_url &&
      previous.username === config.username &&
      previous.password === config.password &&
      previous.tls_insecure === config.tls_insecure &&
      previous.topic_prefix === config.topic_prefix;
    if (sameLink && this.client) {
      // Only the key overrides, the silence delay or the language changed.
      this.discoveryKey = '';
      this.scheduleDiscovery();
      return;
    }
    this.#stopClient();
    this.invalidMessages = 0;
    if (!isConfigured(config)) {
      await this.#status(false, MESSAGES.notConfigured);
      return;
    }
    const { clientId } = await this.loadClientId();
    if (generation !== this.generation) {
      return;
    }
    logger.info(`Connecting to the MQTT broker ${safeUrl(config.broker_url)}`);
    this.client = createClient({
      url: config.broker_url,
      username: config.username,
      password: config.password,
      clientId,
      tlsInsecure: config.tls_insecure,
      topics: subscriptions(config.topic_prefix),
      onMessage: (topic, payload) => {
        this.onMessage(topic, payload).catch((err) =>
          logger.error(`Message not handled: ${err.message}`),
        );
      },
      onState: (state, detail) => this.onLinkState(state, detail),
      ...(this.connectMqtt ? { connect: this.connectMqtt } : {}),
    });
    clearInterval(this.silenceTimer);
    this.silenceTimer = setInterval(() => {
      this.checkSilence().catch((err) => logger.error(`Silence check failed: ${err.message}`));
    }, this.timings.silenceCheckMs);
    this.silenceTimer.unref?.();
  }

  /** @returns {Promise<void>} once the device list is saved */
  stop() {
    this.generation += 1;
    this.#stopClient();
    clearTimeout(this.discoveryTimer);
    this.discoveryTimer = null;
    return this.store.flush().catch(() => {});
  }

  #stopClient() {
    this.client?.stop();
    this.client = null;
    this.connectedAt = null;
    clearInterval(this.silenceTimer);
    this.silenceTimer = null;
  }

  async #status(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  async onLinkState(state, detail) {
    const url = safeUrl(this.config.broker_url);
    if (state === 'connected') {
      this.connectedAt = this.now();
      logger.info(`Connected to the MQTT broker ${url}`);
      await this.#status(true);
      return;
    }
    this.connectedAt = null;
    logger.warn(`MQTT broker ${url}: ${state} (${detail ?? 'no detail'})`);
    await this.#status(false, state === 'refused' ? MESSAGES.refused : MESSAGES.unreachable);
  }

  // --- messages ---------------------------------------------------------------

  async onMessage(topic, payload) {
    const message = parseMessage(this.config.topic_prefix, topic, payload);
    if (!message) {
      return;
    }
    if (message.event === 'invalid') {
      this.invalidMessages += 1;
      this.issues.fail(
        'format',
        'ChirpStack sends events that are not JSON: set json=true in [integration.mqtt] of chirpstack.toml',
      );
      return;
    }
    this.issues.ok('format', 'ChirpStack events are JSON again');
    const record = this.store.ensure(message.device.devEui);
    if (!record) {
      this.issues.fail('cap', 'Too many LoRaWAN devices: the new ones are ignored');
      return;
    }
    let changed = this.#identify(record, message.device);
    const added = this.#added(record.devEui);
    if (message.event === 'up') {
      changed = this.#learnKeys(record, message.object) || changed;
      await this.#onUplink(record, message, added);
    } else if (message.event === 'status') {
      if (message.battery !== null) {
        changed = changed || !record.battery;
        record.battery = true;
        this.#values(record.devEui).set('status_battery', Math.round(message.battery));
        await this.#publish(record.devEui, ['status_battery']);
      }
    } else if (added) {
      logger.info(`${added.name || record.devEui} joined the LoRaWAN network`);
      await this.#fire(TRIGGER.DEVICE_JOINED, {
        device: added.external_id,
        device_name: added.name ?? '',
      });
    }
    this.store.touch();
    if (changed) {
      this.scheduleDiscovery();
    }
  }

  /** Names and application from the payload; true when the device changed. */
  #identify(record, device) {
    let changed = false;
    for (const field of ['applicationId', 'applicationName', 'name', 'profile']) {
      if (device[field] && device[field] !== record[field]) {
        record[field] = device[field];
        changed = true;
      }
    }
    return changed;
  }

  /** New codec keys, with their guessed kind; true when one was added. */
  #learnKeys(record, object) {
    let changed = false;
    for (const [path, value] of flatten(object)) {
      if (path in record.keys || Object.keys(record.keys).length >= MAX_KEYS) {
        continue;
      }
      const kind = guessKind(path, value);
      if (kind) {
        record.keys[path] = kind;
        changed = true;
      }
    }
    return changed;
  }

  async #onUplink(record, message, added) {
    record.lastUplinkAt = this.now();
    const values = this.#values(record.devEui);
    const leaves = new Map(flatten(message.object));
    const keys = [];
    for (const { key, path, kind } of measures(record, this.config.key_overrides)) {
      const state = leaves.has(path) ? toState(kind, leaves.get(path)) : null;
      if (state !== null) {
        values.set(key, state);
        keys.push(key);
      }
    }
    if (message.reception) {
      values.set('rssi', Math.round(message.reception.rssi));
      keys.push('rssi');
      if (message.reception.snr !== null) {
        values.set('snr', Math.round(message.reception.snr));
        keys.push('snr');
      }
    }
    logger.debug(`Uplink from ${record.devEui}: fPort ${message.fPort}, ${keys.length} value(s)`);
    await this.#publish(record.devEui, keys);
    if (!added) {
      return;
    }
    const name = added.name ?? '';
    if (record.silentSince !== null) {
      record.silentSince = null;
      logger.info(`${name || record.devEui} sends again`);
      await this.#fire(TRIGGER.DEVICE_BACK, { device: added.external_id, device_name: name });
    }
    await this.#fire(TRIGGER.UPLINK_RECEIVED, {
      device: added.external_id,
      device_name: name,
      f_port: message.fPort,
      f_cnt: message.fCnt,
      payload_hex: message.dataHex,
      rssi: message.reception?.rssi ?? null,
    });
    this.requestWidgetRefresh();
  }

  #values(devEui) {
    let values = this.values.get(devEui);
    if (!values) {
      values = new Map();
      this.values.set(devEui, values);
    }
    return values;
  }

  // --- Gladys devices ---------------------------------------------------------

  /** The ChirpStack devices added in Gladys: [{ devEui, device }]. */
  addedDevices() {
    const list = [];
    for (const device of this.gladys.devices ?? []) {
      const devEui = devEuiOf(this.gladys, device.external_id);
      if (devEui !== null) {
        list.push({ devEui, device });
      }
    }
    return list;
  }

  #added(devEui) {
    return this.addedDevices().find((entry) => entry.devEui === devEui)?.device ?? null;
  }

  discoveredDevices() {
    const options = {
      language: this.config?.language ?? 'fr',
      overrides: this.config?.key_overrides,
    };
    return [...this.store.devices.values()]
      .sort((a, b) => (b.lastUplinkAt ?? 0) - (a.lastUplinkAt ?? 0))
      .slice(0, MAX_DISCOVERED)
      .sort((a, b) => a.devEui.localeCompare(b.devEui))
      .map((record) => buildDevice(this.gladys, record, options));
  }

  scheduleDiscovery() {
    if (this.discoveryTimer) {
      return;
    }
    if (this.timings.discoveryDelayMs === 0) {
      this.publishDiscovery().catch(() => {});
      return;
    }
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.publishDiscovery().catch(() => {});
    }, this.timings.discoveryDelayMs);
    this.discoveryTimer.unref?.();
  }

  /** The discovered devices; only sent again when the list changed (or forced). */
  async publishDiscovery({ force = false } = {}) {
    if (!this.config) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discoveryKey) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveryKey = key;
      this.issues.ok('discovery', 'Gladys accepts the discovered devices again');
    } catch (err) {
      this.issues.fail('discovery', `Publishing the discovered devices failed: ${err.message}`);
    }
  }

  // --- states and events --------------------------------------------------------

  /** Publish these features of a device (all of them when `keys` is omitted). */
  async #publish(devEui, keys) {
    const values = this.values.get(devEui);
    const device = this.#added(devEui);
    if (!values || !device) {
      return;
    }
    // Features not added in Gladys (a key the codec sent after the device was
    // added…) are filtered out: the core would only drop them.
    const known = new Set((device.features ?? []).map((feature) => feature.external_id));
    const ids = deviceIds(this.gladys, devEui);
    const states = (keys ?? [...values.keys()])
      .map((key) => ({ device_feature_external_id: ids.feature(key), state: values.get(key) }))
      .filter((state) => known.has(state.device_feature_external_id));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed: ${err.message}`);
    }
  }

  async #fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.issues.ok('scene', 'Gladys accepts the scene events again');
    } catch (err) {
      this.issues.fail('scene', `Firing the scene event failed: ${err.message}`);
    }
  }

  /** Everything again: a device was just added or updated in Gladys. */
  async republish() {
    this.gladys.forgetPublishedStates?.();
    for (const devEui of this.values.keys()) {
      await this.#publish(devEui);
    }
  }

  /** Fire device_silent once for each added device silent past the delay. */
  async checkSilence() {
    if (!this.config || this.connectedAt === null || this.client?.state !== 'connected') {
      return;
    }
    const now = this.now();
    const delay = this.config.silent_after * HOUR_MS;
    let fired = false;
    for (const { devEui, device } of this.addedDevices()) {
      const record = this.store.ensure(devEui);
      if (!record || record.silentSince !== null) {
        continue;
      }
      const since = Math.max(record.lastUplinkAt ?? 0, this.connectedAt);
      if (now - since < delay) {
        continue;
      }
      record.silentSince = now;
      fired = true;
      const hours =
        record.lastUplinkAt === null ? null : Math.floor((now - record.lastUplinkAt) / HOUR_MS);
      logger.info(`${device.name || devEui} has sent nothing for ${hours ?? '?'} h`);
      await this.#fire(TRIGGER.DEVICE_SILENT, {
        device: device.external_id,
        device_name: device.name ?? '',
        hours,
      });
    }
    if (fired) {
      this.store.touch();
      this.requestWidgetRefresh();
    }
  }

  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch {
      // Fire-and-forget: a refresh lost while disconnected is caught up by the TTL.
    }
  }

  // --- the scene action, the configuration action and the widget ---------------

  /**
   * Queue a downlink through the MQTT integration of ChirpStack.
   * @param {{ device?: string, f_port?: unknown, payload?: unknown, confirmed?: unknown }} fields
   */
  async sendDownlink({ device: externalId, f_port: fPort, payload, confirmed }) {
    const text = pick(DOWNLINK_TEXT, this.config?.language ?? 'fr');
    const devEui = devEuiOf(this.gladys, externalId);
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    if (devEui === null || !device) {
      throw userError(text.unknownDevice);
    }
    const record = this.store.get(devEui);
    if (!record?.applicationId) {
      throw userError(text.notHeard);
    }
    let downlink;
    try {
      downlink = buildDownlink({ devEui, fPort, payload, confirmed });
    } catch (err) {
      throw userError(err.code === 'f_port' ? text.fPort : text.payload);
    }
    if (this.client?.state !== 'connected') {
      throw userError(text.offline);
    }
    const name = device.name || devEui;
    try {
      await this.client.publish(
        downlinkTopic(this.config.topic_prefix, record.applicationId, devEui),
        JSON.stringify(downlink),
      );
    } catch (err) {
      logger.warn(`Downlink to ${devEui} not accepted by the broker (${err.message})`);
      throw userError(text.failed);
    }
    const bytes = Buffer.from(downlink.data, 'base64').length;
    logger.info(`Downlink queued for ${devEui}: ${bytes} byte(s) on fPort ${downlink.fPort}`);
    return { summary: text.sent(name, downlink.fPort, bytes), sent: true };
  }

  checkConnection() {
    const text = pick(CHECK_TEXT, this.config?.language);
    if (!isConfigured(this.config)) {
      return text.notConfigured;
    }
    const url = safeUrl(this.config.broker_url);
    const state = this.client?.state ?? null;
    if (state === 'refused') {
      return text.refused;
    }
    if (state === 'unreachable') {
      return text.unreachable;
    }
    if (state !== 'connected') {
      return text.connecting;
    }
    if (this.store.devices.size === 0) {
      return this.invalidMessages > 0 ? text.protobuf : text.nothing(url);
    }
    return text.ok(url, this.store.devices.size, this.addedDevices().length);
  }

  /** What the widget shows of a device. */
  deviceStatus(devEui) {
    const record = this.store.get(devEui);
    return {
      lastUplinkAt: record?.lastUplinkAt ?? null,
      silent: record?.silentSince !== null && record?.silentSince !== undefined,
      rssi: this.values.get(devEui)?.get('rssi') ?? null,
    };
  }
}
