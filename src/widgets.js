// -----------------------------------------------------------------------------
// The "LoRaWAN sensors" dashboard widget: one line per ChirpStack device added
// in Gladys, with its last uplink and its signal, the silent ones first.
//
// Content budget of the core: one `status` list of 10 lines at most. A line:
// the name given in Gladys, "12 min ago · -97 dBm" (the signal can be hidden),
// red when the device is silent past the configured delay. Pre-localized from
// the viewer's `language` (the core caches the content per settings, language
// and units); the relative times make a short TTL.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

export const WIDGET = {
  DEVICES: WIDGET_KEY,
};

export const CONTENT_TTL_SECONDS = 60;
export const MAX_LINES = 10;
const MAX_VALUE = 40;

export const TEXT = {
  en: {
    notConfigured: 'Enter the address of the MQTT broker in the integration configuration.',
    noDevice: 'Add the LoRaWAN sensors to Gladys first (Discovery tab of the integration).',
    noneSilent: 'Every sensor sends normally.',
    never: 'Nothing received yet',
    now: 'just now',
    ago: (amount, unit) => `${amount} ${{ min: 'min', h: 'h', d: 'd' }[unit]} ago`,
    silent: (ago) => `Silent (${ago})`,
  },
  fr: {
    notConfigured: "Saisissez l'adresse du broker MQTT dans la configuration de l'intégration.",
    noDevice: "Ajoutez d'abord les capteurs LoRaWAN à Gladys (onglet Découverte de l'intégration).",
    noneSilent: 'Tous les capteurs émettent normalement.',
    never: 'Rien reçu pour l’instant',
    now: 'à l’instant',
    ago: (amount, unit) => `il y a ${amount} ${{ min: 'min', h: 'h', d: 'j' }[unit]}`,
    silent: (ago) => `Silencieux (${ago})`,
  },
  de: {
    notConfigured: 'Gib die Adresse des MQTT-Brokers in der Konfiguration der Integration ein.',
    noDevice: 'Füge die LoRaWAN-Sensoren zuerst zu Gladys hinzu (Tab „Erkennung“ der Integration).',
    noneSilent: 'Alle Sensoren senden normal.',
    never: 'Noch nichts empfangen',
    now: 'gerade eben',
    ago: (amount, unit) => `vor ${amount} ${{ min: 'Min.', h: 'Std.', d: 'T.' }[unit]}`,
    silent: (ago) => `Stumm (${ago})`,
  },
  es: {
    notConfigured: 'Introduzca la dirección del broker MQTT en la configuración de la integración.',
    noDevice:
      'Añada primero los sensores LoRaWAN a Gladys (pestaña Descubrimiento de la integración).',
    noneSilent: 'Todos los sensores emiten con normalidad.',
    never: 'Nada recibido todavía',
    now: 'ahora mismo',
    ago: (amount, unit) => `hace ${amount} ${{ min: 'min', h: 'h', d: 'd' }[unit]}`,
    silent: (ago) => `Silencioso (${ago})`,
  },
};

const textContent = (text) => ({
  ttl_seconds: CONTENT_TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text }],
});

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** "12 min ago", "3 h ago", "2 d ago", in the viewer's language. */
export function relative(text, elapsedMs) {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) {
    return text.now;
  }
  if (minutes < 60) {
    return text.ago(minutes, 'min');
  }
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? text.ago(hours, 'h') : text.ago(Math.floor(hours / 24), 'd');
}

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {{ name: string, lastUplinkAt: number|null, silent: boolean, rssi: number|null }[]} input.devices
 * @param {boolean} input.showSignal
 * @param {boolean} input.onlySilent
 * @param {string} input.language
 * @param {number} input.now
 */
export function buildDevicesContent({ devices, showSignal, onlySilent, language, now }) {
  const text = pick(TEXT, language);
  const lines = [...devices]
    .filter((device) => !onlySilent || device.silent)
    .sort((a, b) => Number(b.silent) - Number(a.silent) || a.name.localeCompare(b.name, language))
    .slice(0, MAX_LINES)
    .map((device) => {
      const ago =
        device.lastUplinkAt === null ? text.never : relative(text, now - device.lastUplinkAt);
      if (device.silent) {
        return {
          label: clip(device.name, 40),
          value: clip(device.lastUplinkAt === null ? text.never : text.silent(ago), MAX_VALUE),
          icon: 'wifi-off',
          color: WIDGET_COLORS.DANGER,
        };
      }
      const signal = showSignal && device.rssi !== null ? ` · ${device.rssi} dBm` : '';
      return {
        label: clip(device.name, 40),
        value: clip(`${ago}${signal}`, MAX_VALUE),
        icon: 'radio',
        color: device.lastUplinkAt === null ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.SUCCESS,
      };
    });
  if (lines.length === 0) {
    return textContent(text.noneSilent);
  }
  return { ttl_seconds: CONTENT_TTL_SECONDS, components: [{ type: 'status', items: lines }] };
}

const bool = (value, fallback) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : fallback;

/**
 * The onWidgetGet handler of the devices widget.
 * @param {import('./hub.js').Hub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function getDevicesWidget(hub, { settings = {}, language = 'en' } = {}) {
  const text = pick(TEXT, language);
  if (!isConfigured(hub.config)) {
    return textContent(text.notConfigured);
  }
  const added = hub.addedDevices();
  if (added.length === 0) {
    return textContent(text.noDevice);
  }
  const devices = added.map(({ devEui, device }) => ({
    name: device.name || devEui,
    ...hub.deviceStatus(devEui),
  }));
  return buildDevicesContent({
    devices,
    showSignal: bool(settings.show_signal, true),
    onlySilent: bool(settings.only_silent, false),
    language,
    now: hub.now(),
  });
}
