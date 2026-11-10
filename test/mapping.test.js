// -----------------------------------------------------------------------------
// Codec keys -> kinds, values -> states. The keys come from the codecs of the
// TTN device repository (lorawan-devices) the most common sensors use:
// Dragino, Milesight, Elsys, Adeunis, Netvox, Browan.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS,
  flatten,
  guessKind,
  kindOf,
  parseOverrides,
  slug,
  toState,
  wordsOf,
} from '../src/mapping.js';

test('splits keys into words, whatever their case', () => {
  assert.deepEqual(wordsOf('TempC_SHT'), ['temp', 'c', 'sht']);
  assert.deepEqual(wordsOf('batteryVoltage'), ['battery', 'voltage']);
  assert.deepEqual(wordsOf('DOOR_OPEN_STATUS'), ['door', 'open', 'status']);
  assert.equal(slug('sensor.CO2 level'), 'sensor_co2_level');
});

test('guesses the kind of the usual codec keys', () => {
  const cases = {
    temperature: 'temperature',
    TempC_SHT: 'temperature',
    TempC_DS: 'temperature',
    Ext_sensor_temp: 'temperature',
    soil_temperature: 'temperature',
    TempF: 'temperature_f',
    humidity: 'humidity',
    Hum_SHT: 'humidity',
    rh: 'humidity',
    soilMoisture: 'soil_moisture',
    water_soil: 'soil_moisture',
    co2: 'co2',
    CO2_ppm: 'co2',
    pressure: 'pressure',
    barometric_pressure: 'pressure',
    light: 'illuminance',
    ILL_lx: 'illuminance',
    illumination: 'illuminance',
    battery: 'battery',
    battery_level: 'battery',
    BatV: 'voltage',
    Bat_V: 'voltage',
    battery_voltage: 'voltage',
    vdd: 'number',
    batteryMv: 'voltage_mv',
    bat_mv: 'voltage_mv',
    current: 'current',
    power: 'power',
    distance: 'distance_mm',
    distance_cm: 'distance_cm',
    pm2_5: 'pm25',
    pm10: 'pm10',
    laeq: 'noise',
    pulse_count: 'counter',
    counter_a: 'counter',
    motion: 'motion',
    pir: 'motion',
    occupancy: 'motion',
    DOOR_OPEN_STATUS: 'opening',
    door: 'opening',
    magnet_status: 'opening',
    contact: 'contact',
    WATER_LEAK: 'leak',
    leakage_status: 'leak',
    smoke_alarm: 'smoke',
    tamper: 'tamper',
    vibration: 'vibration',
    snr_internal: 'number',
  };
  for (const [key, kind] of Object.entries(cases)) {
    assert.equal(guessKind(key, 1), kind, key);
  }
});

test('a boolean or a known word makes a binary feature; other texts and frame keys none', () => {
  assert.equal(guessKind('WATER_LEAK', false), 'leak');
  assert.equal(guessKind('alarm', true), 'binary');
  assert.equal(guessKind('magnet_status', 'open'), 'opening');
  assert.equal(guessKind('leak_status', 'no leak'), 'leak');
  assert.equal(guessKind('Work_mode', 'Door'), null);
  assert.equal(guessKind('door', 'ajar'), null);
  assert.equal(guessKind('temperature', '21.5'), 'temperature');
  assert.equal(guessKind('temperature', '21.5 C'), null);
  assert.equal(guessKind('timestamp', 1700000000), null);
  assert.equal(guessKind('fCnt', 3), null);
  assert.equal(guessKind('values', [1, 2]), null);
});

test('an open door is 0 and a closed one 1, as the Gladys opening sensor wants', () => {
  assert.equal(toState('opening', 1), 0);
  assert.equal(toState('opening', true), 0);
  assert.equal(toState('opening', 'open'), 0);
  assert.equal(toState('opening', 0), 1);
  assert.equal(toState('opening', 'close'), 1);
  assert.equal(toState('opening', 'closed'), 1);
  // A contact is closed when true (the Zigbee2MQTT convention).
  assert.equal(toState('contact', true), 1);
  assert.equal(toState('contact', false), 0);
  // The other detectors: 1 = detected.
  assert.equal(toState('leak', true), 1);
  assert.equal(toState('leak', 'normal'), 0);
  assert.equal(toState('motion', 2), 1);
  assert.equal(toState('motion', 'maybe'), null);
});

test('numbers keep three decimals, integers are rounded, the rest is refused', () => {
  assert.equal(toState('temperature', 21.53), 21.53);
  assert.equal(toState('number', 1 / 3), 0.333);
  assert.equal(toState('co2', 612.6), 613);
  assert.equal(toState('temperature', '19.5'), 19.5);
  assert.equal(toState('temperature', true), null);
  assert.equal(toState('temperature', Number.NaN), null);
  assert.equal(toState('unknown-kind', 1), null);
});

test('flattens nested objects, skips lists, stops at three levels', () => {
  assert.deepEqual(
    flatten({ a: 1, sensor: { co2: 612, deep: { x: 1, deeper: { y: 2 } } }, list: [1, 2] }),
    [
      ['a', 1],
      ['sensor.co2', 612],
      ['sensor.deep.x', 1],
    ],
  );
  assert.deepEqual(flatten(null), []);
  assert.deepEqual(flatten([1]), []);
});

test('reads the key overrides, by slug, and only known kinds', () => {
  const overrides = parseOverrides(
    'TempC_DS=temperature; Work mode : ignore\nfoo=bar, =x, sensor.CO2=co2',
  );
  assert.deepEqual(overrides, { tempc_ds: 'temperature', work_mode: 'ignore', sensor_co2: 'co2' });
  assert.equal(kindOf('TEMPC_DS', 'number', overrides), 'temperature');
  assert.equal(kindOf('sensor.co2', 'number', overrides), 'co2');
  assert.equal(kindOf('other.co2', 'number', { co2: 'counter' }), 'counter');
  assert.equal(kindOf('x', 'number', overrides), 'number');
  assert.deepEqual(parseOverrides(undefined), {});
});

test('every kind has display bounds', () => {
  for (const [kind, spec] of Object.entries(KINDS)) {
    assert.ok(spec.min < spec.max, kind);
  }
});

test('counts and durations of a detector are not the detector (Dragino LDS02, LWL02)', () => {
  assert.equal(guessKind('DOOR_OPEN_STATUS', 1), 'opening');
  assert.equal(guessKind('DOOR_OPEN_TIMES', 3), 'counter');
  assert.equal(guessKind('LAST_DOOR_OPEN_DURATION', 12), 'number');
  assert.equal(guessKind('WATER_LEAK_STATUS', 0), 'leak');
  assert.equal(guessKind('WATER_LEAK_TIMES', 2), 'counter');
  assert.equal(guessKind('LAST_WATER_LEAK_DURATION', 5), 'number');
  assert.equal(guessKind('pir_count', 4), 'counter');
  assert.equal(guessKind('tamper_count', 1), 'counter');
});

test('a battery in volts is a voltage, in percent a battery', () => {
  assert.equal(guessKind('battery', 3.6), 'voltage');
  assert.equal(guessKind('battery', 87), 'battery');
  assert.equal(guessKind('battery', 3), 'battery');
});
