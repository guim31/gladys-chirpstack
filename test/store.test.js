// -----------------------------------------------------------------------------
// The device list in /data: never overwritten when it cannot be read, saves
// never overlapping.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeviceStore, fileStorage } from '../src/store.js';

const quiet = { debug() {}, info() {}, warn() {} };

test('a missing file is an empty list; saved, then read back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-chirpstack-'));
  const store = new DeviceStore(fileStorage(dir), quiet);
  await store.load();
  store.ensure('70b3d57ed0000001').keys.TempC_SHT = 'temperature';
  await Promise.all([store.flush(), store.flush(), store.flush()]);
  const again = new DeviceStore(fileStorage(dir), quiet);
  await again.load();
  assert.equal(again.get('70b3d57ed0000001').keys.TempC_SHT, 'temperature');
});

test('a damaged file is kept aside, the next start saves again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-chirpstack-'));
  await writeFile(join(dir, 'devices.json'), '{"version":1,"dev', 'utf8');
  const store = new DeviceStore(fileStorage(dir), quiet);
  await store.load();
  store.ensure('70b3d57ed0000001');
  await store.flush();
  assert.equal(await readFile(join(dir, 'devices.json.bad'), 'utf8'), '{"version":1,"dev');
  const next = new DeviceStore(fileStorage(dir), quiet);
  await next.load();
  next.ensure('70b3d57ed0000002');
  await next.flush();
  assert.match(await readFile(join(dir, 'devices.json'), 'utf8'), /70b3d57ed0000002/);
});

test('saves run one after the other', async () => {
  let running = 0;
  let overlap = false;
  const storage = {
    async load() {
      return null;
    },
    async save() {
      running += 1;
      overlap ||= running > 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    },
  };
  const store = new DeviceStore(storage, quiet);
  await store.load();
  await Promise.all([store.flush(), store.flush(), store.flush()]);
  assert.equal(overlap, false);
});
