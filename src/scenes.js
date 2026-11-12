// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `send_downlink` — queue a downlink for a device through the MQTT integration
// of ChirpStack (`.../command/down`): the fPort and the hexadecimal payload are
// typed by the user in the scene, nothing is guessed. Output: a sentence in the
// language of the configuration (a scene action does not receive the user's).
// An invalid field or a broker away is an error with a message for the user.
// -----------------------------------------------------------------------------

export const SCENE_ACTION = {
  SEND_DOWNLINK: 'send_downlink',
};

/**
 * @param {import('./hub.js').Hub} hub
 * @param {{ device?: string, f_port?: unknown, payload?: unknown, confirmed?: unknown }} fields
 */
export const sendDownlink = (hub, fields = {}) => hub.sendDownlink(fields);
