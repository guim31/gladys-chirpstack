# ChirpStack for Gladys Assistant

The LoRaWAN sensors of a [ChirpStack](https://www.chirpstack.io) v4 network
server in [Gladys Assistant](https://gladysassistant.com): an external
integration that reads the MQTT integration of ChirpStack and turns each value
decoded by the device codecs into a Gladys feature.

> Tested against a real ChirpStack v4 (the official chirpstack-docker stack,
> with a simulated gateway and simulated ABP and OTAA devices), not with real
> LoRa radios. Developed without the hardware: feedback welcome.

## Features

- One Gladys device per LoRaWAN device (DevEUI), offered in the Discovery tab
  as soon as it sends, with its ChirpStack name and device profile.
- One feature per numeric or boolean value of the decoded `object`, its kind
  guessed from its name: temperature, humidity, soil moisture, CO2, pressure,
  illuminance, battery, voltage, current, power, distance, PM2.5/PM10, noise,
  counters, and the motion, opening, contact, leak, smoke, vibration and
  tamper detectors. Unknown names become plain values; a "Corrected keys"
  setting fixes a guess or hides a key.
- RSSI and SNR of the best gateway; battery level of the LoRaWAN status.
- Scene triggers: uplink received (even with unchanged values, fPort filter,
  raw payload), sensor silent, sensor back, sensor joined (OTAA).
- Scene action: send a downlink (fPort, hexadecimal payload, confirmed or not)
  through `application/<id>/device/<DevEUI>/command/down`.
- Dashboard widget: last message and signal of each sensor, silent ones first.
- Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- ChirpStack v4 with its MQTT integration in JSON (`json=true`, the default),
  and a codec on the device profiles (often from the
  [TTN device repository](https://github.com/TheThingsNetwork/lorawan-devices)).
- The MQTT broker ChirpStack publishes to, reachable from Gladys.

## Installation

In Gladys: **Integrations → Install from GitHub**, with the address
`https://github.com/guim31/gladys-chirpstack`. Then enter the broker address in
the configuration, open the Discovery tab and add your sensors. The user
documentation is in [`docs/`](docs/en.md).

## Limitations

- JSON events only (not the protobuf marshaler); the v3 Application Server
  format is read but untested.
- No ChirpStack API access: a device appears once it has sent something.
- Devices are read-only; commands go through the downlink scene action, with a
  payload written by the user.
- The kind of a key is guessed from its name: a codec with unusual names needs
  the "Corrected keys" setting.

## Development

Node.js 22+, ESM, no build step. Runtime dependencies:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and [`mqtt`](https://github.com/mqttjs/MQTT.js) (MIT).

```bash
npm install
npm test              # node --test, on the SDK's fake Gladys and a fake broker
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js            SDK wiring (src/app.js registers the handlers)
src/app.js          handlers: discovery, action, scene action, widget, configuration
src/hub.js          MQTT link, uplinks -> states, discovery, triggers, downlinks
src/chirpstack.js   the ChirpStack topics and payloads, the downlink command
src/mapping.js      codec keys -> kinds, values -> states, key overrides
src/devices.js      the Gladys device of a LoRaWAN device
src/store.js        the devices heard, kept in /data/devices.json
src/mqtt.js         MQTT client: link states (credentials never logged)
src/scenes.js       "Send a downlink" scene action
src/widgets.js      "LoRaWAN sensors" widget
src/texts.js        every text, in en/fr/de/es
src/clientId.js     stable MQTT client id, kept in /data
test/               node --test; test/fixtures/chirpstack/ holds real ChirpStack v4 events
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [ChirpStack](https://github.com/chirpstack/chirpstack) (MIT) by Orne
  Brocaar and contributors: the event and command formats come from its
  documentation and its API definitions; the fixtures were captured from the
  official [chirpstack-docker](https://github.com/chirpstack/chirpstack-docker)
  stack (MIT). No code of ChirpStack is included.
- Key names of the mapping: the codecs of the
  [TTN device repository](https://github.com/TheThingsNetwork/lorawan-devices).
- Cover: the ChirpStack logo, from the ChirpStack repository (MIT).
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by ChirpStack or
its authors.

## License

[Apache-2.0](LICENSE)
