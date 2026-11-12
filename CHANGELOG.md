# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The LoRaWAN devices of a ChirpStack v4 server, read from its MQTT
  integration: one Gladys device per DevEUI, offered in the Discovery tab as
  soon as it sends, with its ChirpStack name.
- One feature per value decoded by the codec of the device profile, its kind
  guessed from its name (temperature, humidity, CO2, pressure, illuminance,
  battery, voltage, distance, door, leak, motion, smoke…), correctable or
  hidden with the "Corrected keys" setting.
- The RSSI and SNR of the best gateway, and the battery level of the LoRaWAN
  status.
- Scene triggers: uplink received (fPort filter, raw payload), sensor silent,
  sensor back, sensor joined.
- Scene action: send a downlink (fPort, hexadecimal payload, confirmed or not).
- Dashboard widget "LoRaWAN sensors": last message and signal of each sensor,
  silent ones first.
- "Check the connection" action; texts and documentation in English, French,
  German and Spanish.
