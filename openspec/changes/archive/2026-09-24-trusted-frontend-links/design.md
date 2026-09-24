# Design

## Context

Sieben Stellen bauen Links auf das Frontend. Sechs davon lesen `Origin` oder
`Referer` aus dem Request, drei nehmen zusaetzlich ein `base_url`-Argument der
GraphQL-Mutation entgegen, das noch vor dem Kopf greift. Keine dieser Quellen
ist vertrauenswuerdig: `/graphql` ist in `config/urls.py` `csrf_exempt`, damit
prueft Djangos CSRF-Middleware den `Origin`-Kopf nicht, und
`DJANGO_ALLOWED_HOSTS` deckt nur den `Host`-Kopf ab.

Cora laeuft unter genau einer Adresse (`contract-cora.com`, eine Host-Regel im
Ingress). Es gibt keinen Fall, in dem dieselbe Installation Links unter
verschiedenen Adressen ausliefern muesste.

## Goals / Non-Goals

**Goals**

- Die Zieladresse eines Links haengt nur noch von der Konfiguration ab, nie vom
  Aufrufer.
- Mails aus Hintergrundaufgaben koennen Links enthalten.
- Eine einzige Stelle, die die Adresse bestimmt.

**Non-Goals**

- Mehrere Frontend-Adressen je Mandant. Faellt an, wenn Cora je unter zwei
  Domains erreichbar ist; dann traegt der Mandant die Adresse, nicht die
  Umgebung.
- Der Empfaengerkreis der HubSpot-Mail (alle aktiven Benutzer, auch externe)
  bleibt unveraendert - eigener Vorgang.

## Decisions

### Die Einstellung gilt, der Kopf wird nicht mehr gelesen

Naheliegend waere gewesen, `Origin` weiter zu nehmen und gegen eine Liste
erlaubter Adressen zu pruefen. Dagegen sprechen zwei Dinge: eine Pruefliste ist
eine zweite Stelle, die gepflegt werden will und bei der ein vergessener
Eintrag wieder eine Luecke ist; und es gibt keine Anforderung, die mehrere
Adressen braucht. Eine Funktion ohne Request-Parameter laesst den Fehler
ausserdem gar nicht erst zu - man kann den Kopf nicht versehentlich wieder
hereinreichen.

Preis: In der lokalen Entwicklung muss `FRONTEND_URL` stimmen. Deshalb setzt
`config/settings/local.py` `http://localhost:4000` vor, was der Adresse in
`docker-compose.yml` entspricht; ueberschreibbar per Umgebungsvariable.

### Leere Einstellung heisst "kein Link", nicht "kaputter Link"

Ist `FRONTEND_URL` leer, liefert `frontend_base_url()` einen leeren String und
schreibt eine Warnung ins Log. Die Mail-Bausteine haengen ihren Link nur an,
wenn sie eine Basis haben - dieses Muster tragen sie bereits. Eine Mail ohne
Link ist besser als eine mit `/reset-password/abc` ohne Adressteil.

`config/settings/production.py` prueft die Einstellung beim Start nicht hart:
ein Deployment, das wegen einer fehlenden Mail-Adresse nicht mehr hochkommt,
waere die schlechtere Fehlerart. Die Warnung im Log genuegt.

### `baseUrl` verschwindet aus der Schnittstelle

`signUp`, `createInvitation` und `createPasswordReset` nehmen das Argument
heute entgegen und ziehen es sogar dem Kopf vor. Es still zu ignorieren wuerde
eine Schnittstelle hinterlassen, die etwas verspricht, was sie nicht mehr tut.
Da Frontend und Backend im selben Release liegen, entfaellt es auf beiden
Seiten.

### Maskierung

Die Bausteine setzen Namen und freien Text bisher roh in HTML ein.
`contract_name` ist der `dealname` aus HubSpot, `todo.text` und der
Kommentartext stammen von Benutzern. Alle Einsetzungen laufen ab jetzt durch
`django.utils.html.escape`. Das gehoert nicht zum Anlass, ist aber dieselbe
Datei und dieselbe Zeile.

## Risiken

- **Falsch gesetzte `FRONTEND_URL` in Produktion** macht alle Links unbrauchbar,
  auch die zum Zuruecksetzen von Passwoertern. Gegenmittel: das ConfigMap traegt
  dieselbe Adresse wie `DJANGO_ALLOWED_HOSTS`, und der Wert wird nach dem
  Ausrollen einmal ueber eine Einladung an die eigene Adresse geprueft.
- **Reihenfolge beim Ausrollen:** Das ConfigMap muss vor dem neuen Abbild
  liegen, sonst laeuft die neue Fassung kurzzeitig ohne Adresse und verschickt
  Mails ohne Link. Beides in einem Commit in `k8s-infra` haelt die Reihenfolge
  ein, weil ArgoCD das ConfigMap vor dem Deployment anwendet.

## Migrationsplan

Keine Datenwanderung noetig. Bereits verschickte Links bleiben gueltig, die
Token liegen unveraendert in der Datenbank. Bestehende `ContractLink`-Eintraege
zur Auftragsbestaetigung behalten ihre gespeicherte Adresse; wer dort einen
falschen Eintrag findet, loescht ihn von Hand.
