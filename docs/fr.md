# ChirpStack

Les capteurs LoRaWAN de votre serveur [ChirpStack](https://www.chirpstack.io)
v4 dans Gladys : température, humidité, portes, fuites, CO2, piles… ChirpStack
publie chaque message de vos capteurs sur son broker MQTT, décodé par le codec
du profil d'appareil. L'intégration lit ce broker et fait de chaque valeur
décodée une fonctionnalité Gladys.

> Testée contre un vrai ChirpStack v4 (la pile officielle chirpstack-docker,
> une passerelle et des capteurs simulés), pas avec de vraies radios LoRa :
> vos retours sont les bienvenus.

## Ce que vous obtenez

- **Un appareil par appareil LoRaWAN** entendu par ChirpStack, nommé comme
  dans ChirpStack, dans l'onglet Découverte de l'intégration.
- **Une fonctionnalité par valeur décodée par le codec** : son type est deviné
  d'après son nom (`temperature`, `TempC_SHT`, `humidity`, `BatV`,
  `DOOR_OPEN_STATUS`, `water_leak`, `co2`…). Une valeur dont le nom ne dit rien
  devient une valeur simple.
- Le **RSSI** et le **SNR** de la meilleure passerelle, et le **niveau de
  batterie** du statut LoRaWAN quand l'appareil le donne.
- Des déclencheurs de scène, une action de scène pour envoyer un message
  descendant et un widget de tableau de bord (plus bas).

## Avant de commencer

1. Un ChirpStack **v4** en service avec son intégration MQTT (activée par
   défaut, c'est le cas de la pile chirpstack-docker). Les événements doivent
   être en **JSON** : `json=true` dans `[integration.mqtt]` de
   `chirpstack.toml` (valeur par défaut).
2. Un **codec** sur le profil de chaque capteur (Device profiles → Codec) :
   souvent celui du
   [dépôt d'appareils de TTN](https://github.com/TheThingsNetwork/lorawan-devices),
   que ChirpStack sait importer. Sans codec, l'appareil ne montre que son
   signal, et le déclencheur « message reçu » donne le contenu brut.
3. L'adresse du broker MQTT où publie ChirpStack, et ses identifiants s'il en
   a.

## Configuration

- **Adresse du broker** : `mqtt://` (port 1883) ou `mqtts://` pour TLS (port
  8883). L'intégration n'a besoin que de lire `application/#`, et d'écrire
  `application/+/device/+/command/down` pour les messages descendants.
- **Nom d'utilisateur** et **mot de passe** : vides pour un broker anonyme.
- **Accepter un certificat auto-signé** : `mqtts://` seulement.
- **Préfixe des sujets** : `application`, sauf si `event_topic` a été modifié
  dans `chirpstack.toml`.
- **Clés corrigées** : voir la section suivante.
- **Muet après** : un capteur ajouté à Gladys qui n'envoie rien pendant ce
  délai est « muet » (déclencheur, widget). Choisissez-le plus long que
  l'intervalle de votre capteur le plus lent : certains détecteurs de porte
  n'émettent que toutes les quelques heures.
- **Langue des textes** : noms des fonctionnalités (figés à l'ajout de
  l'appareil) et messages des actions et des scènes.

Puis utilisez **Vérifier la connexion**.

## Clés et types

Chaque valeur numérique ou booléenne de l'objet décodé devient une
fonctionnalité (50 au plus par appareil ; objets imbriqués jusqu'à trois
niveaux, comme `sensor.co2` ; listes et textes ignorés). Une valeur en toutes
lettres ne devient une fonctionnalité que pour un détecteur (`"open"`,
`"closed"`, `"leak"`, `"normal"`…). Le type deviné la première fois qu'une clé
est vue est conservé : une version ultérieure ne le change jamais.

Quand le type est mal deviné, ou pour masquer une valeur, écrivez des paires
`clé=type` dans **Clés corrigées**, séparées par des virgules :
`TempC_DS=temperature, Work_mode=ignore`. La clé est comparée sans tenir compte
de la casse ni des séparateurs. Types :

- mesures : `temperature` (°C), `temperature_f` (°F), `humidity` (%),
  `soil_moisture` (%), `co2` (ppm), `pressure` (hPa), `illuminance` (lux),
  `battery` (%), `voltage` (V), `voltage_mv` (mV), `current` (A), `power` (W),
  `distance_mm`, `distance_cm`, `distance_m`, `pm25`, `pm10` (µg/m³), `noise`
  (dB), `counter`, `number` (sans unité) ;
- détecteurs : `motion`, `opening` (vrai = ouvert), `contact` (vrai = fermé),
  `leak`, `smoke`, `vibration`, `tamper`, `binary` (tout oui/non) ;
- `ignore` : pas de fonctionnalité.

Une clé corrigée modifie l'appareil : utilisez **Mettre à jour** dans l'onglet
Découverte.

## Appareils

Ouvrez l'onglet **Découverte** de l'intégration : chaque appareil entendu depuis
le démarrage de l'intégration (et gardé dans son volume de données d'un
redémarrage à l'autre) s'y trouve, avec ses fonctionnalités. Ajoutez ceux que
vous voulez. Une nouvelle clé envoyée plus tard par un appareil (autre type de
trame) y apparaît aussi, et **Mettre à jour** l'ajoute.

Les états sont envoyés à chaque message, seulement s'ils ont changé (et toutes
les 12 heures pour une valeur stable). Les détecteurs de porte suivent la
convention de Gladys : ouvert ou fermé, tel qu'affiché.

## Scènes

Déclencheurs, pour les appareils ajoutés à Gladys (laissez l'appareil vide pour
tous) :

- **Message reçu** : chaque message, même avec les mêmes valeurs qu'avant (un
  bouton LoRaWAN, un compteur d'événements). Filtre sur le fPort ; la scène lit
  le fPort, le compteur de trames, le contenu brut en hexadécimal et le RSSI.
- **Capteur muet** : rien reçu pendant le délai configuré (pile, portée,
  panne). Une fois par silence ; le délai repart au retour du broker MQTT, pour
  qu'une coupure ne rende pas tous les capteurs muets.
- **Capteur de retour** : un capteur muet émet de nouveau.
- **Capteur reconnecté** : un join OTAA (redémarrage, pile changée).

Action **Envoyer un message descendant** : met des octets en file pour un
appareil dans ChirpStack (sujet `command/down`). Indiquez le fPort (1 à 223) et
le contenu en hexadécimal, tel que l'écrit la notice de l'appareil (par exemple
`0100FF`) ; « Message confirmé » demande un accusé de réception à l'appareil.
Un appareil de classe A le reçoit après son prochain message. L'intégration
doit avoir entendu l'appareil une fois (pour connaître son application). Rien
n'est deviné : ce que vous tapez est envoyé.

## Tableau de bord

Le widget **Capteurs LoRaWAN** liste les capteurs ajoutés à Gladys, les muets
en tête, avec leur dernier message et leur signal (« il y a 12 min · -97 dBm »).
Réglages : masquer le signal, n'afficher que les capteurs muets.

## Limites

- ChirpStack **v4** (le format de l'Application Server v3 est lu aussi, sans
  test). Événements JSON seulement, pas protobuf.
- Pas de liste des appareils ChirpStack par son API : un appareil apparaît dès
  qu'il a envoyé quelque chose.
- Appareils en lecture seule : une commande passe par l'action de scène de
  message descendant, avec un contenu que vous écrivez vous-même.
- Chaque message envoie quelques états : le cœur en accepte 300 par minute,
  assez pour des dizaines de capteurs aux intervalles habituels.
- Développée sans matériel radio LoRa.

## Dépannage

- **Aucun appareil dans la Découverte** : utilisez **Vérifier la connexion**.
  Vérifiez le préfixe des sujets, que le capteur émet (Devices → Events dans
  ChirpStack) et que l'utilisateur du broker peut lire `application/#`.
- **« Pas en JSON »** : mettez `json=true` dans `[integration.mqtt]` de
  `chirpstack.toml` et redémarrez ChirpStack.
- **Seulement RSSI et SNR** : le profil d'appareil n'a pas de codec, ou le codec
  échoue (Devices → Events → log dans ChirpStack).
- **Un type erroné** : corrigez-le dans **Clés corrigées**, puis **Mettre à
  jour** l'appareil.
- **Message descendant non reçu** : regardez l'onglet Queue de l'appareil dans
  ChirpStack, et que l'utilisateur du broker peut écrire `command/down`.
- Journaux : `LOG_LEVEL=debug` montre chaque message.
