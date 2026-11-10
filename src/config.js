// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with blanks, strings or `undefined`.
// -----------------------------------------------------------------------------

import { parseOverrides } from './mapping.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Hours without an uplink before a device counts as silent.
export const SILENT_AFTER_CHOICES = ['1', '2', '3', '6', '12', '24', '48', '72'];

export const DEFAULT_CONFIG = {
  broker_url: '',
  username: '',
  password: '',
  tls_insecure: false,
  topic_prefix: 'application',
  key_overrides: '',
  silent_after: '24',
  language: 'fr',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const bool = (value, fallback) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : fallback;
const choice = (value, choices, fallback) => {
  const raw = text(String(value ?? ''));
  return choices.includes(raw) ? Number(raw) : Number(fallback);
};

/**
 * The broker address, with its scheme: users type `192.0.2.10`,
 * `192.0.2.10:1883` or a full `mqtt://` / `mqtts://` URL.
 * @returns {string} '' when absent or not a broker URL
 */
export function normalizeBrokerUrl(value) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `mqtt://${raw}`;
  try {
    const url = new URL(withScheme);
    return ['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname
      ? withScheme
      : '';
  } catch {
    return '';
  }
}

/**
 * The first level of the ChirpStack event topics (`application` unless the
 * `event_topic` of chirpstack.toml was changed): no wildcard, no slash.
 */
export function normalizePrefix(value) {
  const raw = text(value).replace(/^\/+|\/+$/g, '');
  return raw === '' || /[#+]/.test(raw) ? DEFAULT_CONFIG.topic_prefix : raw;
}

/**
 * @param {object} [raw] the values received from Gladys
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  return {
    broker_url: normalizeBrokerUrl(source.broker_url),
    username: text(source.username),
    // A password may legitimately start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    tls_insecure: bool(source.tls_insecure, false),
    topic_prefix: normalizePrefix(source.topic_prefix),
    key_overrides: parseOverrides(source.key_overrides),
    // Hours.
    silent_after: choice(source.silent_after, SILENT_AFTER_CHOICES, DEFAULT_CONFIG.silent_after),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

export const isConfigured = (config) => Boolean(config?.broker_url);

/**
 * An address safe for the logs and the messages: no user name, no password,
 * no path or query string.
 */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '(invalid address)';
  }
}
