# Thuis-dashboard

Een startpagina met nieuws, sport, weer en andere open informatie. Er zijn geen accounts of API-sleutels nodig.

- **Home**: eigen indeling. Via het potlood rechtsonder kun je widgets verslepen, groter of kleiner maken, toevoegen en weghalen. De store heeft ±55 widgets.
- **Nieuws**: NOS, Voetbalzone en Tweakers naast elkaar. Daarnaast ±35 nieuwsbronnen als widget.
- **Sport**: Eredivisie, Premier League, Champions League (stand, programma, uitslagen, topscorers) en Formule 1. Klik op een wedstrijd voor opstellingen en gebeurtenissen.
- **Zoeken**: begin ergens te typen. Enter zoekt op Google, een adres opent direct.

## Starten

Je hebt alleen Python 3.9+ nodig, zonder extra pakketten:

```sh
python3 server.py
```

Open daarna http://localhost:8080.

Of met Docker:

```sh
docker compose up -d
```

## Instellen

Alles gaat via omgevingsvariabelen. Met Docker zet je ze in `docker-compose.yml`.

| Variabele | Standaard | Wat |
|---|---|---|
| `DASH_PLACE` | Amsterdam | Plaatsnaam in de weer-widgets |
| `DASH_LAT` / `DASH_LON` | 52.3676 / 4.9041 | Locatie voor weer, regenradar, luchtkwaliteit en weerwaarschuwingen |
| `DASH_SCHOOL_REGION` | noord | Schoolvakanties: `noord`, `midden` of `zuid` |
| `DASH_CLUB` | PSV | Je club, gemarkeerd in standen en met een aftelklok op Home. Gebruik de naam zoals ESPN hem schrijft (bv. `Ajax`, `Feyenoord`, `AZ Alkmaar`, `Arsenal`). Leeg = geen favoriet |
| `DASH_F1_FAV` | Max Verstappen | Favoriete coureur |
| `DASH_PORT` | 8080 | Poort |
| `DASH_HOST` | 0.0.0.0 | Op welk adres de server luistert. `127.0.0.1` = alleen deze computer |
| `DASH_DATA` | `./data` | Map voor de opgeslagen Home-indeling |

Voorbeeld:

```sh
DASH_PLACE=Utrecht DASH_LAT=52.09 DASH_LON=5.12 DASH_SCHOOL_REGION=midden DASH_CLUB=Ajax python3 server.py
```

## Hoe het werkt

- `server.py` serveert de pagina uit `www/` en een kleine JSON-API onder `/api/<naam>`. De server haalt de bronnen op en cachet ze (5–30 min, live voetbal 1 min). Zo heeft de browser geen last van CORS en worden de bronnen niet overbelast.
- De Home-indeling staat in `data/layout.json`. Die wordt gedeeld door iedereen die het dashboard opent, en elke browser bewaart ook een eigen kopie.
- Bronnen: RSS-feeds, ESPN (voetbal), Jolpica (F1), Open-Meteo (weer en lucht), Buienradar (regen komende 2 uur), Meteoalarm (waarschuwingen), EnergyZero (stroomprijs), nager.at en rijksoverheid.nl (feestdagen en vakanties), Yahoo Finance (koersen, vertraagd) en Bing (foto van de dag). Het zijn allemaal openbare, ongedocumenteerde of gratis endpoints. Verandert een bron iets, dan kan een widget leeg blijven.
- Nieuwe nieuwsbron: zet de feed in `FEEDS` in `server.py` en voeg een regel toe aan `FEED_LIST` in `www/widgets.js`.
- Nieuwe widget: schrijf een functie in `www/widgets.js` en zet een regel in `STORE_WIDGETS`.

Zet je het dashboard open op internet, zet er dan wel een login voor (bv. via een reverse proxy). Iedereen die erbij kan, kan namelijk de Home-indeling aanpassen.

## Licentie

Gebruikt [gridstack.js](https://gridstackjs.com) (MIT, zie `www/vendor/gridstack-LICENSE.txt`).
