# ChirpStack

Los sensores LoRaWAN de su servidor [ChirpStack](https://www.chirpstack.io) v4
en Gladys: temperatura, humedad, puertas, fugas, CO2, baterías… ChirpStack
publica cada mensaje de sus sensores en su broker MQTT, decodificado por el
códec del perfil de dispositivo. La integración lee ese broker y convierte cada
valor decodificado en una función de Gladys.

> Probada con un ChirpStack v4 real (la pila oficial chirpstack-docker, una
> pasarela y sensores simulados), no con radios LoRa reales: sus comentarios
> son bienvenidos.

## Lo que obtiene

- **Un dispositivo por dispositivo LoRaWAN** que oye ChirpStack, con el nombre
  de ChirpStack, en la pestaña Descubrimiento de la integración.
- **Una función por valor decodificado por el códec**: su tipo se deduce de su
  nombre (`temperature`, `TempC_SHT`, `humidity`, `BatV`, `DOOR_OPEN_STATUS`,
  `water_leak`, `co2`…). Un valor cuyo nombre no dice nada es un valor simple.
- El **RSSI** y el **SNR** de la mejor pasarela, y el **nivel de batería** del
  estado LoRaWAN cuando el dispositivo lo da.
- Disparadores de escena, una acción de escena para enviar un mensaje
  descendente y un widget del panel (más abajo).

## Antes de empezar

1. Un ChirpStack **v4** en marcha con su integración MQTT (activada por
   defecto, como en la pila chirpstack-docker). Los eventos deben estar en
   **JSON**: `json=true` en `[integration.mqtt]` de `chirpstack.toml` (valor
   por defecto).
2. Un **códec** en el perfil de cada sensor (Device profiles → Codec): a menudo
   el del
   [repositorio de dispositivos de TTN](https://github.com/TheThingsNetwork/lorawan-devices),
   que ChirpStack puede importar. Sin códec, el dispositivo solo muestra su
   señal, y el disparador «mensaje recibido» da el contenido bruto.
3. La dirección del broker MQTT donde publica ChirpStack, y sus credenciales si
   las tiene.

## Configuración

- **Dirección del broker**: `mqtt://` (puerto 1883) o `mqtts://` para TLS
  (puerto 8883). La integración solo necesita leer `application/#`, y escribir
  `application/+/device/+/command/down` para los mensajes descendentes.
- **Nombre de usuario** y **contraseña**: vacíos para un broker anónimo.
- **Aceptar un certificado autofirmado**: solo `mqtts://`.
- **Prefijo de los temas**: `application`, salvo si `event_topic` se cambió en
  `chirpstack.toml`.
- **Claves corregidas**: vea la sección siguiente.
- **Mudo después de**: un sensor añadido a Gladys que no envía nada durante ese
  tiempo está «mudo» (disparador, widget). Elíjalo más largo que el intervalo
  de su sensor más lento: algunos detectores de puerta solo emiten cada pocas
  horas.
- **Idioma de los textos**: los nombres de las funciones (fijados al añadir el
  dispositivo) y los mensajes de las acciones y escenas.

Luego use **Comprobar la conexión**.

## Claves y tipos

Cada valor numérico o booleano del objeto decodificado se convierte en una
función (50 como máximo por dispositivo; objetos anidados hasta tres niveles,
como `sensor.co2`; listas y textos ignorados). Un valor en palabras solo se
convierte en función para un detector (`"open"`, `"closed"`, `"leak"`,
`"normal"`…). El tipo deducido la primera vez que se ve una clave se conserva:
una versión posterior nunca lo cambia.

Cuando un tipo está mal deducido, o para ocultar un valor, escriba pares
`clave=tipo` en **Claves corregidas**, separados por comas:
`TempC_DS=temperature, Work_mode=ignore`. La clave se compara sin mayúsculas ni
separadores. Tipos:

- medidas: `temperature` (°C), `temperature_f` (°F), `humidity` (%),
  `soil_moisture` (%), `co2` (ppm), `pressure` (hPa), `illuminance` (lux),
  `battery` (%), `voltage` (V), `voltage_mv` (mV), `current` (A), `power` (W),
  `distance_mm`, `distance_cm`, `distance_m`, `pm25`, `pm10` (µg/m³), `noise`
  (dB), `counter`, `number` (sin unidad);
- detectores: `motion`, `opening` (verdadero = abierto), `contact` (verdadero =
  cerrado), `leak`, `smoke`, `vibration`, `tamper`, `binary` (cualquier sí/no);
- `ignore`: ninguna función.

Una clave corregida modifica el dispositivo: use **Actualizar** en la pestaña
Descubrimiento.

## Dispositivos

Abra la pestaña **Descubrimiento** de la integración: cada dispositivo oído
desde el inicio de la integración (y conservado en su volumen de datos entre
reinicios) aparece allí, con sus funciones. Añada los que desee. Una clave nueva
enviada más tarde por un dispositivo (otro tipo de trama) también aparece, y
**Actualizar** la añade.

Los estados se envían con cada mensaje, solo si cambiaron (y cada 12 horas para
un valor estable). Los detectores de puerta siguen la convención de Gladys:
abierto o cerrado, tal como se muestra.

## Escenas

Disparadores, para los dispositivos añadidos a Gladys (deje el dispositivo
vacío para todos):

- **Mensaje recibido**: cada mensaje, aunque tenga los mismos valores que antes
  (un botón LoRaWAN, un contador de eventos). Filtro por fPort; la escena lee el
  fPort, el contador de tramas, el contenido bruto en hexadecimal y el RSSI.
- **Sensor mudo**: nada recibido durante el plazo configurado (pila, alcance,
  avería). Una vez por silencio; el plazo vuelve a empezar cuando vuelve el
  broker MQTT, para que un corte no deje mudos todos los sensores.
- **Sensor de vuelta**: un sensor mudo vuelve a emitir.
- **Sensor reconectado**: un join OTAA (reinicio, pila nueva).

Acción **Enviar un mensaje descendente**: pone en cola bytes para un
dispositivo en ChirpStack (tema `command/down`). Indique el fPort (1 a 223) y el
contenido en hexadecimal, tal como lo escribe el manual del dispositivo (por
ejemplo `0100FF`); «Mensaje confirmado» pide un acuse de recibo al dispositivo.
Un dispositivo de clase A lo recibe tras su próximo mensaje. La integración
debe haber oído el dispositivo una vez (para conocer su aplicación). Nada se
deduce: lo que usted escribe se envía.

## Panel

El widget **Sensores LoRaWAN** lista los sensores añadidos a Gladys, los mudos
primero, con su último mensaje y su señal («hace 12 min · -97 dBm»). Ajustes:
ocultar la señal, mostrar solo los sensores mudos.

## Límites

- ChirpStack **v4** (también se lee el formato del Application Server v3, sin
  probar). Solo eventos JSON, no protobuf.
- Sin lista de los dispositivos de ChirpStack por su API: un dispositivo
  aparece en cuanto ha enviado algo.
- Dispositivos de solo lectura: una orden pasa por la acción de escena de
  mensaje descendente, con un contenido que usted mismo escribe.
- Cada mensaje envía algunos estados: el núcleo acepta 300 por minuto,
  suficiente para decenas de sensores con los intervalos habituales.
- Desarrollada sin hardware de radio LoRa.

## Solución de problemas

- **Ningún dispositivo en Descubrimiento**: use **Comprobar la conexión**.
  Compruebe el prefijo de los temas, que el sensor emite (Devices → Events en
  ChirpStack) y que el usuario del broker puede leer `application/#`.
- **«No en JSON»**: ponga `json=true` en `[integration.mqtt]` de
  `chirpstack.toml` y reinicie ChirpStack.
- **Solo RSSI y SNR**: el perfil de dispositivo no tiene códec, o el códec falla
  (Devices → Events → log en ChirpStack).
- **Un tipo erróneo**: corríjalo en **Claves corregidas** y luego **Actualizar**
  el dispositivo.
- **Mensaje descendente no recibido**: mire la pestaña Queue del dispositivo en
  ChirpStack, y que el usuario del broker puede escribir `command/down`.
- Registros: `LOG_LEVEL=debug` muestra cada mensaje.
