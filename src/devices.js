// -----------------------------------------------------------------------------
// ChirpStack devices -> Gladys devices.
//
// One Gladys device per LoRaWAN device, keyed by its DevEUI (16 hex digits,
// lowercase): stable for the life of the sensor. Its features:
//   o_<key>          one per numeric or boolean leaf of the decoded object,
//                    `<key>` being the slug of the codec key (`TempC_SHT` ->
//                    `o_tempc_sht`); category from src/mapping.js;
//   rssi, snr        the best gateway reception of the last uplink;
//   status_battery   the battery level of the LoRaWAN status (DevStatusAns),
//                    once the device has reported one.
// Read-only, pushed, never polled. Feature keys are forever: never renamed.
// -----------------------------------------------------------------------------

import { KINDS, kindOf, slug } from './mapping.js';
import { KIND_LABELS, LINK_NAMES, pick } from './texts.js';

export const DEVICE_TYPE = 'device';
export const OBJECT_PREFIX = 'o_';
export const MAX_FEATURES = 50;
const MAX_NAME = 60;

export const deviceIds = (gladys, devEui) => gladys.externalIds(DEVICE_TYPE, devEui);

/** The DevEUI of a device external id, or null. */
export function devEuiOf(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  return /^[0-9a-f]{16}$/.test(rest) ? rest : null;
}

/** The feature key of a codec key. */
export const objectKey = (path) => `${OBJECT_PREFIX}${slug(path)}`;

/** The feature key of a feature external id (`...:o_temperature` -> `o_temperature`). */
export const featureKeyOf = (externalId) => externalId.slice(externalId.lastIndexOf(':') + 1);

const clip = (text) => (text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1)}…` : text);

/**
 * The measured features of a record: [{ key, path, kind }], in a stable order,
 * without ignored keys nor two paths of the same slug.
 * @param {{ keys: Record<string, string> }} record
 * @param {Record<string, string>} overrides
 */
export function measures(record, overrides = {}) {
  const list = [];
  const seen = new Set();
  const paths = Object.keys(record.keys).sort(
    (a, b) => slug(a).localeCompare(slug(b)) || a.localeCompare(b),
  );
  for (const path of paths) {
    const kind = kindOf(path, record.keys[path], overrides);
    const key = objectKey(path);
    if (!KINDS[kind] || seen.has(key) || key === OBJECT_PREFIX) {
      continue;
    }
    seen.add(key);
    list.push({ key, path, kind });
    if (list.length >= MAX_FEATURES) {
      break;
    }
  }
  return list;
}

/**
 * @param {object} gladys
 * @param {ReturnType<import('./store.js').cleanRecord>} record
 * @param {{ language: string, overrides?: Record<string, string> }} options
 */
export function buildDevice(gladys, record, { language, overrides = {} }) {
  const ids = deviceIds(gladys, record.devEui);
  const labels = pick(KIND_LABELS, language);
  const links = pick(LINK_NAMES, language);
  const names = new Set();
  const feature = (key, name, spec) => {
    let unique = clip(name);
    for (let n = 2; names.has(unique); n += 1) {
      unique = clip(`${name} ${n}`);
    }
    names.add(unique);
    return {
      name: unique,
      external_id: ids.feature(key),
      selector: ids.feature(key),
      category: spec.category,
      type: spec.type,
      ...(spec.unit ? { unit: spec.unit } : {}),
      min: spec.min,
      max: spec.max,
      read_only: true,
      has_feedback: false,
    };
  };
  const features = measures(record, overrides).map(({ key, path, kind }) =>
    feature(key, `${labels[kind]} (${path})`, KINDS[kind]),
  );
  features.push(
    feature('rssi', links.rssi, { category: 'signal', type: 'integer', min: -150, max: 20 }),
    feature('snr', links.snr, { category: 'signal', type: 'integer', min: -30, max: 30 }),
  );
  if (record.battery) {
    features.push(feature('status_battery', links.status_battery, KINDS.battery));
  }
  return {
    name: record.name || record.devEui,
    external_id: ids.device,
    selector: ids.device,
    model: record.profile || 'LoRaWAN',
    should_poll: false,
    params: [
      { name: 'dev_eui', value: record.devEui },
      ...(record.applicationName ? [{ name: 'application', value: record.applicationName }] : []),
    ],
    features,
  };
}
