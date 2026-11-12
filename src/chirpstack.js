// -----------------------------------------------------------------------------
// The MQTT integration of ChirpStack: topics and payloads. Pure module.
//
// ChirpStack v4 publishes every device event on
//   application/<application id>/device/<dev eui>/event/<event>
// (`event_topic` of chirpstack.toml; the first level is the `topic_prefix`
// setting), JSON by default (protobuf when `json=false`: not read). The events
// read here:
//   up      an uplink: deviceInfo, fPort, fCnt, data (base64), object (the
//           decoded payload, from the codec of the device profile), rxInfo[]
//           (rssi, snr per gateway);
//   status  the answer to a DevStatusReq: margin, batteryLevel (%),
//           batteryLevelUnavailable, externalPowerSource;
//   join    an OTAA join: deviceInfo, devAddr.
// ack, txack, log and location are ignored. The v3 Application Server format
// (applicationID, deviceName, devEUI in base64, rxInfo[].loRaSNR) is read too:
// the topic carries the hex DevEUI in both.
//
// A downlink is queued by publishing on
//   application/<application id>/device/<dev eui>/command/down
// { devEui, confirmed, fPort, data (base64) }.
// -----------------------------------------------------------------------------

export const EVENTS = ['up', 'status', 'join'];

const DEV_EUI = /^[0-9a-f]{16}$/;

/** The topics to subscribe to. */
export const subscriptions = (prefix) => [`${prefix}/+/device/+/event/+`];

/** The downlink topic of a device. */
export const downlinkTopic = (prefix, applicationId, devEui) =>
  `${prefix}/${applicationId}/device/${devEui}/command/down`;

const str = (value) => (typeof value === 'string' ? value : '');
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** base64 -> hex, '' when absent. */
export function base64ToHex(value) {
  if (typeof value !== 'string' || value === '') {
    return '';
  }
  return Buffer.from(value, 'base64').toString('hex');
}

/** The best gateway reception of an uplink: the strongest RSSI, with its SNR. */
export function bestReception(rxInfo) {
  let best = null;
  for (const rx of Array.isArray(rxInfo) ? rxInfo : []) {
    const rssi = num(rx?.rssi);
    if (rssi === null) {
      continue;
    }
    const snr = num(rx.snr) ?? num(rx.loRaSNR);
    if (!best || rssi > best.rssi) {
      best = { rssi, snr };
    }
  }
  return best;
}

/** What a payload says about its device (v4 deviceInfo, or the v3 fields). */
function deviceOf(body, devEui, applicationId) {
  const info = body.deviceInfo && typeof body.deviceInfo === 'object' ? body.deviceInfo : {};
  const tags = info.tags && typeof info.tags === 'object' ? info.tags : body.tags;
  return {
    devEui,
    applicationId,
    applicationName: str(info.applicationName) || str(body.applicationName),
    name: str(info.deviceName) || str(body.deviceName),
    profile: str(info.deviceProfileName) || str(body.deviceProfileName),
    tags: tags && typeof tags === 'object' ? tags : {},
  };
}

/**
 * One MQTT message -> a ChirpStack event, or null when it is not one this
 * integration reads.
 * @param {string} prefix
 * @param {string} topic
 * @param {Buffer|string} payload
 * @returns {null | { event: string, device: object, ... } | { event: 'invalid', topic: string }}
 */
export function parseMessage(prefix, topic, payload) {
  const parts = topic.split('/');
  if (
    parts.length !== 6 ||
    parts[0] !== prefix ||
    parts[2] !== 'device' ||
    parts[4] !== 'event' ||
    !EVENTS.includes(parts[5])
  ) {
    return null;
  }
  const devEui = parts[3].toLowerCase();
  const applicationId = parts[1];
  if (!DEV_EUI.test(devEui) || applicationId === '') {
    return null;
  }
  let body;
  try {
    body = JSON.parse(String(payload));
  } catch {
    // Most likely the protobuf marshaler.
    return { event: 'invalid', topic };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { event: 'invalid', topic };
  }
  const device = deviceOf(body, devEui, applicationId);
  switch (parts[5]) {
    case 'up':
      return {
        event: 'up',
        device,
        fPort: num(body.fPort) ?? 0,
        fCnt: num(body.fCnt) ?? 0,
        dataHex: base64ToHex(body.data),
        object: body.object && typeof body.object === 'object' ? body.object : null,
        reception: bestReception(body.rxInfo),
      };
    case 'status': {
      const unavailable =
        body.batteryLevelUnavailable === true || body.externalPowerSource === true;
      const level = num(body.batteryLevel);
      return {
        event: 'status',
        device,
        battery: unavailable || level === null ? null : Math.max(0, Math.min(100, level)),
        externalPower: body.externalPowerSource === true,
      };
    }
    default:
      return { event: 'join', device };
  }
}

export const F_PORT_MIN = 1;
export const F_PORT_MAX = 223;
export const MAX_DOWNLINK_BYTES = 242;

/**
 * Checks and builds a downlink. Throws an Error whose `code` names the problem
 * (`f_port`, `payload`), for a message in the user's language.
 * @param {{ devEui: string, fPort: unknown, payload: unknown, confirmed?: boolean }} input
 */
export function buildDownlink({ devEui, fPort, payload, confirmed = false }) {
  const port = Number(fPort);
  if (!Number.isInteger(port) || port < F_PORT_MIN || port > F_PORT_MAX) {
    throw Object.assign(new Error(`invalid fPort ${fPort}`), { code: 'f_port' });
  }
  const hex = String(payload ?? '')
    .replace(/^0x/i, '')
    .replace(/[\s:-]/g, '');
  if (!/^([0-9a-f]{2})+$/i.test(hex) || hex.length / 2 > MAX_DOWNLINK_BYTES) {
    throw Object.assign(new Error('invalid payload'), { code: 'payload' });
  }
  return {
    devEui,
    confirmed: confirmed === true || confirmed === 'true',
    fPort: port,
    data: Buffer.from(hex, 'hex').toString('base64'),
  };
}
