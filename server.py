#!/usr/bin/env python3
"""Thuis-dashboard: serveert de pagina (www/) en een kleine JSON-API met open bronnen:
nieuws (RSS), voetbal (ESPN), Formule 1 (Jolpica), weer (Open-Meteo + Buienradar), luchtkwaliteit,
weerwaarschuwingen (Meteoalarm), stroomprijs (EnergyZero), feestdagen/schoolvakanties, markten (Yahoo) en de Bing-foto.
Geen API-sleutels nodig. Instellingen via omgevingsvariabelen (zie README.md)."""
import json
import os
import re as _re
import threading
import time
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from functools import partial
from urllib.parse import urlencode, parse_qs
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# ---------- instellingen (omgevingsvariabelen) ----------
ENV = os.environ.get
WEATHER = {"lat": float(ENV("DASH_LAT", "52.3676")), "lon": float(ENV("DASH_LON", "4.9041")), "place": ENV("DASH_PLACE", "Amsterdam")}
SCHOOL_REGION = ENV("DASH_SCHOOL_REGION", "noord").lower()      # noord, midden of zuid
CLUB = ENV("DASH_CLUB", "PSV")                                   # zoals ESPN de club noemt (bv. Ajax, Feyenoord, AZ, Arsenal)
F1_FAV = ENV("DASH_F1_FAV", "Max Verstappen")
HOST = ENV("DASH_HOST", "0.0.0.0")
PORT = int(ENV("DASH_PORT", "8080"))
BASE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(BASE, "www")
DATA_DIR = ENV("DASH_DATA", os.path.join(BASE, "data"))          # hier komt de Home-indeling (layout.json)
os.makedirs(DATA_DIR, exist_ok=True)
UA = "Mozilla/5.0 (thuis-dashboard)"

FEEDS = {
    "tweakers": "https://tweakers.net/feeds/nieuws.xml",
    "nunl": "https://www.nu.nl/rss/Algemeen",
    "nos": "https://feeds.nos.nl/nosnieuwsalgemeen",
    "voetbalzone": "https://feeds.footballco.com/vz/feed/ce3iomiqfw9iej21",
    "psv": "https://www.ed.nl/psv/rss.xml",
    "nos-binnen": "https://feeds.nos.nl/nosnieuwsbinnenland", "nos-buiten": "https://feeds.nos.nl/nosnieuwsbuitenland",
    "nos-tech": "https://feeds.nos.nl/nosnieuwstech", "nos-economie": "https://feeds.nos.nl/nosnieuwseconomie",
    "nos-sport": "https://feeds.nos.nl/nossportalgemeen", "nos-voetbal": "https://feeds.nos.nl/nosvoetbal",
    "nos-f1": "https://feeds.nos.nl/nossportformule1",
    "nu-tech": "https://www.nu.nl/rss/Tech", "nu-sport": "https://www.nu.nl/rss/Sport", "nu-economie": "https://www.nu.nl/rss/Economie",
    "rtl": "https://www.rtlnieuws.nl/rss.xml", "ad": "https://www.ad.nl/home/rss.xml", "telegraaf": "https://www.telegraaf.nl/rss",
    "volkskrant": "https://www.volkskrant.nl/voorpagina/rss.xml", "nrc": "https://www.nrc.nl/rss/",
    "l1": "https://www.l1nieuws.nl/rss/index.xml", "ed-eindhoven": "https://www.ed.nl/eindhoven/rss.xml",
    "tweakers-reviews": "https://tweakers.net/feeds/reviews.xml", "securitynl": "https://www.security.nl/rss/headlines.xml",
    "bright": "https://www.bright.nl/rss", "iculture": "https://www.iculture.nl/feed/", "androidplanet": "https://www.androidplanet.nl/feed/",
    "hn": "https://hnrss.org/frontpage", "verge": "https://www.theverge.com/rss/index.xml",
    "ars": "https://feeds.arstechnica.com/arstechnica/index", "bbc": "https://feeds.bbci.co.uk/news/world/rss.xml",
    "guardian": "https://www.theguardian.com/world/rss", "homelab": "https://www.reddit.com/r/homelab/top/.rss?t=day",
    "selfhst": "https://selfh.st/rss/", "racingnews": "https://racingnews365.nl/feed/news.xml",
    "soccernews": "https://www.soccernews.nl/feed",
}
FEED_MAX = 40   # sommige feeds (RTL) geven honderden items
CACHE_SECONDS = 600
LIVE_CACHE_SECONDS = 60
ESPN = "https://site.api.espn.com/apis"
JOLPICA = "https://api.jolpi.ca/ergast/f1/current"
LEAGUES = {"eredivisie": "ned.1", "premierleague": "eng.1", "championsleague": "uefa.champions"}  # pad -> ESPN-competitie
PAST_MATCHDAYS = 3    # speeldagen terug voor de uitslagen
NEXT_MATCHDAYS = 6    # speeldagen vooruit voor het programma
MATCHDAYS = {"championsleague": (2, 4)}   # CL speelt een ronde over twee dagen
WEATHER_CACHE_SECONDS = 300
LEADERS = 10          # aantal spelers in topscorers en assists
_cache = {}


def label_for(pub):
    try:
        dt = parsedate_to_datetime(pub).astimezone()
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat((pub or "").strip().replace("Z", "+00:00")).astimezone()
        except ValueError:
            return ""
    today = datetime.now().astimezone().date()
    if dt.date() == today:
        return dt.strftime("%H:%M")
    if dt.date() == today - timedelta(days=1):
        return "gisteren"
    return dt.strftime("%d-%m")


def image_for(it):
    # enclosure of media:thumbnail/content; feeds gebruiken verschillende media-namespaces
    for name in ("enclosure", "thumbnail", "content"):
        for el in it.iter():
            if el.tag.rsplit("}", 1)[-1] == name and el.get("url") and el.get("type", "image/").startswith("image/"):
                return el.get("url")
    return ""


def fetch(name):
    hit = _cache.get(name)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    req = urllib.request.Request(FEEDS[name], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as resp:
        root = ET.fromstring(resp.read())
    items = [
        {
            "title": (it.findtext("title") or "").strip(),
            "link": (it.findtext("link") or "").strip(),
            "time": label_for(it.findtext("pubDate")),
            "image": image_for(it),
        }
        for it in root.iter("item")
    ][:FEED_MAX]
    if not items:   # Atom (The Verge, Reddit, ...)
        loc = lambda el, n: next((c for c in el if c.tag.rsplit("}", 1)[-1] == n), None)
        for it in root.iter():
            if it.tag.rsplit("}", 1)[-1] != "entry":
                continue
            t, l = loc(it, "title"), loc(it, "link")
            when = loc(it, "published") if loc(it, "published") is not None else loc(it, "updated")
            items.append({"title": "".join(t.itertext()).strip() if t is not None else "",
                          "link": (l.get("href") or "") if l is not None else "",
                          "time": label_for(when.text if when is not None else ""), "image": image_for(it)})
            if len(items) >= FEED_MAX:
                break
    data = {"items": items}
    _cache[name] = (time.time(), data)
    return data


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.load(resp)


def stat(entry, name):
    return next((s.get("displayValue", "") for s in entry["stats"] if s["name"] == name), "")


def side(comp):
    team = comp["team"]
    return {"name": team.get("shortDisplayName", ""), "logo": team.get("logo", ""), "score": comp.get("score", "")}


def matches_on(league, day):
    data = get_json(f"{ESPN}/site/v2/sports/soccer/{league}/scoreboard?dates={day.replace('-', '')}")
    out = []
    for ev in data.get("events", []):
        comps = ev["competitions"][0]["competitors"]
        status = ev["status"]["type"]
        home_id = next(c["team"]["id"] for c in comps if c["homeAway"] == "home")
        # doelpunten; team = de ploeg die het doelpunt krijgt (ook bij een eigen doelpunt)
        goals = [
            {
                "min": d.get("clock", {}).get("displayValue", ""),
                "name": (d.get("athletesInvolved") or [{}])[0].get("shortName", ""),
                "side": "home" if d.get("team", {}).get("id") == home_id else "away",
                "og": bool(d.get("ownGoal")),
                "pen": bool(d.get("penaltyKick")),
            }
            for d in ev["competitions"][0].get("details", [])
            if d.get("scoringPlay")
        ]
        out.append({
            "id": ev["id"],
            "date": ev["date"],
            "state": status.get("state", ""),          # pre / in / post
            "detail": status.get("shortDetail", ""),   # bv. 67' of HT
            "home": side(next(c for c in comps if c["homeAway"] == "home")),
            "away": side(next(c for c in comps if c["homeAway"] == "away")),
            "goals": goals,
        })
    return out


def leaders(category, short_names):
    out = []
    for i, ldr in enumerate(category.get("leaders", [])[:LEADERS]):
        athlete = ldr.get("athlete", {})
        team = athlete.get("team") or {}
        stats = {st["name"]: st.get("displayValue", "") for st in athlete.get("statistics", [])}
        value = int(ldr.get("value") or 0)
        # gedeelde plek bij gelijk aantal
        rank = out[-1]["rank"] if out and out[-1]["value"] == value else i + 1
        out.append({
            "rank": rank,
            "name": athlete.get("displayName", ""),
            "team": short_names.get(team.get("id"), team.get("name", "")),
            "logo": (team.get("logos") or [{}])[0].get("href", ""),
            "matches": stats.get("appearances", ""),
            "value": value,
        })
    return out


def football(name):
    league = LEAGUES[name]
    hit = _cache.get(name)
    if hit and time.time() - hit[0] < hit[2]:
        return hit[1]
    table = get_json(f"{ESPN}/v2/sports/soccer/{league}/standings")["children"][0]["standings"]
    standings = [
        {
            "rank": int(stat(e, "rank") or 0),
            "team": e["team"].get("shortDisplayName", ""),
            "logo": (e["team"].get("logos") or [{}])[0].get("href", ""),
            "played": stat(e, "gamesPlayed"),
            "won": stat(e, "wins"),
            "draw": stat(e, "ties"),
            "lost": stat(e, "losses"),
            "gd": stat(e, "pointDifferential"),
            "points": stat(e, "points"),
            "note": (e.get("note") or {}).get("description", ""),
        }
        for e in table["entries"]
    ]
    standings.sort(key=lambda t: t["rank"])
    short_names = {e["team"]["id"]: e["team"].get("shortDisplayName", "") for e in table["entries"]}

    stats = {c["name"]: c for c in get_json(f"{ESPN}/site/v2/sports/soccer/{league}/statistics").get("stats", [])}
    scorers = leaders(stats.get("goalsLeaders", {}), short_names)
    assists = leaders(stats.get("assistsLeaders", {}), short_names)

    # speeldagen uit de competitiekalender; ESPN geeft per dag de wedstrijden (een datumbereik werkt niet)
    calendar = get_json(f"{ESPN}/site/v2/sports/soccer/{league}/scoreboard")["leagues"][0].get("calendar", [])
    if calendar and not isinstance(calendar[0], str):
        # bekertoernooien geven fases i.p.v. dagen; de speeldagen staan dan in de core-API
        calendar = get_json(f"https://sports.core.api.espn.com/v2/sports/soccer/leagues/{league}/calendar/ondays")
        calendar = calendar.get("eventDate", {}).get("dates", [])
    days = sorted({d[:10] for d in calendar if isinstance(d, str)})
    today = datetime.now().astimezone().date().isoformat()
    past, nxt = MATCHDAYS.get(name, (PAST_MATCHDAYS, NEXT_MATCHDAYS))
    pick = [d for d in days if d < today][-past:] + [d for d in days if d >= today][:nxt]
    with ThreadPoolExecutor(max_workers=4) as pool:
        matches = [m for day in pool.map(lambda d: matches_on(league, d), pick) for m in day]

    data = {
        "season": table.get("seasonDisplayName", ""),
        "standings": standings,
        "scorers": scorers,
        "assists": assists,
        "matches": matches,
    }
    live = any(m["state"] == "in" for m in matches)
    _cache[name] = (time.time(), data, LIVE_CACHE_SECONDS if live else CACHE_SECONDS)
    return data


def f1_sessions(race):
    names = [("FirstPractice", "Training 1"), ("SecondPractice", "Training 2"), ("ThirdPractice", "Training 3"),
             ("SprintQualifying", "Sprintkwalificatie"), ("Sprint", "Sprint"), ("Qualifying", "Kwalificatie")]
    out = [{"name": label, "date": f"{race[k]['date']}T{race[k].get('time', '00:00:00Z')}"} for k, label in names if k in race]
    out.append({"name": "Race", "date": f"{race['date']}T{race.get('time', '00:00:00Z')}"})
    return sorted(out, key=lambda x: x["date"])


def f1():
    hit = _cache.get("f1")
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    with ThreadPoolExecutor(max_workers=4) as pool:
        drv, con, cal, last = pool.map(get_json, [f"{JOLPICA}/driverstandings/", f"{JOLPICA}/constructorstandings/",
                                                  f"{JOLPICA}/", f"{JOLPICA}/last/results/"])
    drv_list = (drv["MRData"]["StandingsTable"]["StandingsLists"] or [{}])[0]
    con_list = (con["MRData"]["StandingsTable"]["StandingsLists"] or [{}])[0]
    drivers = [
        {
            "rank": d["position"] if "position" in d else d.get("positionText", ""),
            "name": f"{d['Driver']['givenName']} {d['Driver']['familyName']}",
            "code": d["Driver"].get("code", ""),
            "team": (d.get("Constructors") or [{}])[-1].get("name", ""),
            "teamId": (d.get("Constructors") or [{}])[-1].get("constructorId", ""),
            "wins": d.get("wins", "0"),
            "points": d.get("points", "0"),
        }
        for d in drv_list.get("DriverStandings", [])
    ]
    constructors = [
        {
            "rank": c.get("position", c.get("positionText", "")),
            "team": c["Constructor"]["name"],
            "teamId": c["Constructor"]["constructorId"],
            "wins": c.get("wins", "0"),
            "points": c.get("points", "0"),
        }
        for c in con_list.get("ConstructorStandings", [])
    ]
    races = [
        {
            "round": int(r["round"]),
            "name": r["raceName"],
            "circuit": r["Circuit"]["circuitName"],
            "place": f"{r['Circuit']['Location']['locality']}, {r['Circuit']['Location']['country']}",
            "date": f"{r['date']}T{r.get('time', '00:00:00Z')}",
            "sessions": f1_sessions(r),
        }
        for r in cal["MRData"]["RaceTable"]["Races"]
    ]
    lr = (last["MRData"]["RaceTable"]["Races"] or [None])[0]
    result = None
    if lr:
        result = {
            "round": int(lr["round"]),
            "name": lr["raceName"],
            "date": f"{lr['date']}T{lr.get('time', '00:00:00Z')}",
            "results": [
                {
                    "pos": x["positionText"],
                    "name": f"{x['Driver']['givenName']} {x['Driver']['familyName']}",
                    "team": x["Constructor"]["name"],
                    "teamId": x["Constructor"]["constructorId"],
                    "time": (x.get("Time") or {}).get("time") or x.get("status", ""),
                    "points": x.get("points", "0"),
                }
                for x in lr["Results"]
            ],
        }
    data = {"season": drv_list.get("season", ""), "round": drv_list.get("round", ""), "drivers": drivers,
            "constructors": constructors, "races": races, "last": result}
    _cache["f1"] = (time.time(), data)
    return data


def rain_now():
    """Buienradar: neerslag per 5 minuten voor de komende 2 uur (waarde 0-255 -> mm/u)."""
    url = f"https://gpsgadget.buienradar.nl/data/raintext?lat={WEATHER['lat']:.2f}&lon={WEATHER['lon']:.2f}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Homepage rss2json)"})
    with urllib.request.urlopen(req, timeout=10) as r:
        lines = r.read().decode().split()
    out = []
    for line in lines:
        val, _, hhmm = line.partition("|")
        if not val.strip().isdigit():
            continue
        v = int(val)
        out.append({"time": hhmm.strip(), "mm": round(10 ** ((v - 109) / 32), 2) if v else 0.0})
    return out


def weather():
    hit = _cache.get("weer")
    if hit and time.time() - hit[0] < WEATHER_CACHE_SECONDS:
        return hit[1]
    q = urlencode({
        "latitude": WEATHER["lat"], "longitude": WEATHER["lon"], "timezone": "Europe/Amsterdam",
        "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,"
                   "relative_humidity_2m,is_day,precipitation",
        "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
        "forecast_days": 7, "forecast_hours": 25,
    })
    with ThreadPoolExecutor(max_workers=2) as pool:
        fc = pool.submit(get_json, f"https://api.open-meteo.com/v1/forecast?{q}")
        rn = pool.submit(rain_now)
        fc = fc.result()
        try:
            rain = rn.result()
        except Exception:  # buienradar plat: weer toch tonen
            rain = (hit[1]["rain"] if hit else [])
    c, h, d = fc["current"], fc["hourly"], fc["daily"]
    data = {
        "place": WEATHER["place"],
        "current": {
            "time": c["time"], "temp": c["temperature_2m"], "feels": c["apparent_temperature"],
            "code": c["weather_code"], "day": c["is_day"], "wind": c["wind_speed_10m"],
            "wind_dir": c["wind_direction_10m"], "humidity": c["relative_humidity_2m"],
        },
        "hourly": [
            {"time": t, "temp": h["temperature_2m"][i], "code": h["weather_code"][i],
             "pop": h["precipitation_probability"][i], "day": h["is_day"][i]}
            for i, t in enumerate(h["time"])
        ][1:],
        "daily": [
            {"date": t, "code": d["weather_code"][i], "max": d["temperature_2m_max"][i],
             "min": d["temperature_2m_min"][i], "pop": d["precipitation_probability_max"][i],
             "sunrise": d["sunrise"][i], "sunset": d["sunset"][i]}
            for i, t in enumerate(d["time"])
        ],
        "rain": rain,
    }
    _cache["weer"] = (time.time(), data)
    return data



# ---------- wedstrijd-details (modal): opstellingen, gebeurtenissen, vorm ----------
_PARTICLES = {"van", "de", "der", "den", "ter", "ten", "te", "da", "das", "dos", "del", "di", "le", "la", "von", "el", "al", "mac"}


def _short(name):
    """Achternaam met tussenvoegsel: 'Hidde ter Avest' -> 'ter Avest', 'Kevin De Bruyne' -> 'De Bruyne'."""
    rest = (name or "").split()[1:]
    if not rest:
        return name
    i = next((i for i, w in enumerate(rest) if w.lower() in _PARTICLES), None)
    return " ".join(rest[i:]) if i is not None else rest[-1]


def match(comp, eid):
    if comp not in LEAGUES or not eid.isdigit() or len(eid) > 12:
        raise ValueError("onbekende wedstrijd")
    key = f"match:{comp}:{eid}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < hit[1].get("_ttl", 60):
        return hit[1]
    d = get_json(f"{ESPN}/site/v2/sports/soccer/{LEAGUES[comp]}/summary?event={eid}")
    hc = d["header"]["competitions"][0]
    st = hc.get("status", {}).get("type", {})
    state = st.get("state", "pre")
    # gebeurtenissen: goals, kaarten, wissels (participants bij wissel: [erin, eruit])
    events, per = [], {}
    for e in d.get("keyEvents") or []:
        t = (e.get("type") or {}).get("text") or ""
        kind = ("goal" if t in ("Goal", "Penalty - Scored", "Goal - Header", "Goal - Free-kick", "Goal - Volley") or t.startswith("Goal")
                else "og" if t == "Own Goal" else "yellow" if t == "Yellow Card" else "red" if t in ("Red Card", "Second Yellow Card")
                else "sub" if t == "Substitution" else None)
        if not kind:
            continue
        who = [p["athlete"]["displayName"] for p in e.get("participants") or [] if p.get("athlete")]
        team = (e.get("team") or {}).get("displayName")
        minute = (e.get("clock") or {}).get("displayValue") or ""
        if kind == "sub":
            if len(who) < 2:
                continue
            events.append({"min": minute, "kind": "sub", "team": team, "in": who[0], "out": who[1]})
            per.setdefault(who[0], []).append(("in", minute)); per.setdefault(who[1], []).append(("out", minute))
        elif who:
            events.append({"min": minute, "kind": kind, "team": team, "player": who[0], "pen": "Penalty" in t})
            per.setdefault(who[0], []).append((kind, minute))
    teams = []
    for c in sorted(hc["competitors"], key=lambda c: c.get("homeAway") != "home"):
        tm = c["team"]
        ro = next((r for r in d.get("rosters") or [] if (r.get("team") or {}).get("id") == tm.get("id")), {})
        players = []
        for p in ro.get("roster") or []:
            name = p["athlete"].get("displayName", "")
            ev = per.get(name, [])
            players.append({
                "n": p.get("jersey"), "name": name, "short": _short(name),
                "pos": (p.get("position") or {}).get("abbreviation") or "", "place": int(p.get("formationPlace") or 0),
                "starter": bool(p.get("starter")),
                "goals": sum(1 for k, _ in ev if k == "goal"), "og": sum(1 for k, _ in ev if k == "og"),
                "yellow": any(k == "yellow" for k, _ in ev), "red": any(k == "red" for k, _ in ev),
                "subIn": next((m for k, m in ev if k == "in"), None) if p.get("subbedIn") or any(k == "in" for k, _ in ev) else None,
                "subOut": next((m for k, m in ev if k == "out"), None) if p.get("subbedOut") or any(k == "out" for k, _ in ev) else None,
            })
        logo = next((l["href"] for l in tm.get("logos") or [] if "default" in (l.get("rel") or [])), None) or (tm.get("logo"))
        form = next((f for f in d.get("lastFiveGames") or [] if (f.get("team") or {}).get("id") == tm.get("id")), {})
        teams.append({
            "side": c.get("homeAway"), "name": tm.get("displayName"), "short": tm.get("shortDisplayName") or tm.get("displayName"),
            "logo": logo, "color": tm.get("color"), "alt": tm.get("alternateColor"), "score": c.get("score"),
            "formation": ro.get("formation"), "players": players,
            "form": [{"res": g.get("gameResult"), "score": g.get("score"), "vs": (g.get("opponent") or {}).get("displayName"),
                      "home": g.get("atVs") == "vs", "date": g.get("gameDate")} for g in (form.get("events") or [])[:5]],
        })
    venue = ((d.get("gameInfo") or {}).get("venue") or {}).get("fullName")
    data = {"id": eid, "comp": comp, "state": state, "detail": st.get("shortDetail") or st.get("detail"), "date": hc.get("date"),
            "venue": venue, "teams": teams, "events": events,
            "lineups": all(any(p["starter"] for p in t["players"]) for t in teams) if teams else False,
            "_ttl": 60 if state == "in" else 3600 if state == "post" else 600}
    if state == "pre" and data["lineups"]:
        data["_ttl"] = 120
    _cache[key] = (time.time(), data)
    if len(_cache) > 400:   # oude wedstrijden opruimen
        for k in sorted((k for k in _cache if k.startswith("match:")), key=lambda k: _cache[k][0])[:100]:
            _cache.pop(k, None)
    return data



# ---------- indeling van de Home-tab (widgets: id, x, y, w, h) ----------
LAYOUT_FILE = os.path.join(DATA_DIR, "layout.json")


def layout_read():
    try:
        with open(LAYOUT_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"items": None}


def layout_write(body):
    items = body.get("items")
    if not isinstance(items, list) or len(items) > 40:
        raise ValueError("ongeldige indeling")
    clean, seen = [], set()
    for it in items:
        wid = str(it.get("id", ""))
        if not _re.fullmatch(r"[a-z0-9-]{1,32}", wid) or wid in seen:
            continue
        seen.add(wid)
        nums = {k: int(it.get(k, 0)) for k in ("x", "y", "w", "h")}
        if not (0 <= nums["x"] < 12 and 0 <= nums["y"] < 200 and 1 <= nums["w"] <= 12 and 1 <= nums["h"] <= 30):
            continue
        clean.append(dict(id=wid, **nums))
    data = {"items": clean, "saved": int(time.time())}
    tmp = LAYOUT_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, LAYOUT_FILE)
    return data



_xc = {}


def cached(key, ttl, fn):
    hit = _xc.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        data = fn()
    except Exception:
        if hit:
            return hit[1]   # oude waarde als de bron even plat ligt
        raise
    _xc[key] = (time.time(), data)
    return data


def get_json_ua(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as resp:
        return json.load(resp)


def air():
    def f():
        q = urllib.parse.urlencode({"latitude": WEATHER["lat"], "longitude": WEATHER["lon"], "timezone": "Europe/Amsterdam",
            "current": "european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen",
            "hourly": "european_aqi,uv_index,grass_pollen,birch_pollen,alder_pollen", "forecast_days": 2})
        d = get_json_ua("https://air-quality-api.open-meteo.com/v1/air-quality?" + q)
        c, h = d["current"], d["hourly"]
        now = c["time"][:13]
        i0 = next((i for i, t in enumerate(h["time"]) if t[:13] >= now), 0)
        return {"place": WEATHER["place"], "now": c,
                "hours": [{"t": h["time"][i], "aqi": h["european_aqi"][i], "uv": h["uv_index"][i],
                           "pollen": max((h[k][i] or 0) for k in ("grass_pollen", "birch_pollen", "alder_pollen"))}
                          for i in range(i0, min(i0 + 24, len(h["time"])))]}
    return cached("lucht", 1800, f)


def _in_poly(lat, lon, poly):
    pts = [tuple(map(float, x.split(","))) for x in poly.split()]
    inside, j = False, len(pts) - 1
    for i in range(len(pts)):
        yi, xi = pts[i]; yj, xj = pts[j]
        if (xi > lon) != (xj > lon) and lat < (yj - yi) * (lon - xi) / ((xj - xi) or 1e-12) + yi:
            inside = not inside
        j = i
    return inside


def warnings_nl():
    def f():
        d = get_json_ua("https://feeds.meteoalarm.org/api/v1/warnings/feeds-netherlands")
        now, out = datetime.now(timezone.utc), []
        for w in d.get("warnings", []):
            infos = w.get("alert", {}).get("info", [])
            i = next((x for x in infos if x.get("language", "").startswith("nl")), infos[0] if infos else None)
            if not i:
                continue
            try:
                if datetime.fromisoformat(i["expires"]) < now:
                    continue
            except (KeyError, ValueError):
                pass
            lvl = next((p["value"] for p in i.get("parameter", []) if p.get("valueName") == "awareness_level"), "")
            here = any(_in_poly(WEATHER["lat"], WEATHER["lon"], pg) for a in i.get("area", []) for pg in a.get("polygon", []))
            out.append({"event": i.get("event"), "color": (lvl.split(";")[1].strip() if ";" in lvl else "yellow"),
                        "headline": i.get("headline"), "desc": i.get("description"), "onset": i.get("onset"), "expires": i.get("expires"),
                        "area": ", ".join(a.get("areaDesc", "") for a in i.get("area", [])), "here": here})
        rank = {"red": 0, "orange": 1, "yellow": 2}
        out.sort(key=lambda x: (not x["here"], rank.get(x["color"], 3), x["onset"] or ""))
        return {"place": WEATHER["place"], "warnings": out}
    return cached("waarschuwing", 600, f)


def energy():
    def f():
        t0 = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
        def prices(kind, days):
            a, b = t0.astimezone(timezone.utc), (t0 + timedelta(days=days)).astimezone(timezone.utc) - timedelta(seconds=1)
            u = (f"https://api.energyzero.nl/v1/energyprices?fromDate={a:%Y-%m-%dT%H:%M:%S.000Z}&tillDate={b:%Y-%m-%dT%H:%M:%S.999Z}"
                 f"&interval=4&usageType={kind}&inclBtw=true")
            return [[p["readingDate"], p["price"]] for p in get_json_ua(u).get("Prices", [])]
        el = prices(1, 2)
        try:
            gas = prices(3, 1)
        except Exception:
            gas = []
        return {"stroom": el, "gas": gas[-1][1] if gas else None, "note": "kale inkoopprijs incl. btw (EnergyZero), zonder energiebelasting en opslag"}
    return cached("energie", 900, f)


def holidays():
    def f():
        y = datetime.now().year
        hol = []
        for yr in (y, y + 1):
            hol += [{"date": h["date"], "name": h["localName"]} for h in get_json_ua(f"https://date.nager.at/api/v3/PublicHolidays/{yr}/NL")]
        today = datetime.now().date().isoformat()
        hol = [h for h in hol if h["date"] >= today][:12]
        # schoolvakanties van je regio (SCHOOL_REGION), huidig en volgend schooljaar
        sy = y if datetime.now().month >= 8 else y - 1
        vac = []
        for yr in (sy, sy + 1):
            try:
                d = get_json_ua(f"https://opendata.rijksoverheid.nl/v1/infotypes/schoolholidays/schoolyear/{yr}-{yr + 1}?output=json")
            except Exception:
                continue
            for c in d.get("content", []):
                for v in c.get("vacations", []):
                    for r in v.get("regions", []):
                        if r.get("region") in (SCHOOL_REGION, "heel Nederland"):
                            vac.append({"name": v.get("type", "").strip(), "start": r["startdate"][:10], "end": r["enddate"][:10]})
        vac = sorted({(v["start"], v["end"], v["name"]) for v in vac if v["end"] >= today})
        return {"region": SCHOOL_REGION, "holidays": hol, "vacations": [{"start": a, "end": b, "name": n} for a, b, n in vac][:8]}
    return cached("vrij", 43200, f)


MARKETS = [("^AEX", "AEX"), ("^GSPC", "S&P 500"), ("^IXIC", "Nasdaq"), ("BTC-EUR", "Bitcoin"), ("ETH-EUR", "Ethereum"),
           ("EURUSD=X", "EUR/USD"), ("GC=F", "Goud")]


def markets():
    def f():
        out = []
        for sym, name in MARKETS:
            try:
                d = get_json_ua(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=5d&interval=1h")
                r = d["chart"]["result"][0]; m = r["meta"]
                closes = [c for c in (r["indicators"]["quote"][0].get("close") or []) if c is not None]
                prev = m.get("chartPreviousClose") if False else None
                # dagverandering t.o.v. slot van de vorige handelsdag
                ts = r.get("timestamp") or []
                day = datetime.fromtimestamp(m.get("regularMarketTime", 0)).date()
                before = [c for t, c in zip(ts, r["indicators"]["quote"][0].get("close") or []) if c is not None and datetime.fromtimestamp(t).date() < day]
                prev = before[-1] if before else (closes[0] if closes else None)
                price = m.get("regularMarketPrice")
                out.append({"sym": sym, "name": name, "price": price, "cur": m.get("currency"),
                            "chg": round(100 * (price - prev) / prev, 2) if price and prev else None,
                            "spark": [round(c, 4) for c in closes[-48:]], "t": m.get("regularMarketTime")})
            except Exception:
                continue
        if not out:
            raise RuntimeError("geen koersen")
        return {"markets": out}
    return cached("markt", 600, f)


def photo():
    def f():
        d = get_json_ua("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=nl-NL")["images"][0]
        return {"url": "https://www.bing.com" + d["urlbase"] + "_1920x1080.jpg", "title": d.get("title"),
                "copyright": d.get("copyright"), "link": d.get("copyrightlink")}
    return cached("foto", 3600, f)


def f1_standings():
    def f():
        dr = get_json_ua(JOLPICA + "/driverStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
        co = get_json_ua(JOLPICA + "/constructorStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
        d = dr[0] if dr else {}
        return {"season": d.get("season"), "round": d.get("round"),
                "drivers": [{"pos": int(x["position"]) if x.get("position") else None, "name": f'{x["Driver"]["givenName"]} {x["Driver"]["familyName"]}',
                             "code": x["Driver"].get("code"), "team": (x.get("Constructors") or [{}])[-1].get("name"), "pts": float(x["points"]),
                             "wins": int(x.get("wins") or 0)} for x in d.get("DriverStandings", [])],
                "teams": [{"pos": int(x["position"]) if x.get("position") else None, "name": x["Constructor"]["name"], "pts": float(x["points"]),
                           "wins": int(x.get("wins") or 0)} for x in (co[0].get("ConstructorStandings", []) if co else [])]}
    return cached("f1stand", 3600, f)




EXTRA_ROUTES = {"lucht": air, "waarschuwing": warnings_nl, "energie": energy, "vrij": holidays, "markt": markets,
                "foto": photo, "f1stand": f1_standings}
_layout_lock = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    """Statische bestanden uit www/, plus /api/<naam> en /config.js."""

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/config.js":
            cfg = json.dumps({"club": CLUB, "f1": F1_FAV})
            return self.reply(200, f"window.DASH = {cfg};\n".encode(), "application/javascript")
        if path.startswith("/api/"):
            return self.api_get(path[5:].strip("/"))
        return super().do_GET()

    def api_get(self, name):
        q = parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
        try:
            if name == "layout":
                return self.json(200, layout_read())
            if name == "match":
                return self.json(200, match((q.get("comp") or [""])[0], (q.get("id") or [""])[0]))
            if name in EXTRA_ROUTES:
                return self.json(200, EXTRA_ROUTES[name]())
            if name not in FEEDS and name not in LEAGUES and name not in ("f1", "weer"):
                return self.json(404, {"error": "onbekend"})
        except Exception as exc:
            return self.json(502, {"error": str(exc)})
        try:
            data = football(name) if name in LEAGUES else f1() if name == "f1" else weather() if name == "weer" else fetch(name)
            return self.json(200, data)
        except Exception as exc:  # oude cache teruggeven als de bron even plat ligt
            hit = _cache.get(name)
            return self.json(200, hit[1]) if hit else self.json(502, {"items": [], "error": str(exc)})

    def do_POST(self):
        # alleen de indeling van Home; eigen header verplicht (andere sites kunnen die niet meesturen)
        if self.path.split("?", 1)[0] != "/api/layout" or self.headers.get("X-Dashboard") != "1":
            return self.json(403, {"ok": False, "error": "geen toegang"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 65536:
                return self.json(413, {"ok": False, "error": "te groot"})
            with _layout_lock:
                return self.json(200, dict(layout_write(json.loads(self.rfile.read(n) or b"{}")), ok=True))
        except Exception as exc:
            return self.json(400, {"ok": False, "error": str(exc)})

    def json(self, status, data):
        return self.reply(status, json.dumps(data).encode(), "application/json")

    def reply(self, status, body, ctype):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if not self.path.startswith("/api/") and self.path.split("?", 1)[0] in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-cache")   # nieuwe versie meteen zichtbaar
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Dashboard op http://{'localhost' if HOST in ('0.0.0.0', '::') else HOST}:{PORT}  (weer: {WEATHER['place']}, club: {CLUB})")
    ThreadingHTTPServer((HOST, PORT), partial(Handler, directory=WWW)).serve_forever()
