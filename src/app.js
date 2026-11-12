// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys), so index.js stays a few lines and the tests drive the very same
// wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { loadClientId } from './clientId.js';
import { normalizeConfig } from './config.js';
import { Hub } from './hub.js';
import { MESSAGES } from './texts.js';
import { SCENE_ACTION, sendDownlink } from './scenes.js';
import { WIDGET, getDevicesWidget } from './widgets.js';

const logger = createLogger({ name: 'chirpstack-app' });

export const ACTION = {
  CHECK_CONNECTION: 'check_connection',
};

/**
 * @param {object} gladys
 * @param {object} [options] test seams: connectMqtt, loadClientId, storage, now, timings
 * @returns {{ hub: Hub, stop: () => void }}
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new Hub({
    gladys,
    now: options.now,
    connectMqtt: options.connectMqtt,
    loadClientId: options.loadClientId ?? (() => loadClientId()),
    ...(options.storage ? { storage: options.storage } : {}),
    timings: options.timings,
  });

  // --- Discovery: the LoRaWAN devices heard ------------------------------------
  gladys.onScanRequest(async () => {
    logger.info('Scan requested');
    await hub.publishDiscovery({ force: true });
  });

  // --- Read-only devices (downlinks go through the scene action) ---------------
  gladys.onSetValue(async (device, feature) => {
    throw new Error(`${feature.external_id} is read-only`);
  });

  // No poll: ChirpStack pushes. Registered anyway, for a device that would
  // have been created with polling: nothing to do.
  gladys.onPoll(async () => {});

  // A device just added or updated in Gladys: the SDK forgot what it had
  // published and the core dropped the states sent before it existed. Send
  // everything now, and refresh the open widgets (its name may have changed).
  const onDeviceChanged = async () => {
    await hub.republish();
    hub.requestWidgetRefresh();
  };
  gladys.onDeviceCreated(onDeviceChanged);
  gladys.onDeviceUpdated(onDeviceChanged);
  gladys.onDeviceDeleted(async () => {
    hub.requestWidgetRefresh();
  });

  // --- Configuration screen action ----------------------------------------------
  gladys.onAction(ACTION.CHECK_CONNECTION, async () => {
    logger.info('Action check_connection');
    return hub.checkConnection();
  });

  // --- Scene action ---------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTION.SEND_DOWNLINK, (fields) => sendDownlink(hub, fields));

  // --- Dashboard widget -----------------------------------------------------------
  gladys.onWidgetGet(WIDGET.DEVICES, (request) => getDevicesWidget(hub, request));

  // --- Configuration -------------------------------------------------------------
  // A configuration saved while the initial getConfig() is in flight wins
  // over the (older) values it returns.
  let configUpdates = 0;
  gladys.onConfigUpdated(async (raw) => {
    configUpdates += 1;
    logger.info('Configuration updated');
    await hub.configure(normalizeConfig(raw));
  });

  // --- Connection lifecycle (the SDK logs the Gladys link itself) -------------
  gladys.on('connected', async () => {
    try {
      const updates = configUpdates;
      const raw = await gladys.getConfig();
      if (updates !== configUpdates) {
        return;
      }
      await hub.configure(normalizeConfig(raw));
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, MESSAGES.publishFailed).catch(() => {});
    }
  });

  return {
    hub,
    stop() {
      return hub.stop();
    },
  };
}
