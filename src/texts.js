// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of Gladys. German
// says "du", Spanish "usted". The language is the one of the configuration
// (a device integration and a scene action do not receive the user's), except
// for the widget, which gets the viewer's.
// -----------------------------------------------------------------------------

export const pick = (table, language) => table[language] ?? table.en;

/**
 * The kind of a measure, before its codec key in the feature name
 * ("Temperature (TempC_SHT)"). Names are frozen when the user adds the device.
 */
export const KIND_LABELS = {
  en: {
    temperature: 'Temperature',
    temperature_f: 'Temperature',
    humidity: 'Humidity',
    soil_moisture: 'Soil moisture',
    co2: 'CO2',
    pressure: 'Pressure',
    illuminance: 'Illuminance',
    battery: 'Battery',
    voltage: 'Voltage',
    voltage_mv: 'Voltage',
    current: 'Current',
    power: 'Power',
    distance_mm: 'Distance',
    distance_cm: 'Distance',
    distance_m: 'Distance',
    pm25: 'PM2.5',
    pm10: 'PM10',
    noise: 'Noise',
    counter: 'Counter',
    motion: 'Motion',
    opening: 'Opening',
    contact: 'Opening',
    leak: 'Leak',
    smoke: 'Smoke',
    vibration: 'Vibration',
    tamper: 'Tamper',
    binary: 'State',
    number: 'Value',
  },
  fr: {
    temperature: 'Température',
    temperature_f: 'Température',
    humidity: 'Humidité',
    soil_moisture: 'Humidité du sol',
    co2: 'CO2',
    pressure: 'Pression',
    illuminance: 'Luminosité',
    battery: 'Batterie',
    voltage: 'Tension',
    voltage_mv: 'Tension',
    current: 'Courant',
    power: 'Puissance',
    distance_mm: 'Distance',
    distance_cm: 'Distance',
    distance_m: 'Distance',
    pm25: 'PM2,5',
    pm10: 'PM10',
    noise: 'Bruit',
    counter: 'Compteur',
    motion: 'Mouvement',
    opening: 'Ouverture',
    contact: 'Ouverture',
    leak: 'Fuite',
    smoke: 'Fumée',
    vibration: 'Vibration',
    tamper: 'Sabotage',
    binary: 'État',
    number: 'Valeur',
  },
  de: {
    temperature: 'Temperatur',
    temperature_f: 'Temperatur',
    humidity: 'Luftfeuchtigkeit',
    soil_moisture: 'Bodenfeuchte',
    co2: 'CO2',
    pressure: 'Luftdruck',
    illuminance: 'Helligkeit',
    battery: 'Batterie',
    voltage: 'Spannung',
    voltage_mv: 'Spannung',
    current: 'Strom',
    power: 'Leistung',
    distance_mm: 'Abstand',
    distance_cm: 'Abstand',
    distance_m: 'Abstand',
    pm25: 'PM2,5',
    pm10: 'PM10',
    noise: 'Lärm',
    counter: 'Zähler',
    motion: 'Bewegung',
    opening: 'Öffnung',
    contact: 'Öffnung',
    leak: 'Leck',
    smoke: 'Rauch',
    vibration: 'Vibration',
    tamper: 'Manipulation',
    binary: 'Zustand',
    number: 'Wert',
  },
  es: {
    temperature: 'Temperatura',
    temperature_f: 'Temperatura',
    humidity: 'Humedad',
    soil_moisture: 'Humedad del suelo',
    co2: 'CO2',
    pressure: 'Presión',
    illuminance: 'Luminosidad',
    battery: 'Batería',
    voltage: 'Tensión',
    voltage_mv: 'Tensión',
    current: 'Corriente',
    power: 'Potencia',
    distance_mm: 'Distancia',
    distance_cm: 'Distancia',
    distance_m: 'Distancia',
    pm25: 'PM2,5',
    pm10: 'PM10',
    noise: 'Ruido',
    counter: 'Contador',
    motion: 'Movimiento',
    opening: 'Apertura',
    contact: 'Apertura',
    leak: 'Fuga',
    smoke: 'Humo',
    vibration: 'Vibración',
    tamper: 'Manipulación',
    binary: 'Estado',
    number: 'Valor',
  },
};

/** The radio and status features of every device. */
export const LINK_NAMES = {
  en: {
    rssi: 'Signal RSSI (dBm)',
    snr: 'Signal SNR (dB)',
    status_battery: 'Battery (LoRaWAN status)',
  },
  fr: {
    rssi: 'Signal RSSI (dBm)',
    snr: 'Signal SNR (dB)',
    status_battery: 'Batterie (statut LoRaWAN)',
  },
  de: {
    rssi: 'Signal RSSI (dBm)',
    snr: 'Signal SNR (dB)',
    status_battery: 'Batterie (LoRaWAN-Status)',
  },
  es: {
    rssi: 'Señal RSSI (dBm)',
    snr: 'Señal SNR (dB)',
    status_battery: 'Batería (estado LoRaWAN)',
  },
};

/** Connection status of the integration page (an object: the core picks the language). */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of the MQTT broker ChirpStack publishes to.',
    fr: "Saisissez l'adresse du broker MQTT où publie ChirpStack.",
    de: 'Gib die Adresse des MQTT-Brokers ein, an den ChirpStack sendet.',
    es: 'Introduzca la dirección del broker MQTT donde publica ChirpStack.',
  },
  refused: {
    en: 'The MQTT broker refuses the user name, the password or the subscription.',
    fr: "Le broker MQTT refuse le nom d'utilisateur, le mot de passe ou l'abonnement.",
    de: 'Der MQTT-Broker lehnt den Benutzernamen, das Passwort oder das Abonnement ab.',
    es: 'El broker MQTT rechaza el nombre de usuario, la contraseña o la suscripción.',
  },
  unreachable: {
    en: 'The MQTT broker does not answer: check its address and that it is running.',
    fr: "Le broker MQTT ne répond pas : vérifiez son adresse et qu'il est démarré.",
    de: 'Der MQTT-Broker antwortet nicht: Prüfe seine Adresse und ob er läuft.',
    es: 'El broker MQTT no responde: compruebe su dirección y que esté en marcha.',
  },
  publishFailed: {
    en: 'The integration could not start: see its logs.',
    fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
    de: 'Die Integration konnte nicht starten: Sieh dir ihre Protokolle an.',
    es: 'La integración no pudo iniciarse: consulte sus registros.',
  },
};

/** The "Check the connection" action. */
export const CHECK_TEXT = {
  en: {
    notConfigured: MESSAGES.notConfigured.en,
    refused: MESSAGES.refused.en,
    unreachable: MESSAGES.unreachable.en,
    connecting: 'Connecting to the MQTT broker, try again in a few seconds.',
    protobuf:
      'Messages received, but not in JSON: set json=true in the MQTT integration of chirpstack.toml.',
    nothing: (url) =>
      `Connected to ${url}. No ChirpStack uplink yet: check the topic prefix and wait for a sensor to send.`,
    ok: (url, devices, added) =>
      `Connected to ${url}. ${devices} LoRaWAN device(s) heard, ${added} added to Gladys.`,
  },
  fr: {
    notConfigured: MESSAGES.notConfigured.fr,
    refused: MESSAGES.refused.fr,
    unreachable: MESSAGES.unreachable.fr,
    connecting: 'Connexion au broker MQTT en cours, réessayez dans quelques secondes.',
    protobuf:
      "Messages reçus, mais pas en JSON : mettez json=true dans l'intégration MQTT de chirpstack.toml.",
    nothing: (url) =>
      `Connecté à ${url}. Aucun message de ChirpStack pour l'instant : vérifiez le préfixe des topics et attendez qu'un capteur émette.`,
    ok: (url, devices, added) =>
      `Connecté à ${url}. ${devices} appareil(s) LoRaWAN entendu(s), ${added} ajouté(s) à Gladys.`,
  },
  de: {
    notConfigured: MESSAGES.notConfigured.de,
    refused: MESSAGES.refused.de,
    unreachable: MESSAGES.unreachable.de,
    connecting: 'Verbindung zum MQTT-Broker läuft, versuch es in ein paar Sekunden erneut.',
    protobuf:
      'Nachrichten empfangen, aber nicht in JSON: Setze json=true in der MQTT-Integration von chirpstack.toml.',
    nothing: (url) =>
      `Verbunden mit ${url}. Noch keine Nachricht von ChirpStack: Prüfe das Topic-Präfix und warte, bis ein Sensor sendet.`,
    ok: (url, devices, added) =>
      `Verbunden mit ${url}. ${devices} LoRaWAN-Gerät(e) gehört, ${added} zu Gladys hinzugefügt.`,
  },
  es: {
    notConfigured: MESSAGES.notConfigured.es,
    refused: MESSAGES.refused.es,
    unreachable: MESSAGES.unreachable.es,
    connecting: 'Conectando con el broker MQTT, vuelva a intentarlo en unos segundos.',
    protobuf:
      'Mensajes recibidos, pero no en JSON: ponga json=true en la integración MQTT de chirpstack.toml.',
    nothing: (url) =>
      `Conectado a ${url}. Ningún mensaje de ChirpStack todavía: compruebe el prefijo de los topics y espere a que un sensor emita.`,
    ok: (url, devices, added) =>
      `Conectado a ${url}. ${devices} dispositivo(s) LoRaWAN oído(s), ${added} añadido(s) a Gladys.`,
  },
};

/** The `send_downlink` scene action: its summary, or the error it throws. */
export const DOWNLINK_TEXT = {
  en: {
    sent: (name, port, bytes) => `Downlink queued for ${name}: ${bytes} byte(s) on fPort ${port}.`,
    unknownDevice: 'This device is not a ChirpStack device of the integration.',
    notHeard:
      'No uplink from this device since the integration started: its ChirpStack application is unknown yet.',
    fPort: 'The fPort must be a whole number from 1 to 223.',
    payload: 'The payload must be hexadecimal (for example 0100FF), 242 bytes at most.',
    offline: 'The MQTT broker is not connected: downlink not sent.',
    failed: 'The MQTT broker did not confirm the downlink: it may still be sent later.',
  },
  fr: {
    sent: (name, port, bytes) =>
      `Message descendant mis en file pour ${name} : ${bytes} octet(s) sur le fPort ${port}.`,
    unknownDevice: "Cet appareil n'est pas un appareil ChirpStack de l'intégration.",
    notHeard:
      "Aucun message de cet appareil depuis le démarrage de l'intégration : son application ChirpStack est encore inconnue.",
    fPort: 'Le fPort doit être un nombre entier de 1 à 223.',
    payload: 'Le contenu doit être en hexadécimal (par exemple 0100FF), 242 octets au plus.',
    offline: "Le broker MQTT n'est pas connecté : message descendant non envoyé.",
    failed:
      "Le broker MQTT n'a pas confirmé le message descendant : il peut encore partir plus tard.",
  },
  de: {
    sent: (name, port, bytes) =>
      `Downlink für ${name} eingereiht: ${bytes} Byte(s) auf fPort ${port}.`,
    unknownDevice: 'Dieses Gerät ist kein ChirpStack-Gerät der Integration.',
    notHeard:
      'Seit dem Start der Integration kam keine Nachricht von diesem Gerät: Seine ChirpStack-Anwendung ist noch unbekannt.',
    fPort: 'Der fPort muss eine ganze Zahl von 1 bis 223 sein.',
    payload: 'Der Inhalt muss hexadezimal sein (zum Beispiel 0100FF), höchstens 242 Bytes.',
    offline: 'Der MQTT-Broker ist nicht verbunden: Downlink nicht gesendet.',
    failed:
      'Der MQTT-Broker hat den Downlink nicht bestätigt: Er kann später noch gesendet werden.',
  },
  es: {
    sent: (name, port, bytes) =>
      `Mensaje descendente en cola para ${name}: ${bytes} byte(s) en el fPort ${port}.`,
    unknownDevice: 'Este dispositivo no es un dispositivo ChirpStack de la integración.',
    notHeard:
      'Ningún mensaje de este dispositivo desde el inicio de la integración: su aplicación ChirpStack aún es desconocida.',
    fPort: 'El fPort debe ser un número entero de 1 a 223.',
    payload: 'El contenido debe estar en hexadecimal (por ejemplo 0100FF), 242 bytes como máximo.',
    offline: 'El broker MQTT no está conectado: mensaje descendente no enviado.',
    failed: 'El broker MQTT no confirmó el mensaje descendente: aún puede enviarse más tarde.',
  },
};
