// -----------------------------------------------------------------------------
// The devices heard, kept in /data/devices.json (the one writable volume):
// their names, application, the keys of their decoded object with the kind
// guessed the first time (so a feature never changes category on its own),
// whether they report a battery level, their last uplink and silence.
//
// Without it, a restart would offer each device with fewer features until
// every kind of frame has come again, and lose the silence of a device that
// stopped during the restart. Written at most every SAVE_DELAY_MS; a /data that
// cannot be written keeps everything in memory for this run.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SAVE_DELAY_MS = 30_000;
export const MAX_DEVICES = 500;

/** File storage under the data directory. */
export function fileStorage(dir = process.env.DATA_DIR || '/data') {
  const file = join(dir, 'devices.json');
  return {
    /** null when there is no file yet; throws when it cannot be read or is damaged. */
    async load() {
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') {
          return null;
        }
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch (err) {
        // Damaged (a crash mid-write, a full disk): kept aside for a look, and
        // the list starts again from the uplinks.
        await rename(file, `${file}.bad`);
        throw err;
      }
    },
    async save(data) {
      await mkdir(dir, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(data), 'utf8');
      await rename(`${file}.tmp`, file);
    },
  };
}

/** Memory storage, for the tests. */
export function memoryStorage(initial = null) {
  const storage = {
    data: initial,
    saves: 0,
    async load() {
      return structuredClone(storage.data);
    },
    async save(data) {
      storage.saves += 1;
      storage.data = structuredClone(data);
    },
  };
  return storage;
}

const str = (value) => (typeof value === 'string' ? value : '');

/** A stored device record, with every field present. */
export function cleanRecord(devEui, raw = {}) {
  const keys = {};
  for (const [path, kind] of Object.entries(raw.keys ?? {})) {
    if (typeof kind === 'string') {
      keys[path] = kind;
    }
  }
  return {
    devEui,
    applicationId: str(raw.applicationId),
    applicationName: str(raw.applicationName),
    name: str(raw.name),
    profile: str(raw.profile),
    keys,
    battery: raw.battery === true,
    lastUplinkAt: typeof raw.lastUplinkAt === 'number' ? raw.lastUplinkAt : null,
    // When the device_silent trigger fired, until the next uplink: kept so a
    // restart does not fire it twice for the same silence.
    silentSince: typeof raw.silentSince === 'number' ? raw.silentSince : null,
  };
}

export class DeviceStore {
  /**
   * @param {{ load: Function, save: Function }} storage
   * @param {{ warn: Function, debug: Function }} logger
   */
  constructor(storage, logger) {
    this.storage = storage;
    this.logger = logger;
    /** @type {Map<string, ReturnType<typeof cleanRecord>>} */
    this.devices = new Map();
    this.timer = null;
    this.failed = false;
    // Never save before the file was read: that would erase it.
    this.ready = false;
  }

  async load() {
    let data;
    try {
      data = await this.storage.load();
    } catch (err) {
      // Unreadable or damaged: never overwrite it, keep this run in memory.
      this.logger.warn(
        `The device list in /data cannot be read, not saved this run (${err.message})`,
      );
      return;
    }
    this.devices.clear();
    for (const [devEui, raw] of Object.entries(data?.devices ?? {})) {
      if (/^[0-9a-f]{16}$/.test(devEui) && raw && typeof raw === 'object') {
        this.devices.set(devEui, cleanRecord(devEui, raw));
      }
    }
    this.ready = true;
  }

  get(devEui) {
    return this.devices.get(devEui);
  }

  /** The record of a device, created on first sight (null past the cap). */
  ensure(devEui) {
    let record = this.devices.get(devEui);
    if (!record) {
      if (this.devices.size >= MAX_DEVICES) {
        return null;
      }
      record = cleanRecord(devEui);
      this.devices.set(devEui, record);
    }
    return record;
  }

  /** Save soon (one write for a burst of uplinks). */
  touch() {
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, SAVE_DELAY_MS);
    this.timer.unref?.();
  }

  /** Save now; saves never overlap (they share the same temporary file). */
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    this.saving = (this.saving ?? Promise.resolve()).then(() => this.#save());
    return this.saving;
  }

  async #save() {
    if (!this.ready) {
      return;
    }
    const devices = Object.fromEntries(
      [...this.devices.entries()].map(([devEui, record]) => {
        const { devEui: _ignored, ...rest } = record;
        return [devEui, rest];
      }),
    );
    try {
      await this.storage.save({ version: 1, devices });
      if (this.failed) {
        this.failed = false;
        this.logger.info('The device list is saved in /data again');
      }
    } catch (err) {
      if (!this.failed) {
        this.failed = true;
        this.logger.warn(`The device list cannot be saved in /data (${err.message})`);
      }
    }
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
