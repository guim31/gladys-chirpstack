// -----------------------------------------------------------------------------
// The decoded object of an uplink -> Gladys features.
//
// ChirpStack runs the codec of the device profile and puts its result in the
// `object` of the uplink: free-form JSON, one shape per manufacturer
// (`temperature`, `TempC_SHT`, `BatV`, `door_open_status`, `magnet_status`…).
// Every numeric or boolean leaf becomes a feature; its kind is guessed from
// the words of its key, and the user can correct a guess or name an unknown
// key in the configuration (`key_overrides`: `TempC_DS=temperature`).
//
// The guessed kind is stored with the device (src/store.js) the first time a
// key is seen, so a later version guessing otherwise never changes the
// category of a feature already added. Pure module: no I/O, no clock.
// -----------------------------------------------------------------------------

/**
 * Every kind a key can map to: the Gladys category/type, unit and display
 * bounds (min/max are NOT NULL in the core and only place the gauge needle).
 * `binary` kinds read booleans, numbers and a few words; `invert` for the
 * opening sensor, whose Gladys convention is 0 = open, 1 = closed.
 */
export const KINDS = {
  temperature: {
    category: 'temperature-sensor',
    type: 'decimal',
    unit: 'celsius',
    min: -50,
    max: 150,
  },
  temperature_f: {
    category: 'temperature-sensor',
    type: 'decimal',
    unit: 'fahrenheit',
    min: -60,
    max: 300,
  },
  humidity: { category: 'humidity-sensor', type: 'decimal', unit: 'percent', min: 0, max: 100 },
  soil_moisture: {
    category: 'soil-moisture-sensor',
    type: 'decimal',
    unit: 'percent',
    min: 0,
    max: 100,
  },
  co2: { category: 'co2-sensor', type: 'integer', unit: 'ppm', min: 0, max: 10000 },
  pressure: { category: 'pressure-sensor', type: 'decimal', unit: 'hPa', min: 0, max: 2000 },
  illuminance: { category: 'light-sensor', type: 'decimal', unit: 'lux', min: 0, max: 200000 },
  battery: { category: 'battery', type: 'integer', unit: 'percent', min: 0, max: 100 },
  voltage: { category: 'energy-sensor', type: 'voltage', unit: 'volt', min: 0, max: 400 },
  voltage_mv: {
    category: 'energy-sensor',
    type: 'voltage',
    unit: 'millivolt',
    min: 0,
    max: 100000,
  },
  current: { category: 'energy-sensor', type: 'current', unit: 'ampere', min: 0, max: 100 },
  power: { category: 'energy-sensor', type: 'power', unit: 'watt', min: 0, max: 100000 },
  distance_mm: { category: 'distance-sensor', type: 'decimal', unit: 'mm', min: 0, max: 100000 },
  distance_cm: { category: 'distance-sensor', type: 'decimal', unit: 'cm', min: 0, max: 10000 },
  distance_m: { category: 'distance-sensor', type: 'decimal', unit: 'm', min: 0, max: 100 },
  pm25: {
    category: 'pm25-sensor',
    type: 'decimal',
    unit: 'microgram-per-cubic-meter',
    min: 0,
    max: 1000,
  },
  pm10: {
    category: 'pm10-sensor',
    type: 'decimal',
    unit: 'microgram-per-cubic-meter',
    min: 0,
    max: 1000,
  },
  noise: { category: 'noise-sensor', type: 'integer', unit: 'decibel', min: 0, max: 150 },
  counter: { category: 'counter-sensor', type: 'integer', min: 0, max: 1000000000 },
  motion: { category: 'motion-sensor', type: 'binary', binary: true, min: 0, max: 1 },
  opening: {
    category: 'opening-sensor',
    type: 'binary',
    binary: true,
    invert: true,
    min: 0,
    max: 1,
  },
  contact: { category: 'opening-sensor', type: 'binary', binary: true, min: 0, max: 1 },
  leak: { category: 'leak-sensor', type: 'binary', binary: true, min: 0, max: 1 },
  smoke: { category: 'smoke-sensor', type: 'binary', binary: true, min: 0, max: 1 },
  vibration: { category: 'vibration-sensor', type: 'binary', binary: true, min: 0, max: 1 },
  tamper: { category: 'tamper', type: 'binary', binary: true, min: 0, max: 1 },
  binary: { category: 'input', type: 'binary', binary: true, min: 0, max: 1 },
  number: { category: 'unknown', type: 'unknown', min: -1000000, max: 1000000 },
};

export const IGNORE = 'ignore';
export const KIND_NAMES = [...Object.keys(KINDS), IGNORE];

// Keys that describe the frame, not the world.
const IGNORED_KEYS = new Set([
  'timestamp',
  'time',
  'ts',
  'epoch',
  'unixtime',
  'fcnt',
  'fport',
  'port',
]);

/** Words of a key: `TempC_SHT` -> [temp, c, sht], `batteryVoltage` -> [battery, voltage]. */
export function wordsOf(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** `TempC_SHT` -> `tempc_sht`: the part of a feature key that comes from the codec key. */
export const slug = (path) =>
  String(path)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

const has = (words, ...list) => list.some((word) => words.includes(word));

/**
 * The kind of a numeric key, from its words; null when nothing matches.
 * @param {string[]} words
 */
function numericKind(words) {
  const joined = words.join('');
  if (has(words, 'soil') && has(words, 'moisture', 'humidity', 'hum', 'water', 'vwc')) {
    return 'soil_moisture';
  }
  if (has(words, 'temperature', 'temp', 'tempc', 'tempf') || /^temp/.test(joined)) {
    return has(words, 'f', 'fahrenheit', 'tempf') ? 'temperature_f' : 'temperature';
  }
  if (has(words, 'humidity', 'hum', 'humi', 'rh') || /^humid/.test(joined)) {
    return 'humidity';
  }
  if (joined.includes('co2')) {
    return 'co2';
  }
  if (has(words, 'pressure', 'barometer', 'baro', 'press') || /^(baro|pressure)/.test(joined)) {
    return 'pressure';
  }
  if (has(words, 'illuminance', 'illumination', 'lux', 'lx', 'light', 'ill', 'luminosity')) {
    return 'illuminance';
  }
  const battery = has(words, 'battery', 'bat', 'batt', 'vbat', 'batv');
  if (has(words, 'mv') || /(bat|volt)mv$/.test(joined)) {
    return battery || has(words, 'voltage', 'volt') ? 'voltage_mv' : null;
  }
  if (
    has(words, 'vbat', 'batv') ||
    (battery && has(words, 'v', 'voltage', 'volt', 'vol')) ||
    has(words, 'voltage', 'volt')
  ) {
    return 'voltage';
  }
  if (battery) {
    return 'battery';
  }
  if (has(words, 'current', 'amp', 'amps', 'ampere')) {
    return 'current';
  }
  if (has(words, 'power', 'watt', 'watts')) {
    return 'power';
  }
  if (has(words, 'distance', 'dist', 'range', 'height')) {
    return has(words, 'cm') ? 'distance_cm' : has(words, 'm') ? 'distance_m' : 'distance_mm';
  }
  if (/^pm2(5|_5)?$/.test(joined) || joined === 'pm25' || has(words, 'pm25')) {
    return 'pm25';
  }
  if (joined.startsWith('pm10')) {
    return 'pm10';
  }
  if (has(words, 'noise', 'sound', 'laeq', 'db', 'decibel', 'spl')) {
    return 'noise';
  }
  if (has(words, 'count', 'counter', 'pulse', 'pulses')) {
    return 'counter';
  }
  return null;
}

/** The kind of a binary key, from its words; null when nothing matches. */
function binaryKind(words) {
  const joined = words.join('');
  if (has(words, 'motion', 'pir', 'occupancy', 'occupied', 'presence', 'movement')) {
    return 'motion';
  }
  if (joined.includes('leak') || joined.includes('flood')) {
    return 'leak';
  }
  if (joined.includes('smoke')) {
    return 'smoke';
  }
  if (has(words, 'tamper')) {
    return 'tamper';
  }
  if (has(words, 'vibration', 'vibrate', 'shock')) {
    return 'vibration';
  }
  if (has(words, 'open', 'opened', 'opening')) {
    return 'opening';
  }
  if (has(words, 'contact') && !has(words, 'door', 'window')) {
    return 'contact';
  }
  if (has(words, 'door', 'window', 'magnet', 'reed')) {
    return 'opening';
  }
  return null;
}

const TRUE_WORDS = new Set([
  'true',
  'on',
  'yes',
  'open',
  'opened',
  'detected',
  'leak',
  'leakage',
  'alarm',
  'motion',
  'occupied',
  'triggered',
  'active',
]);
const FALSE_WORDS = new Set([
  'false',
  'off',
  'no',
  'close',
  'closed',
  'normal',
  'clear',
  'none',
  'idle',
  'inactive',
  'vacant',
  'not detected',
  'no leak',
  'no alarm',
]);

/** A codec value as a boolean, or null. */
export function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : null;
  }
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase().replace(/_/g, ' ');
    if (TRUE_WORDS.has(word) || word === '1') {
      return true;
    }
    if (FALSE_WORDS.has(word) || word === '0') {
      return false;
    }
  }
  return null;
}

/** A codec value as a finite number, or null (`"21.5"` is read, `"21.5 C"` is not). */
export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) {
    return Number(value);
  }
  return null;
}

/**
 * The kind guessed for a key seen with that value; null when the value cannot
 * make a feature (a text, a list) or the key describes the frame.
 * @param {string} path the key in the object, `.`-joined when nested
 * @param {unknown} value
 */
export function guessKind(path, value) {
  const leaf = path.slice(path.lastIndexOf('.') + 1);
  const words = wordsOf(leaf);
  if (IGNORED_KEYS.has(words.join(''))) {
    return null;
  }
  if (typeof value === 'boolean') {
    return binaryKind(words) ?? 'binary';
  }
  if (typeof value === 'string' && toNumber(value) === null) {
    // A word only makes a feature when the key is a known detector.
    const kind = binaryKind(words);
    return kind && toBoolean(value) !== null ? kind : null;
  }
  const number = toNumber(value);
  if (number === null) {
    return null;
  }
  // A count or a duration of a detector (DOOR_OPEN_TIMES,
  // LAST_WATER_LEAK_DURATION of the Dragino codecs) is not the detector.
  const detector = binaryKind(words);
  if (detector) {
    if (has(words, 'times', 'count', 'cnt', 'counter', 'pulse', 'pulses', 'total', 'sum')) {
      return 'counter';
    }
    if (has(words, 'duration', 'interval', 'number', 'num', 'last', 'time')) {
      return 'number';
    }
  }
  const kind = detector ?? numericKind(words) ?? 'number';
  // A "battery" in volts (3.6) rather than in percent.
  return kind === 'battery' && !Number.isInteger(number) && number <= 5 ? 'voltage' : kind;
}

/**
 * The Gladys state of a value for a kind, or null when it does not fit.
 * @param {string} kind
 * @param {unknown} value
 */
export function toState(kind, value) {
  const spec = KINDS[kind];
  if (!spec) {
    return null;
  }
  if (spec.binary) {
    const on = toBoolean(value);
    if (on === null) {
      return null;
    }
    // Opening sensor: 0 = open, 1 = closed (OPENING_SENSOR_STATE of the core).
    return spec.invert ? (on ? 0 : 1) : on ? 1 : 0;
  }
  const number = typeof value === 'boolean' ? null : toNumber(value);
  if (number === null) {
    return null;
  }
  return spec.type === 'integer' ? Math.round(number) : Math.round(number * 1000) / 1000;
}

export const MAX_DEPTH = 3;
export const MAX_LEAVES = 50;

/**
 * The leaves of a decoded object: `{ a: { b: 1 } }` -> [['a.b', 1]]. Lists
 * are skipped (their length and order change from frame to frame).
 * @returns {Array<[string, unknown]>}
 */
export function flatten(object) {
  const leaves = [];
  const walk = (value, path, depth) => {
    if (leaves.length >= MAX_LEAVES) {
      return;
    }
    if (value && typeof value === 'object') {
      if (Array.isArray(value) || depth >= MAX_DEPTH) {
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        walk(child, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }
    if (path) {
      leaves.push([path, value]);
    }
  };
  if (object && typeof object === 'object' && !Array.isArray(object)) {
    walk(object, '', 0);
  }
  return leaves;
}

/**
 * The `key_overrides` setting: `TempC_DS=temperature, Work_mode=ignore`
 * (commas, semicolons or new lines; `:` accepted for `=`). Unknown kinds are
 * dropped. Keys compare by slug, so the case and the separators do not matter.
 * @returns {Record<string, string>} slug -> kind
 */
export function parseOverrides(value) {
  const overrides = {};
  if (typeof value !== 'string') {
    return overrides;
  }
  for (const entry of value.split(/[,;\n]+/)) {
    const match = entry.match(/^\s*([^=:]+?)\s*[=:]\s*([a-z0-9_]+)\s*$/i);
    if (!match) {
      continue;
    }
    const kind = match[2].toLowerCase();
    if (KIND_NAMES.includes(kind) && slug(match[1]) !== '') {
      overrides[slug(match[1])] = kind;
    }
  }
  return overrides;
}

/** The kind in force for a key: the user's override, else the stored guess. */
export const kindOf = (path, guessed, overrides = {}) =>
  overrides[slug(path)] ?? overrides[slug(path.slice(path.lastIndexOf('.') + 1))] ?? guessed;
