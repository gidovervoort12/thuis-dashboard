'use strict';
// ================================================================ widget store (v96): extra widgets voor Home
// Wordt vóór app.js geladen; de functies gebruiken helpers uit app.js (esc, ic, room, fitN, S, ...) pas bij het tekenen.
// Nieuwe widget: functie hieronder + regel in STORE_WIDGETS. Data: /api/<naam> (server.py).

// ---- nieuwsbronnen (FEEDS in server.py); id = /api/<id>, widget-id = nieuws-<id>
const FEED_LIST = [
  // Nieuws
  { id: 'nos', name: 'NOS', hue: 22, cat: 'Nieuws' }, { id: 'nunl', name: 'NU.nl', hue: 205, cat: 'Nieuws' },
  { id: 'nos-binnen', name: 'NOS Binnenland', hue: 18, cat: 'Nieuws' }, { id: 'nos-buiten', name: 'NOS Buitenland', hue: 28, cat: 'Nieuws' },
  { id: 'nos-economie', name: 'NOS Economie', hue: 40, cat: 'Nieuws' }, { id: 'nu-economie', name: 'NU.nl Economie', hue: 200, cat: 'Nieuws' },
  { id: 'rtl', name: 'RTL Nieuws', hue: 210, cat: 'Nieuws' }, { id: 'ad', name: 'AD', hue: 0, cat: 'Nieuws' },
  { id: 'telegraaf', name: 'De Telegraaf', hue: 215, cat: 'Nieuws' }, { id: 'volkskrant', name: 'de Volkskrant', hue: 230, cat: 'Nieuws' },
  { id: 'nrc', name: 'NRC', hue: 0, cat: 'Nieuws' },
  // Regio
  { id: 'l1', name: 'L1 Limburg', hue: 330, cat: 'Regio' }, { id: 'ed-eindhoven', name: 'ED Eindhoven', hue: 355, cat: 'Regio' },
  // Tech
  { id: 'tweakers', name: 'Tweakers', hue: 350, cat: 'Tech' }, { id: 'tweakers-reviews', name: 'Tweakers Reviews', hue: 345, cat: 'Tech' },
  { id: 'nos-tech', name: 'NOS Tech', hue: 15, cat: 'Tech' }, { id: 'nu-tech', name: 'NU.nl Tech', hue: 195, cat: 'Tech' },
  { id: 'securitynl', name: 'Security.NL', hue: 120, cat: 'Tech' }, { id: 'bright', name: 'Bright', hue: 280, cat: 'Tech' },
  { id: 'iculture', name: 'iCulture', hue: 190, cat: 'Tech' }, { id: 'androidplanet', name: 'AndroidPlanet', hue: 100, cat: 'Tech' },
  { id: 'hn', name: 'Hacker News', hue: 25, cat: 'Tech' }, { id: 'verge', name: 'The Verge', hue: 300, cat: 'Tech' },
  { id: 'ars', name: 'Ars Technica', hue: 15, cat: 'Tech' },
  // Homelab
  { id: 'homelab', name: 'r/homelab', hue: 15, cat: 'Homelab-nieuws', desc: 'Populairste posts van vandaag op Reddit' },
  { id: 'selfhst', name: 'selfh.st', hue: 160, cat: 'Homelab-nieuws', desc: 'Wekelijks nieuws over self-hosted software' },
  // Sport
  { id: 'voetbalzone', name: 'Voetbalzone', hue: 150, cat: 'Sportnieuws' }, { id: 'psv', name: 'ED PSV', hue: 0, cat: 'Sportnieuws', desc: 'PSV-nieuws van het Eindhovens Dagblad' },
  { id: 'nos-sport', name: 'NOS Sport', hue: 30, cat: 'Sportnieuws' }, { id: 'nos-voetbal', name: 'NOS Voetbal', hue: 140, cat: 'Sportnieuws' },
  { id: 'nos-f1', name: 'NOS Formule 1', hue: 0, cat: 'Sportnieuws' }, { id: 'racingnews', name: 'RacingNews365', hue: 10, cat: 'Sportnieuws' },
  { id: 'nu-sport', name: 'NU.nl Sport', hue: 120, cat: 'Sportnieuws' }, { id: 'soccernews', name: 'Soccernews', hue: 160, cat: 'Sportnieuws' },
  // Internationaal
  { id: 'bbc', name: 'BBC World', hue: 0, cat: 'Internationaal' }, { id: 'guardian', name: 'The Guardian', hue: 220, cat: 'Internationaal' },
];

// ---- kleine hulpjes
const nl = (v, d = 0) => v == null || isNaN(v) ? '–' : (+v).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const wMsg = (title, msg, cls = '') => `<div class="panel glass"><h3>${esc(title)}</h3><div class="sub ${cls}">${esc(msg)}</div></div>`;
const wHead = (title, right = '', sub = '') => `<div class="up-head"><div><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right}</div>`;
const pill = (cls, txt) => `<span class="cnt ${cls}">${txt}</span>`;
const daysTo = iso => { const t = new Date(); t.setHours(0, 0, 0, 0); const x = new Date(iso.length <= 10 ? iso + 'T00:00' : iso); x.setHours(0, 0, 0, 0); return Math.round((x - t) / 864e5); };
const inDays = n => n <= 0 ? 'vandaag' : n === 1 ? 'morgen' : `over ${n} dagen`;
const shortDate = iso => new Date(iso.length <= 10 ? iso + 'T12:00' : iso).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
const agoT = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'net' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} u` : `${Math.round(m / 1440)} d`; };
function spark(vals, w, h, cls = '') {   // lijntje (svg) voor koersen e.d.
  if (!vals || vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / span * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}"></polyline></svg>`;
}
const listRows = (items, n) => items.slice(0, n).map(it => `<div class="li${it.cls ? ' ' + it.cls : ''}">${it.img !== undefined ? `<span class="li-p"${it.img ? ` style="background-image:url('${url(it.img)}')"` : ''}></span>` : ''}<span class="li-m"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.right != null ? `<span class="li-r">${it.right}</span>` : ''}</div>`).join('');


// ================================================================ weer & omgeving
const AQI = [[20, 'Goed', 'ok'], [40, 'Redelijk', 'ok'], [60, 'Matig', 'upd'], [80, 'Slecht', 'bad'], [100, 'Zeer slecht', 'bad'], [1e9, 'Extreem slecht', 'bad']];
const pollenLvl = v => v == null ? ['–', ''] : v < 1 ? ['geen', 'ok'] : v < 20 ? ['laag', 'ok'] : v < 80 ? ['matig', 'upd'] : ['hoog', 'bad'];
function wLucht(sz = SZ0) {
  const d = S.d.lucht; if (!d) return wMsg('Luchtkwaliteit', S.err.lucht ? 'Niet bereikbaar' : 'Laden…');
  const c = d.now, a = AQI.find(x => c.european_aqi <= x[0]), R = room(sz, 36);
  const uv = c.uv_index, uvL = uv < 3 ? 'laag' : uv < 6 ? 'matig' : uv < 8 ? 'hoog' : 'zeer hoog';
  const chips = [['PM2,5', nl(c.pm2_5)], ['PM10', nl(c.pm10)], ['NO₂', nl(c.nitrogen_dioxide)], ['O₃', nl(c.ozone)], ['UV', `${nl(uv, 1)} ${uvL}`]];
  const pol = [['Gras', c.grass_pollen], ['Berk', c.birch_pollen], ['Els', c.alder_pollen], ['Bijvoet', c.mugwort_pollen], ['Ambrosia', c.ragweed_pollen]];
  const perRow = Math.max(1, fitN(R.w + 6, 70)), showChips = R.h >= 96, showPol = R.h >= 172, showHrs = R.h >= 252 && (d.hours || []).length;
  const hrs = showHrs ? (() => { const n = Math.min(d.hours.length, Math.max(6, fitN(R.w, 16))), hs = d.hours.slice(0, n), mx = Math.max(60, ...hs.map(h => h.aqi || 0));
    return `<div class="bn-h">Komende ${n} uur</div><div class="aq-h" style="--n:${n}">${hs.map(h => { const q = AQI.find(x => (h.aqi || 0) <= x[0]); return `<i class="${q[2]}" style="height:${Math.max(6, (h.aqi || 0) / mx * 100)}%" title="${esc(h.t.slice(11, 16))}: ${h.aqi}"></i>`; }).join('')}</div>`; })() : '';
  return `<div class="panel glass w-lab">${wHead('Luchtkwaliteit', '', R.h >= 140 ? esc(d.place) : '')}<div class="big-n ${a[2]}"><b>${c.european_aqi}</b><small>${a[1]} (Europese index)</small></div>${showChips ? `<div class="chips">${chips.slice(0, perRow).map(([k, v]) => `<span><small>${k}</small>${v}</span>`).join('')}</div>` : ''}${showPol ? `<div class="bn-h">Pollen</div><div class="chips">${pol.slice(0, perRow).map(([k, v]) => { const [t, cl] = pollenLvl(v); return `<span class="${cl}"><small>${k}</small>${t}</span>`; }).join('')}</div>` : ''}${hrs}</div>`;
}

const WCOL = { yellow: ['geel', 'upd'], orange: ['oranje', 'warn2'], red: ['rood', 'bad'] };
function wWarn(sz = SZ0) {
  const d = S.d.waarschuwing; if (!d) return wMsg('Weerwaarschuwingen', S.err.waarschuwing ? 'Niet bereikbaar' : 'Laden…');
  const R = room(sz, 36), here = d.warnings.filter(w => w.here), list = d.warnings;
  if (!list.length) return `<div class="panel glass w-lab">${wHead('Weerwaarschuwingen', pill('ok', 'geen'))}<div class="calm-l">${CHECK}<span>Geen waarschuwingen van het KNMI</span></div></div>`;
  const per = Math.min(list.length, 3) * 92 <= R.h ? 92 : 50, n = fitN(R.h, per);
  if (!n) { const w = list[0], [cn, cl] = WCOL[w.color] || ['', '']; return `<div class="panel glass w-lab">${wHead('Weer', `<span class="tag ${cl}">Code ${cn}</span>`)}<div class="sub">${esc(w.event)}${list.length > 1 ? ` +${list.length - 1}` : ''}</div></div>`; }
  const card = w => { const [cn, cl] = WCOL[w.color] || ['', '']; const t = `${shortDate(w.onset)} ${hm(new Date(w.onset))} – ${hm(new Date(w.expires))}`;
    return `<div class="wr ${cl}"><div class="wr-t"><span class="tag ${cl}">Code ${cn}</span><b>${esc(w.event)}</b></div><small>${esc(w.here ? `${d.place} · ` : '')}${esc(t)}</small>${per > 60 ? `<p>${esc(w.headline || '')}${w.here ? '' : ` · ${esc(w.area)}`}</p>` : ''}</div>`; };
  return `<div class="panel glass w-lab">${wHead('Weerwaarschuwingen', here.length ? pill('upd', `${here.length} hier`) : pill('ok', `niet in ${esc(d.place)}`))}${list.slice(0, n).map(card).join('')}</div>`;
}

function moon(t = Date.now()) {   // maanfase, gerekend vanaf de nieuwe maan van 6 jan 2000
  const syn = 29.530588853, age = (((t - 947182440000) / 864e5) % syn + syn) % syn;
  const names = [[1.84, 'Nieuwe maan', '🌑'], [5.53, 'Wassende sikkel', '🌒'], [9.22, 'Eerste kwartier', '🌓'], [12.91, 'Wassende maan', '🌔'], [16.61, 'Volle maan', '🌕'], [20.3, 'Afnemende maan', '🌖'], [23.99, 'Laatste kwartier', '🌗'], [27.68, 'Afnemende sikkel', '🌘'], [99, 'Nieuwe maan', '🌑']];
  const f = names.find(x => age < x[0]), full = ((14.765 - age) % syn + syn) % syn, nw = syn - age;
  return { age, name: f[1], icon: f[2], pct: Math.round((1 - Math.cos(2 * Math.PI * age / syn)) / 2 * 100), full: new Date(t + full * 864e5), next: new Date(t + nw * 864e5) };
}
function wSun(sz = SZ0) {
  const days = (S.d.weer && S.d.weer.daily) || [];
  if (!days.length || !days[0].sunrise) return wMsg('Zon & maan', 'Laden…');
  const R = room(sz, 36), up = new Date(days[0].sunrise), dn = new Date(days[0].sunset), now = Date.now();
  const len = (dn - up) / 6e4, d1 = days[1] && days[1].sunrise ? (new Date(days[1].sunset) - new Date(days[1].sunrise)) / 6e4 : null;
  const diff = d1 == null ? '' : Math.round(d1 - len), m = moon();
  const wide = R.w >= 460 && R.h >= 92, showMoon = R.h >= 108 || wide;
  const fr = Math.max(0, Math.min(1, (now - up) / (dn - up))), aw = Math.max(120, Math.min(R.w * (wide ? 0.5 : 1), 340));
  const ah = Math.min(aw * 0.42, R.h - 54 - (showMoon && !wide ? 66 : 0) - 14);   // boog krijgt de ruimte die overblijft
  const x = 8 + fr * (aw - 16), y = ah - Math.sin(fr * Math.PI) * (ah - 10);
  const arc = ah >= 34 ? `<svg class="sun-arc" width="${aw}" height="${ah + 6}" viewBox="0 0 ${aw} ${ah + 6}" aria-hidden="true"><path class="tr" d="M8 ${ah} Q ${aw / 2} ${-ah + 20} ${aw - 8} ${ah}"></path><line x1="0" x2="${aw}" y1="${ah}" y2="${ah}"></line>${now > up && now < dn ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"></circle>` : ''}</svg>` : '';
  const facts = `<div class="sun-f"><div><small>Op</small><b>${hm(up)}</b></div><div><small>Onder</small><b>${hm(dn)}</b></div><div><small>Daglicht</small><b>${Math.floor(len / 60)}u ${pad(Math.round(len % 60))}</b>${diff !== '' ? `<small>morgen ${diff > 0 ? '+' : ''}${diff} min</small>` : ''}</div></div>`;
  const mn = `<div class="moon"><span class="moon-i">${m.icon}</span><div><b>${m.name}</b><small>${m.pct}% verlicht · volle maan ${m.full.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</small></div></div>`;
  return `<div class="panel glass w-lab w-sun${wide ? ' wide' : ''}">${wHead('Zon & maan')}<div class="sun-b"><div>${arc}${facts}</div>${showMoon ? mn : ''}</div></div>`;
}

function wEnergie(sz = SZ0) {
  const d = S.d.energie; if (!d) return wMsg('Stroomprijs', S.err.energie ? 'Niet bereikbaar' : 'Laden…');
  const all = (d.stroom || []).map(([t, p]) => [new Date(t), p]), t0 = new Date(); t0.setMinutes(0, 0, 0);
  const R = room(sz, 36), tomorrow = all.filter(x => x[0].getDate() !== t0.getDate() && x[0] > t0);
  const show = all.filter(x => x[0].getDate() === t0.getDate()).concat(R.w >= 520 ? tomorrow : []);
  const cur = all.find(x => +x[0] === +t0), ps = show.map(x => x[1]), lo = Math.min(...ps), hi = Math.max(...ps);
  // goedkoopste blok van 3 uur vanaf nu
  const fut = all.filter(x => x[0] >= t0); let best = null;
  for (let i = 0; i + 2 < fut.length; i++) { const avg = (fut[i][1] + fut[i + 1][1] + fut[i + 2][1]) / 3; if (!best || avg < best[1]) best = [fut[i][0], avg]; }
  const cH = Math.max(0, Math.min(360, R.h - 70 - (R.h >= 230 ? 24 : 0))), span = Math.max(0.01, hi - Math.min(0, lo));
  const bars = cH >= 30 ? `<div class="en-ch" style="height:${cH}px;--n:${show.length}">${show.map(([t, p]) => { const k = (p - lo) / ((hi - lo) || 1); return `<i class="${+t === +t0 ? 'now ' : ''}${k < 0.33 ? 'ok' : k < 0.66 ? 'upd' : 'bad'}" style="height:${Math.max(3, (p - Math.min(0, lo)) / span * 100)}%" title="${hm(t)}: € ${nl(p, 3)}"></i>`; }).join('')}</div><div class="en-ax"><span>00</span><span>06</span><span>12</span><span>18</span>${show.length > 24 ? '<span>morgen</span><span>06</span><span>12</span><span>18</span>' : ''}</div>` : '';
  return `<div class="panel glass w-lab">${wHead('Stroomprijs', cur ? pill(cur[1] <= (lo + hi) / 2 ? 'ok' : 'upd', `€ ${nl(cur[1], 2)} nu`) : '')}<div class="sub">${best ? `Goedkoopst: ${hm(best[0])}–${hm(new Date(+best[0] + 3 * 36e5))} (€ ${nl(best[1], 2)})` : ''}${d.gas != null && R.w >= 330 ? ` · gas € ${nl(d.gas, 2)}/m³` : ''}</div>${bars}${R.h >= 230 ? `<div class="sub fine">${esc(d.note)}</div>` : ''}</div>`;
}


// ================================================================ info
const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
function wKlok(sz = SZ0) {
  const now = new Date(), R = room(sz, 0), withDate = R.h >= 78, withSub = R.h >= 140;
  const fs = Math.max(26, Math.min((R.h - (withDate ? 30 : 0) - (withSub ? 24 : 0)) * 0.95, R.w / 3.4, 130));
  const doy = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 1)) / 864e5) + 1;
  const h = (((S.d.vrij || {}).holidays) || [])[0];
  return `<div class="panel glass w-klok"><div class="wc-time" style="font-size:${Math.round(fs)}px">${hm(now)}<small>${pad(now.getSeconds())}</small></div>${withDate ? `<div class="wc-date">${now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}${withSub ? `<div class="sub">Week ${isoWeek(now)} · dag ${doy}${h ? ` · ${esc(h.name)} ${inDays(daysTo(h.date))}` : ''}</div>` : ''}</div>`;
}
setInterval(() => { document.querySelectorAll('.wc-time').forEach(el => { const n = new Date(); el.innerHTML = `${hm(n)}<small>${pad(n.getSeconds())}</small>`; }); }, 1000);

function wVrij(sz = SZ0) {
  const d = S.d.vrij; if (!d) return wMsg('Vrije dagen', S.err.vrij ? 'Niet bereikbaar' : 'Laden…');
  const R = room(sz, 36), two = R.w >= 480, n = two ? fitN(R.h - 30, 41) : fitN(R.h - 60, 41);
  const hol = d.holidays.map(h => ({ title: h.name, sub: shortDate(h.date), right: `<small>${inDays(daysTo(h.date))}</small>` }));
  const vac = d.vacations.map(v => { const s = daysTo(v.start), now = s <= 0; return { title: v.name, sub: `${shortDate(v.start)} – ${shortDate(v.end)}`, right: now ? '<span class="tag ok">nu</span>' : `<small>${inDays(s)}</small>`, cls: now ? 'fav' : '' }; });
  const blk = (t, l, k) => `<div><div class="bn-h">${t}</div>${listRows(l, k)}</div>`;
  return `<div class="panel glass w-lab">${wHead('Vrije dagen', '', two ? `schoolvakanties regio ${esc(d.region)}` : '')}<div class="li-cols" style="--cols:${two ? 2 : 1}">${two ? blk('Feestdagen', hol, n) + blk('Schoolvakanties', vac, n) : blk('Feestdagen', hol, Math.ceil(n / 2)) + (n >= 2 ? blk(`Schoolvakanties (${esc(d.region)})`, vac, Math.floor(n / 2)) : '')}</div></div>`;
}

function wMarkt(sz = SZ0) {
  const d = S.d.markt; if (!d) return wMsg('Markten', S.err.markt ? 'Niet bereikbaar' : 'Laden…');
  const R = room(sz, 36), cols = Math.max(1, Math.min(3, fitN(R.w + 20, 280))), n = Math.max(1, fitN(R.h, 40)) * cols, cw = (R.w - (cols - 1) * 20) / cols;
  const sw = Math.max(0, Math.min(110, cw - 190));
  const fmt = m => m.cur === 'EUR' && m.sym !== '^AEX' ? `€ ${nl(m.price, m.price < 100 ? 2 : 0)}` : nl(m.price, m.price < 10 ? 4 : m.price < 1000 ? 2 : 0);
  const rows = d.markets.slice(0, n).map(m => `<div class="mk"><span class="mk-n">${esc(m.name)}</span>${sw >= 40 ? spark(m.spark, sw, 26, m.chg >= 0 ? 'up' : 'dn') : ''}<span class="mk-p"><b>${fmt(m)}</b><small class="${m.chg >= 0 ? 'up' : 'dn'}">${m.chg == null ? '' : (m.chg >= 0 ? '+' : '') + nl(m.chg, 2) + '%'}</small></span></div>`).join('');
  return `<div class="panel glass w-lab">${wHead('Markten', '', R.h >= 160 ? '5 dagen, vertraagd' : '')}<div class="li-cols" style="--cols:${cols}">${rows}</div></div>`;
}

function wFoto(sz = SZ0) {
  const d = S.d.foto; if (!d) return wMsg('Foto van de dag', S.err.foto ? 'Niet bereikbaar' : 'Laden…');
  const [t, by] = (d.copyright || '').split(/ \(©/);
  return `<a class="panel glass w-foto" href="${url(d.link || d.url)}" target="_blank" rel="noopener" style="background-image:url('${url(d.url)}')"><span class="wf-c"><b>${esc(t || d.title)}</b>${by && sz.H >= 160 ? `<small>© ${esc(by.replace(/\)$/, ''))}</small>` : ''}</span></a>`;
}

// ================================================================ sport
function wF1Stand(sz = SZ0) {
  const d = S.d.f1stand; if (!d) return wMsg('F1-kampioenschap', S.err.f1stand ? 'Niet bereikbaar' : 'Laden…');
  const R = room(sz, 36), two = R.w >= 520, n = fitN(R.h - 26, 28);
  const lead = (d.drivers[0] || {}).pts || 1, tl = (d.teams[0] || {}).pts || 1;
  const row = (pos, name, pts, max, color, fav) => `<div class="f1r${fav ? ' fav' : ''}"><span class="pos">${pos}</span><i class="tm" style="background:${color}"></i><span class="f1r-n">${esc(name)}</span><span class="f1r-bar"><i style="width:${Math.max(2, pts / max * 100)}%;background:${color}"></i></span><b>${nl(pts)}</b></div>`;
  const tc = name => { const k = (name || '').toLowerCase().replace(/ f1 team| racing|scuderia /g, '').replace(/\s+/g, '_'); return (typeof TEAM !== 'undefined' && (TEAM[k] || TEAM[k.split('_')[0]])) || '#888'; };
  const drv = d.drivers.slice(0, n).map(x => row(x.pos, R.w < 300 ? x.code || x.name : x.name, x.pts, lead, tc(x.team), typeof F1FAV !== 'undefined' && x.name.includes(F1FAV.split(' ').pop())));
  const tms = d.teams.slice(0, n).map(x => row(x.pos, x.name, x.pts, tl, tc(x.name)));
  return `<div class="panel glass w-lab">${wHead(R.w < 260 ? 'F1' : 'F1-kampioenschap', R.w >= 230 ? pill('', `na ronde ${esc(d.round)}`) : '')}<div class="li-cols" style="--cols:${two ? 2 : 1}"><div><div class="bn-h">Coureurs</div>${drv.join('')}</div>${two ? `<div><div class="bn-h">Constructeurs</div>${tms.join('')}</div>` : ''}</div></div>`;
}

// ================================================================ register
const STORE_WIDGETS = {
  lucht: { name: 'Luchtkwaliteit', cat: 'Weer', desc: 'Fijnstof, UV en pollen bij jou in de buurt (Open-Meteo)', w: 4, h: 4, minW: 2, minH: 2, data: ['lucht'], f: wLucht },
  warn: { name: 'Weerwaarschuwingen', cat: 'Weer', desc: 'Code geel/oranje/rood van het KNMI', w: 4, h: 3, minW: 2, minH: 2, data: ['waarschuwing'], f: wWarn },
  sun: { name: 'Zon & maan', cat: 'Weer', desc: 'Zonsopkomst en -ondergang, daglicht en maanfase', w: 4, h: 3, minW: 2, minH: 2, data: ['weer'], f: wSun },
  energie: { name: 'Stroomprijs', cat: 'Thuis', desc: 'Dynamische stroomprijs per uur, goedkoopste moment', w: 6, h: 3, minW: 2, minH: 2, data: ['energie'], f: wEnergie },
  vrij: { name: 'Vrije dagen', cat: 'Thuis', desc: 'Feestdagen en schoolvakanties in je regio', w: 4, h: 4, minW: 2, minH: 2, data: ['vrij'], f: wVrij },
  klok: { name: 'Klok & datum', cat: 'Thuis', desc: 'Grote klok met weeknummer', w: 4, h: 2, minW: 2, minH: 2, data: ['vrij'], f: wKlok },
  markt: { name: 'Markten', cat: 'Thuis', desc: 'AEX, S&P 500, bitcoin, euro/dollar en goud', w: 4, h: 4, minW: 2, minH: 2, data: ['markt'], f: wMarkt },
  foto: { name: 'Foto van de dag', cat: 'Thuis', desc: 'Elke dag een andere mooie foto (Bing)', w: 4, h: 3, minW: 2, minH: 2, data: ['foto'], f: wFoto },
  'stand-pl': { name: 'Stand Premier League', cat: 'Sport', desc: 'De Engelse ranglijst', w: 4, h: 6, minW: 2, minH: 2, data: ['premierleague'], f: sz => wStandOf('premierleague', 'pl', 'Premier League', sz) },
  'stand-cl': { name: 'Stand Champions League', cat: 'Sport', desc: 'De competitiefase, je club gemarkeerd', w: 4, h: 6, minW: 2, minH: 2, data: ['championsleague'], f: sz => wStandOf('championsleague', 'cl', 'Champions League', sz) },
  f1stand: { name: 'F1-kampioenschap', cat: 'Sport', desc: 'Stand coureurs en constructeurs', w: 6, h: 5, minW: 2, minH: 2, data: ['f1stand'], f: wF1Stand },
};
// verversen: per bron eigen tempo (sec); bronnen met een eigen timer in app.js staan er niet in
const REFRESH = Object.assign({ lucht: 1800, waarschuwing: 600, energie: 900, vrij: 43200, markt: 600, foto: 3600, f1stand: 3600 },
  Object.fromEntries(FEED_LIST.map(f => [f.id, 600])));
const _rfLast = {};
setInterval(() => {
  if (typeof H === 'undefined' || S.tab !== 'home' || document.hidden) return;
  const now = Date.now();
  homeData().filter(n => REFRESH[n]).forEach(n => {
    if (!_rfLast[n]) { _rfLast[n] = now; return; }
    if (now - _rfLast[n] >= REFRESH[n] * 1000) { _rfLast[n] = now; load(n); }
  });
}, 30e3);
