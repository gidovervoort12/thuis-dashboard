// Thuis-dashboard. Data: /api/<naam> (server.py). Instellingen (club, F1-favoriet): window.DASH uit /config.js.
'use strict';
const CFG = Object.assign({ club: 'PSV', f1: 'Max Verstappen' }, window.DASH || {});
const CLUB = CFG.club || null;

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const url = u => /^https?:\/\//.test(u || '') ? esc(u) : '#';
const pad = n => String(n).padStart(2, '0');
const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const store = {
  get(k, d) { try { const v = localStorage.getItem('dash-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dash-' + k, JSON.stringify(v)); } catch (e) { /* privévenster */ } }
};
const ic = p => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const CHECK = ic('<path d="M5 12.5l4.5 4.5L19 7.5"></path>');

const TABS = ['home', 'nieuws', 'sport'];
const S = {
  tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home',   // startpagina = Home
  src: 'alles', more: {}, comp: store.get('comp', 'ere'), d: {}, err: {}, loadedAt: null
};

S.ready = false;   // pas tonen (en één keer infaden) als de eerste data binnen is
const ANIM = '.glass:not(.sec-h .glass):not(.newsbar .glass), .sec-h, .group > h3';

// ---------------------------------------------------------------- data
async function load(name, path) {
  try {
    const r = await fetch(path || '/api/' + name, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    S.d[name] = await r.json(); delete S.err[name];
  } catch (e) {
    S.err[name] = e.message || 'fout';
  }
  S.loadedAt = new Date();
  render();
}
const NEWS = [
  { id: 'nos', name: 'NOS', hue: 22 }, { id: 'voetbalzone', name: 'Voetbalzone', hue: 150 },
  { id: 'tweakers', name: 'Tweakers', hue: 350 }
];
const COMPS = [['ere', 'eredivisie', 'Eredivisie'], ['pl', 'premierleague', 'Premier League'], ['cl', 'championsleague', 'Champions League'], ['f1', 'f1', 'Formule 1']];
const loadNews = () => Promise.all(NEWS.map(n => load(n.id)));
const loadSport = () => Promise.all(COMPS.map(c => load(c[1])));

// ---------------------------------------------------------------- kop
function tickHeader() {
  const now = new Date(), h = now.getHours();
  $('#date').textContent = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#clock').textContent = hm(now);
  document.querySelectorAll('.cd[data-at]').forEach(cd => { cd.innerHTML = countdown(+cd.dataset.at); });
}

const WX = {
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"></path>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"></path>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 11 3.5 3.5 0 0 0 7 18z"></path>',
  rain: '<path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 8 3.5 3.5 0 0 0 7 15z"></path><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"></path>',
  snow: '<path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 8 3.5 3.5 0 0 0 7 15z"></path><path d="M8 19h.01M12 20h.01M16 19h.01"></path>',
  fog: '<path d="M4 10h16M6 14h12M8 18h8"></path>',
  storm: '<path d="M7 14h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 7 3.5 3.5 0 0 0 7 14z"></path><path d="M12 15l-2 4h4l-2 4"></path>'
};
function wxInfo(code, day) {
  if (code === 0) return [day ? 'sun' : 'moon', 'Helder'];
  if (code <= 2) return [day ? 'sun' : 'moon', 'Licht bewolkt'];
  if (code === 3) return ['cloud', 'Bewolkt'];
  if (code <= 48) return ['fog', 'Mist'];
  if (code <= 57) return ['rain', 'Motregen'];
  if (code <= 67) return ['rain', 'Regen'];
  if (code <= 77) return ['snow', 'Sneeuw'];
  if (code <= 82) return ['rain', 'Buien'];
  if (code <= 86) return ['snow', 'Sneeuwbuien'];
  return ['storm', 'Onweer'];
}
// weer staat linksboven (waar vroeger de begroeting stond). Brede schermen: tabbalk in dezelfde rij als weer en klok,
// smaller: tabbalk eronder (mobiel: vast onderaan, via CSS)
const navMq = matchMedia('(min-width:1101px)');
function placeNav() {
  const nav = $('.navwrap'), top = $('header.top');
  if (navMq.matches && nav.parentNode !== top) top.insertBefore(nav, $('.top-r'));
  else if (!navMq.matches && nav.parentNode === top) top.after(nav);
  placeNavInd(true);
}
navMq.addEventListener('change', placeNav);
const placeWx = () => {};
// "Droog tot 16:00, daarna regen": eerste 2 uur Buienradar (5 min), daarna Open-Meteo per uur (nat = kans >= 50%)
function rainOutlook(w) {
  if (!w) return null;
  const now = Date.now(), line = [];
  (w.rain || []).forEach(r => {
    const [hh, mm] = r.time.split(':').map(Number), d = new Date(); d.setHours(hh, mm, 0, 0);
    if (d.getTime() < now - 30 * 60e3) d.setDate(d.getDate() + 1);
    line.push({ t: d.getTime(), wet: r.mm >= 0.1, maybe: false });
  });
  const radarEnd = line.length ? line[line.length - 1].t + 5 * 60e3 : now;
  (w.hourly || []).forEach(h => {
    const t = new Date(h.time).getTime();
    if (t >= radarEnd - 30 * 60e3 && t > now - 60 * 60e3) line.push({ t, wet: h.pop >= 50, maybe: h.pop >= 30 });
  });
  if (!line.length) return null;
  const at = t => { const d = new Date(t), tom = new Date(); tom.setDate(tom.getDate() + 1);
    return (d.toDateString() === tom.toDateString() ? 'morgen ' : '') + hm(d); };
  const firstFrom = (i, f) => { for (let j = i; j < line.length; j++) if (f(line[j])) return j; return -1; };
  if (line[0].wet || (line[1] && line[1].wet)) {
    const dry = firstFrom(1, x => !x.wet);
    return { wet: true, short: dry < 0 ? 'regen' : `regen tot ${at(line[dry].t)}`,
      long: dry < 0 ? 'Regen, voorlopig niet droog' : `Regen tot ${at(line[dry].t)}, daarna droog` };
  }
  const w1 = firstFrom(0, x => x.wet);
  if (w1 < 0) {
    const m = firstFrom(0, x => x.maybe);
    return m < 0 ? { short: 'droog', long: 'Droog de komende 24 uur' }
      : { short: `droog, ${at(line[m].t)} kans op bui`, long: `Droog, vanaf ${at(line[m].t)} kans op een bui` };
  }
  const d2 = firstFrom(w1, x => !x.wet), soon = line[w1].t - now < 60 * 60e3;
  const start = soon ? `over ${Math.max(5, Math.round((line[w1].t - now) / 60e3 / 5) * 5)} min` : at(line[w1].t);
  return { soon, short: soon ? `regen ${start}` : `droog tot ${start}`,
    long: (soon ? `Droog, ${start} regen` : `Droog tot ${start}, daarna regen`) + (d2 > 0 ? ` tot ${at(line[d2].t)}` : '') };
}
function renderWeather() {
  placeWx();
  const w = S.d.weer, el = $('#wx');
  if (!w || !w.current) { el.hidden = true; return; }
  const c = w.current, t = w.daily && w.daily[0], [icon, txt] = wxInfo(c.code, c.day);
  const ro = rainOutlook(w);
  const extra = ro && (ro.wet || ro.soon) ? esc(ro.short) : t ? `${Math.round(t.max)}° / ${Math.round(t.min)}°` : '';
  el.innerHTML = `<span class="wx-ic">${ic(WX[icon])}</span><b>${Math.round(c.temp)}°</b><span class="wx-t"><span>${esc(txt)}</span><small>${extra ? extra + ' · ' : ''}${esc(w.place || '')}</small></span>`;
  el.title = `${w.place}: voelt als ${Math.round(c.feels)}°, wind ${Math.round(c.wind)} km/u`;
  el.hidden = false;
}

// ---------------------------------------------------------------- nieuws
const srcAt = dir => { const i = NEWS.findIndex(n => n.id === S.src); return NEWS[(i + dir + NEWS.length) % NEWS.length]; };
const arrow = dir => { const t = srcAt(dir); return `<button class="btn icon arrow" type="button" data-act="slide" data-v="${dir}" aria-label="${dir < 0 ? 'Vorige' : 'Volgende'}: ${esc(t.name)}" title="${esc(t.name)}">${ic(dir < 0 ? '<path d="M15 5l-7 7 7 7"></path>' : '<path d="M9 5l7 7-7 7"></path>')}</button>`; };
function slide(dir) { if (S.tab !== 'nieuws' || S.src === 'alles') return; S.src = srcAt(dir).id; S.slideDir = dir; render(); S.slideDir = null; }
function viewNieuws() {
  const chips = [{ id: 'alles', name: 'Alles' }].concat(NEWS).map(c =>
    `<button class="chip${S.src === c.id ? ' on' : ''}" aria-pressed="${S.src === c.id}" data-act="src" data-v="${c.id}" type="button">${c.hue != null ? `<span class="dot" style="background:hsl(${c.hue} 75% 58%)"></span>` : ''}${esc(c.name)}</button>`).join('');
  const single = S.src !== 'alles';
  const cards = NEWS.filter(n => !single || n.id === S.src).map(n => {
    const d = S.d[n.id], items = (d && d.items) || [], open = single || !!S.more[n.id];
    const list = items.slice(0, single ? 30 : open ? 12 : 5).map((a, i) => {
      const h = n.hue + i * 23;
      const bg = a.image ? `background-image:url('${url(a.image)}')` : `background:linear-gradient(140deg,hsl(${h} 70% 60%),hsl(${h + 40} 60% 30%))`;
      return `<a class="art${S.moreAnim === n.id && i >= 5 ? ' fade' : ''}" href="${url(a.link)}" target="_blank" rel="noopener"><div class="thumb" style="${bg}" role="img" aria-label="Afbeelding bij artikel"></div><div style="min-width:0"><div class="art-t">${esc(a.title)}</div><div class="art-m">${esc(a.time)}</div></div></a>`;
    }).join('') || `<div class="art-m" style="padding:10px 0">${S.err[n.id] ? 'Kon feed niet laden' : 'Laden…'}</div>`;
    return `<article class="card glass${single ? ' single' : ''}"><div class="card-h"><span class="dot" style="background:hsl(${n.hue} 75% 58%)"></span><h3>${esc(n.name)}</h3><span class="n">${items.length} artikelen</span></div><div class="arts">${list}</div>${!single && items.length > 5 ? `<button class="btn more" type="button" data-act="more" data-v="${n.id}">${open ? 'Toon minder' : 'Toon meer'}</button>` : ''}</article>`;
  }).join('');
  return `<section style="display:flex;flex-direction:column;gap:20px" aria-label="Nieuws">
<div class="newsbar"><div class="seg glass" role="group" aria-label="Filter op bron">${chips}</div></div>
${single ? `<div class="slider${S.slideDir ? (S.slideDir > 0 ? ' from-r' : ' from-l') : ''}">${arrow(-1)}${cards}${arrow(1)}</div>` : `<div class="news-grid${S.slideDir ? (S.slideDir > 0 ? ' from-r' : ' from-l') : ''}">${cards}</div>`}</section>`;
}

// ---------------------------------------------------------------- sport
const FAV = { ere: CLUB, cl: CLUB, pl: CLUB };
const ZONE = {
  'Champions League': ['z-cl', 'Champions League'], 'Champions League qualifying': ['z-clq', 'CL-voorronde'],
  'Europa League': ['z-eu', 'Europa League'], 'Europa League qualifying': ['z-euq', 'EL-voorronde'],
  'Conference League': ['z-eu', 'Conference League'], 'Conference League qualifying': ['z-euq', 'ECL-voorronde'],
  'Relegation playoffs': ['z-po', 'Play-offs degradatie'], 'Relegation': ['z-dg', 'Degradatie'],
  'Qualifies for round of 16': ['z-cl', 'Achtste finale'], 'Knockout phase playoffs - seeded': ['z-po', 'Play-offs (geplaatst)'],
  'Knockout phase playoffs - unseeded': ['z-po', 'Play-offs (ongeplaatst)'], 'Eliminated': ['z-dg', 'Uitgeschakeld']
};
// Eredivisie: ESPN gebruikt nog de oude verdeling (6 tickets). Seizoen 2026/27 heeft er 5 (KNVB-reglement):
// 1 CL, 2 CL-voorronde, 3 EL-voorronde, 4-7 play-offs om een ECL-voorrondeticket. Bekerwinnaar kan dat nog verschuiven.
const ERE_ZONE = { 1: ['z-cl', 'Champions League'], 2: ['z-clq', 'CL-voorronde'], 3: ['z-euq', 'EL-voorronde'],
  4: ['z-po', 'Play-offs Europees ticket'], 5: ['z-po', 'Play-offs Europees ticket'], 6: ['z-po', 'Play-offs Europees ticket'], 7: ['z-po', 'Play-offs Europees ticket'],
  16: ['z-dg', 'Play-offs degradatie'], 17: ['z-dg', 'Degradatie'], 18: ['z-dg', 'Degradatie'] };
const zoneFor = (key, r) => key === 'ere' ? ERE_ZONE[+r.rank] || null : zoneOf(r.note);
const zoneOf = note => ZONE[note] || (/relegation/i.test(note) ? ['z-dg', note] : /champions/i.test(note) ? ['z-cl', note] : /europa|conference/i.test(note) ? ['z-eu', note] : note ? ['z-po', note] : null);
const crest = (logo, name) => logo ? `<span class="crest logo"><img src="${url(logo)}" alt="" loading="lazy"></span>` : `<span class="crest" style="background:#888;color:#fff">${esc((name || '?').slice(0, 3).toUpperCase())}</span>`;
const dayLabel = d => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - t) / 864e5);
  return diff === 0 ? 'Vandaag' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gisteren' : new Date(d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
};
const goals = (m, side) => (m.goals || []).filter(g => g.side === side).map(g => `${g.name} ${g.min}${g.pen ? ' (p)' : ''}${g.og ? ' (e.d.)' : ''}`).join(', ') || '–';

function matchRow(m, fav, withGoals, comp) {
  const isFav = fav && (m.home.name === fav || m.away.name === fav), live = m.state === 'in';
  const mid = m.state === 'pre' ? hm(new Date(m.date)) : `${esc(m.home.score)} – ${esc(m.away.score)}`;
  const sub = live ? `<small><span class="pulse"></span>LIVE ${esc(m.detail)}</small>` : m.state === 'post' && m.detail && m.detail !== 'FT' ? `<small class="ft">${esc(m.detail)}</small>` : '';
  const click = comp && m.id ? ` data-act="match" data-v="${esc(comp)}:${esc(m.id)}" role="button" tabindex="0" title="Opstellingen en details"` : '';
  return `<div class="match${isFav ? ' fav' : ''}${live ? ' live' : ''}${click ? ' click' : ''}"${click}>
<div class="side h"><span>${esc(m.home.name)}</span>${crest(m.home.logo, m.home.name)}</div>
<div class="mid">${mid}${sub}</div>
<div class="side">${crest(m.away.logo, m.away.name)}<span>${esc(m.away.name)}</span></div>
${withGoals ? `<div class="scorers"><div class="h">${esc(goals(m, 'home'))}</div><div></div><div>${esc(goals(m, 'away'))}</div></div>` : ''}</div>`;
}
const leaders = (list, fav) => (list || []).slice(0, 10).map(p =>
  `<div class="rank${fav && p.team === fav ? ' fav' : ''}"><span class="p">${p.rank}</span><div><div class="nm">${esc(p.name)}</div><div class="cl">${esc(p.team)}</div></div><span class="v">${esc(p.value)}</span></div>`).join('');

// Volgende (of lopende) wedstrijd van de favoriet, met aftelling — zoals bij F1
function favHero(key, ms, fav) {
  if (!fav) return '';
  const m = ms.find(x => x.state !== 'post' && (x.home.name === fav || x.away.name === fav));
  if (!m) return '';
  const at = new Date(m.date).getTime(), live = m.state === 'in', home = m.home.name === fav;
  const comp = (COMPS.find(c => c[0] === key) || [])[2];
  const comp0 = COMPS.find(c => c[0] === key), table = ((comp0 && S.d[comp0[1]]) || {}).standings || [];
  const rank = t => {   // plek op de ranglijst, gekleurd zoals in de stand (CL/Europa/degradatie)
    const r = table.find(x => x.team === t.name);
    if (!r) return '';
    const z = zoneFor(key, r);
    return `<span class="pos fx-rank ${z ? z[0] : 'z-none'}" title="${esc(`${r.rank}e in de ${comp0[2]} · ${r.points} punten${z ? ' · ' + z[1] : ''}`)}">${esc(r.rank)}</span>`;
  };
  const team = t => `<span class="fx-team"><span class="fx-crest">${crest(t.logo, t.name).replace('class="crest', 'class="crest big')}${rank(t)}</span><span>${esc(t.name)}</span></span>`;
  const right = live
    ? `<div class="fx-live"><b>${esc(m.home.score)} – ${esc(m.away.score)}</b><small><span class="pulse"></span>LIVE ${esc(m.detail)}</small></div>`
    : `<div class="cd" role="timer" aria-label="Aftelling tot de wedstrijd" id="cd" data-at="${at}">${countdown(at)}</div>`;
  return `<div class="fx-hero glass click" data-act="match" data-v="${esc(compOf(key))}:${esc(m.id)}" role="button" tabindex="0" title="Opstellingen en details"><div><div class="eyebrow">${live ? 'Nu bezig' : 'Volgende wedstrijd'} · ${esc(fav)} · ${esc(comp)}</div>
<div class="fx-vs">${team(m.home)}<span class="fx-dash">–</span>${team(m.away)}</div>
<div class="sub">${esc(when(m.date))} · ${home ? 'thuis' : 'uit'}</div></div>${right}</div>`;
}

function viewFootball(key, d) {
  const fav = FAV[key];
  const rows = d.standings.map(r => {
    const z = zoneFor(key, r);
    return `<tr class="${r.team === fav ? 'fav' : ''}"><td class="l"><span class="pos ${z ? z[0] : 'z-none'}">${r.rank}</span></td><td class="l"><div class="club">${crest(r.logo, r.team)}${esc(r.team)}</div></td><td>${esc(r.played)}</td><td>${esc(r.won)}</td><td>${esc(r.draw)}</td><td>${esc(r.lost)}</td><td>${esc(r.gd)}</td><td class="pts">${esc(r.points)}</td></tr>`;
  }).join('');
  const leg = {};
  d.standings.forEach(r => { const z = zoneFor(key, r); if (z) (leg[z[0]] = leg[z[0]] || []).includes(z[1]) || leg[z[0]].push(z[1]); });
  const legend = Object.entries(leg).map(([c, l]) => `<span class="lg"><i class="${c}"></i>${esc(l.join(' / '))}</span>`).join('');
  const ms = (d.matches || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const coming = ms.filter(m => m.state !== 'post').slice(0, 8);
  const groups = [];
  coming.forEach(m => { const l = m.state === 'in' ? 'Nu live' : dayLabel(m.date); const g = groups.find(x => x.l === l); g ? g.m.push(m) : groups.push({ l, m: [m] }); });
  const fixtures = groups.map(g => `<div class="day">${esc(g.l)}</div>` + g.m.map(m => matchRow(m, fav, false, compOf(key))).join('')).join('') || '<div class="sub">Geen wedstrijden gepland</div>';
  const results = ms.filter(m => m.state === 'post').reverse().slice(0, 5).map(m => matchRow(m, fav, true, compOf(key))).join('') || '<div class="sub">Nog geen uitslagen</div>';
  return `<div style="display:flex;flex-direction:column;gap:20px">
<div class="sport-grid sg2">
<div class="panel glass"><h3>Stand</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">#</th><th class="l">Club</th><th>G</th><th>W</th><th>G</th><th>V</th><th>DS</th><th>Ptn</th></tr></thead><tbody>${rows}</tbody></table></div><div class="legend">${legend}</div></div>
<div class="col">${favHero(key, ms, fav)}<div class="panel glass"><h3>Programma</h3>${fixtures}</div></div>
<div class="two"><div class="panel glass"><h3>Topscorers</h3>${leaders(d.scorers, fav)}</div><div class="panel glass"><h3>Assists</h3>${leaders(d.assists, fav)}</div></div>
<div class="panel glass"><h3>Uitslagen</h3>${results}</div>
</div>
</div>`;
}

const TEAM = { mercedes: '#27f4d2', red_bull: '#3671c6', mclaren: '#ff8000', ferrari: '#e8002d', aston_martin: '#229971', williams: '#64c4ff', rb: '#6692ff', alpine: '#ff87bc', haas: '#b6babd', audi: '#f50537', cadillac: '#a8a8a8' };
const F1FAV = CFG.f1 || '';
const when = iso => { const d = new Date(iso); return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hm(d); };
function countdown(at) {
  const s = Math.max(0, Math.floor((at - Date.now()) / 1000));
  return `<div><b>${Math.floor(s / 86400)}</b><span>dagen</span></div><div><b>${pad(Math.floor(s % 86400 / 3600))}</b><span>uur</span></div><div><b>${pad(Math.floor(s % 3600 / 60))}</b><span>min</span></div><div><b>${pad(s % 60)}</b><span>sec</span></div>`;
}
function f1Sub(d) { return `seizoen ${esc(d.season)} · na ronde ${esc(d.round)}${F1FAV ? ' · favoriet: ' + esc(F1FAV) : ''}`; }
function viewF1(d) {
  const now = Date.now(), races = d.races || [];
  const next = races.find(r => new Date(r.date).getTime() + 2 * 36e5 > now);
  const bar = (pts, max) => Math.max(2, Math.round(pts / max * 100));
  const maxD = +(d.drivers[0] || {}).points || 1, maxT = +(d.constructors[0] || {}).points || 1;
  const drv = (x, i, extra) => `<div class="drv${x.name === F1FAV ? ' fav' : ''}"><span class="p">${esc(x.rank || x.pos || i + 1)}</span><span class="tc" style="background:${TEAM[x.teamId] || '#888'}"></span><div class="who"><div class="nm">${esc(x.name || x.team)}</div>${extra}</div>`;
  const drivers = d.drivers.slice(0, 10).map((x, i) => drv(x, i, `<div class="bar"><i style="width:${bar(+x.points, maxD)}%;background:${TEAM[x.teamId] || '#888'}"></i></div>`) + `<span class="v">${esc(x.points)}</span></div>`).join('');
  const teams = d.constructors.map((x, i) => `<div class="drv"><span class="p">${esc(x.rank)}</span><span class="tc" style="background:${TEAM[x.teamId] || '#888'}"></span><div class="who"><div class="nm">${esc(x.team)}</div><div class="bar"><i style="width:${bar(+x.points, maxT)}%;background:${TEAM[x.teamId] || '#888'}"></i></div></div><span class="v">${esc(x.points)}</span></div>`).join('');
  const last = d.last ? d.last.results.slice(0, 10).map((x, i) => drv(x, i, `<div class="tm">${esc(x.team)}</div>`) + `<span class="v">${esc(x.time || '–')}</span></div>`).join('') : '';
  const cal = races.filter(r => !next || r.round >= next.round).slice(0, 5).map((r, i) =>
    `<div class="cal${i === 0 ? ' next' : ''}"><span class="r">R${r.round}</span><span class="nm">${esc(r.name.replace(/ Grand Prix$/, ''))}</span><span class="dt">${esc(new Date(r.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>`).join('') || '<div class="sub">Seizoen voorbij</div>';
  const sess = next ? (next.sessions || []).filter(s => /Kwalificatie|Sprint|Race/.test(s.name)).map(s => `<span>${esc(s.name)} <b>${esc(when(s.date))}</b></span>`).join('') : '';
  const hero = next ? `<div class="hero glass"><div><div class="eyebrow">Volgende race · ronde ${next.round} van ${races.length}</div><h3>${esc(next.name)}</h3><div class="sub">${esc(next.circuit)} · ${esc(next.place)}</div><div class="sess">${sess}</div></div><div class="cd" role="timer" aria-label="Aftelling tot de race" id="cd" data-at="${new Date(next.date).getTime()}">${countdown(new Date(next.date).getTime())}</div></div>`
    : `<div class="hero glass"><div><div class="eyebrow">Seizoen ${esc(d.season)}</div><h3>Geen races meer</h3></div></div>`;
  return `<div class="f1-grid">${hero}
<div class="panel glass"><h3>Kalender</h3>${cal}</div>
<div class="panel glass"><h3>Coureurs</h3>${drivers}</div>
<div class="panel glass"><h3>Constructeurs</h3>${teams}</div>
<div class="panel glass"><h3>Laatste uitslag · ${esc(d.last ? d.last.name.replace(/ Grand Prix$/, '') : '')}</h3>${last}</div></div>`;
}
function viewSport() {
  const c = COMPS.find(x => x[0] === S.comp) || COMPS[0], d = S.d[c[1]];
  const chips = COMPS.map(x => `<button class="chip${S.comp === x[0] ? ' on' : ''}" aria-pressed="${S.comp === x[0]}" data-act="comp" data-v="${x[0]}" type="button">${x[2]}</button>`).join('');
  let sub = '', body;
  if (!d) body = `<div class="${S.err[c[1]] ? 'err-box' : 'loading'} glass">${S.err[c[1]] ? 'Kon ' + c[2] + ' niet laden' : 'Laden…'}</div>`;
  else if (c[0] === 'f1') { sub = f1Sub(d); body = viewF1(d); }
  else {
    const season = (d.season || '').match(/^(\d{4})-(\d{2})/), md = Math.max(0, ...d.standings.map(r => +r.played || 0));
    sub = (c[0] === 'cl' ? `competitiefase · speeldag ${md} van 8` : `speelronde ${md}`) + (season ? ` · seizoen ${season[1]}/${season[2]}` : '') + (FAV[c[0]] ? ' · favoriet: ' + FAV[c[0]] : '');
    body = viewFootball(c[0], d);
  }
  return `<section aria-label="Sport" style="display:flex;flex-direction:column;gap:20px">
<div class="newsbar"><div class="seg glass" role="group" aria-label="Competitie">${chips}</div></div>${body}</section>`;
}

let toastT = null;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast glass' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 5000);
}

// ---------------------------------------------------------------- home: eigen widgets
// Nieuwe widget = functie die HTML teruggeeft + regel in HOME (id = plek in het raster, zie .home-grid in app.css).

function wPsv(sz = SZ0) {   // volgende wedstrijd van je club (CLUB) in Eredivisie, Premier League of Champions League, met aftelklok
  const all = [];
  if (!CLUB) return `<div class="panel glass"><h3>Mijn club</h3><div class="sub">Geen club ingesteld (DASH_CLUB).</div></div>`;
  [['ere', 'eredivisie'], ['pl', 'premierleague'], ['cl', 'championsleague']].forEach(([k, n]) => ((S.d[n] || {}).matches || []).forEach(m => all.push([k, m])));
  const isPsv = m => m.home.name === CLUB || m.away.name === CLUB;
  const next = all.filter(([, m]) => m.state !== 'post' && isPsv(m)).sort((a, b) => new Date(a[1].date) - new Date(b[1].date))[0];
  const last = all.filter(([, m]) => m.state === 'post' && isPsv(m)).sort((a, b) => new Date(b[1].date) - new Date(a[1].date))[0];
  let lastTxt = '';
  if (last) {
    const m = last[1], ps = m.home.name === CLUB ? +m.home.score : +m.away.score, op = m.home.name === CLUB ? +m.away.score : +m.home.score;
    const r = ps > op ? ['W', 'ok'] : ps < op ? ['V', 'bad'] : ['G', 'upd'];
    lastTxt = `<div class="h-last click" data-act="match" data-v="${esc(compOf(last[0]))}:${esc(m.id)}" role="button" tabindex="0" title="Opstellingen en details"><span class="cnt ${r[1]}">${r[0]}</span>Vorige: ${esc(m.home.name)} ${esc(m.home.score)}–${esc(m.away.score)} ${esc(m.away.name)} <span class="sub" style="margin:0">· ${esc(dayLabel(m.date))}</span></div>`;
  }
  if (!next) return `<div class="panel glass"><h3>${esc(CLUB)}</h3><div class="sub">${S.d.eredivisie ? 'Geen wedstrijd gepland.' : 'Laden…'}</div>${lastTxt}</div>`;
  // hoog blok: de wedstrijden daarna
  const nMore = sz.W < 700 ? fitN(sz.H - 36 - 330, 30) : fitN(sz.H - 36 - 190, 30);
  const later = all.filter(([, m]) => m.state === 'pre' && isPsv(m) && m !== next[1]).sort((a, b) => new Date(a[1].date) - new Date(b[1].date)).slice(0, nMore);
  const moreTxt = later.length ? `<div class="psv-next"><div class="bn-h">Daarna</div>${later.map(([k, m]) => { const home = m.home.name === CLUB, opp = home ? m.away : m.home;
    return `<div class="psv-n click" data-act="match" data-v="${esc(compOf(k))}:${esc(m.id)}" role="button" tabindex="0">${crest(opp.logo, opp.name)}<span class="psv-o">${esc(opp.name)} <small>${home ? 'thuis' : 'uit'} · ${esc((COMPS.find(c => c[0] === k) || [])[2] || '')}</small></span><b>${esc(when(m.date))}</b></div>`; }).join('')}</div>` : '';
  return favHero(next[0], [next[1]], CLUB).replace('</div></div>', `</div>${lastTxt}${moreTxt}</div>`);
}

const SZ0 = { W: 640, H: 640 };   // maat van een widget-blok in px (Home geeft de echte maat mee)
const fitN = (avail, unit) => Math.max(0, Math.floor(avail / unit));
const padOf = sz => Math.min(22, Math.max(14, 0.032 * Math.min(sz.W, sz.H)));   // zelfde als .hw>.panel padding (clamp 14–22 px)
const room = (sz, head = 34) => { const p = padOf(sz); return { w: sz.W - 2 * p, h: sz.H - 2 * p - head }; };   // binnenruimte onder de kop

function wWeek() {   // weer komende 7 dagen
  const w = S.d.weer, days = (w && w.daily) || [];
  if (!days.length) return `<div class="panel glass"><h3>Weer</h3><div class="sub">Laden…</div></div>`;
  const lo = Math.min(...days.map(d => d.min)), hi = Math.max(...days.map(d => d.max)), span = Math.max(1, hi - lo);
  const cells = days.map((d, i) => {
    const [icon, txt] = wxInfo(d.code, true), dt = new Date(d.date + 'T12:00');
    const name = i === 0 ? 'Vandaag' : i === 1 ? 'Morgen' : dt.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
    return `<div class="wk${i === 0 ? ' now' : ''}" title="${esc(txt)}"><span class="wk-d">${name}</span><span class="wk-i">${ic(WX[icon])}</span>
<span class="wk-p${d.pop >= 30 ? ' wet' : ''}">${d.pop >= 20 ? d.pop + '%' : ''}</span><b>${Math.round(d.max)}°</b>
<span class="wk-r"><i style="bottom:${(d.min - lo) / span * 100}%;top:${(hi - d.max) / span * 100}%"></i></span><small>${Math.round(d.min)}°</small></div>`;
  }).join('');
  const ro = rainOutlook(w), rk = ro ? (ro.wet || ro.soon ? 'wet' : /daarna regen/.test(ro.long) ? 'later' : /^Droog,/.test(ro.long) ? 'maybe' : 'dry') : '';
  const out = ro ? `<span class="wk-out ${rk}">${ic(rk === 'wet' ? WX.rain : rk === 'dry' ? WX.sun : WX.cloud)}${esc(ro.long)}</span>` : '';
  return `<div class="panel glass"><div class="up-head"><div><h3>Weer deze week</h3><div class="sub">${esc(w.place || '')}</div></div>${out}</div><div class="wk-row">${cells}</div></div>`;
}


// ---------------------------------------------------------------- extra widgets (alleen voor Home)
function wToday(sz = SZ0) {   // komende uren: zoveel als er in de breedte passen
  const w = S.d.weer, all = (w && w.hourly) || [];
  if (!all.length) return `<div class="panel glass"><h3>Komende uren</h3><div class="sub">Laden…</div></div>`;
  const n = Math.max(3, Math.min(all.length, fitN(room(sz).w + 6, 58))), hrs = all.slice(0, n), tall = sz.H >= 250, head = sz.H >= 180;
  const ro = rainOutlook(w);
  const cells = hrs.map(h => { const [icon] = wxInfo(h.code, h.day);
    return `<div class="td"><span class="td-h">${esc(h.time.slice(11, 16))}</span><span class="td-i">${ic(WX[icon])}</span><b>${Math.round(h.temp)}°</b>${tall ? `<span class="td-p"><i style="height:${Math.max(4, h.pop)}%"></i></span><small>${h.pop >= 10 ? h.pop + '%' : ''}</small>` : ''}</div>`; }).join('');
  return `<div class="panel glass w-today">${head ? `<div class="up-head"><div><h3>Komende ${n} uur</h3>${tall ? `<div class="sub">${ro ? esc(ro.long) : esc(w.place || '')}</div>` : ''}</div></div>` : ''}<div class="td-row" style="--n:${n}">${cells}</div></div>`;
}
const wStand = sz => wStandOf('eredivisie', 'ere', 'Eredivisie', sz);
function wStandOf(comp, key, title, sz = SZ0) {   // stand: in kolommen als het niet in één past; je club blijft altijd in beeld
  const d = S.d[comp], rows = (d && d.standings) || [];
  if (!rows.length) return `<div class="panel glass"><h3>${title}</h3><div class="sub">${d ? 'Geen stand' : 'Laden…'}</div></div>`;
  const R = room(sz, 36), perCol = Math.max(1, fitN(R.h, 30)), maxCols = Math.max(1, fitN(R.w + 22, 244));
  const cols = Math.min(maxCols, Math.ceil(rows.length / perCol)), n = Math.min(rows.length, perCol * cols);
  let start = 0;
  const pi = rows.findIndex(r => r.team === CLUB);
  if (pi >= n) start = Math.min(rows.length - n, pi - Math.floor(n / 2));
  const vis = rows.slice(start, start + n), narrow = R.w / cols < 270;
  const tr = r => { const z = zoneFor(key, r);
    return `<div class="st-r${r.team === CLUB ? ' fav' : ''}"><span class="pos ${z ? z[0] : 'z-none'}">${esc(r.rank)}</span>${crest(r.logo, r.team)}<span class="st-n">${esc(r.team)}</span><span class="st-g">${esc(r.played)}</span><span class="st-d">${esc(r.gd)}</span><b>${esc(r.points)}</b></div>`; };
  const colsHtml = Array.from({ length: cols }, (_, c) => `<div class="st-col">${vis.slice(c * perCol, (c + 1) * perCol).map(tr).join('')}</div>`).join('');
  return `<div class="panel glass w-stand${narrow ? ' narrow' : ''}"><div class="up-head"><div><h3>${title}</h3></div><span class="sub">${start ? `plek ${start + 1}–${start + n}` : n < rows.length ? `top ${n}` : `${rows.length} clubs`}</span></div><div class="st-cols" style="--cols:${cols}">${colsHtml}</div></div>`;
}
function wF1(sz = SZ0) {   // volgende F1-race; groter = sessietijden en top 3
  const d = S.d.f1, races = (d && d.races) || [];
  if (!d) return `<div class="panel glass"><h3>Formule 1</h3><div class="sub">Laden…</div></div>`;
  const next = races.find(r => new Date(r.date).getTime() + 2 * 36e5 > Date.now());
  if (!next) return `<div class="panel glass"><h3>Formule 1</h3><div class="sub">Seizoen ${esc(d.season)} is voorbij.</div></div>`;
  const at = new Date(next.date).getTime(), lead = (d.drivers || [])[0], wide = sz.W >= 620;
  let space = room(sz, 0).h - (wide ? 84 : 150);
  const sess = (next.sessions || []).filter(x => /Kwalificatie|Sprint|Race/.test(x.name));
  const sessH = 30 + sess.length * 26, topH = 30 + 3 * 28;
  const sessHtml = sess.length && space >= sessH ? (space -= sessH, `<div class="f1-x"><div class="bn-h">Sessies</div>${sess.map(x => `<div class="f1-s"><span>${esc(x.name)}</span><b>${esc(when(x.date))}</b></div>`).join('')}</div>`) : '';
  const topHtml = (d.drivers || []).length && space >= topH ? `<div class="f1-x"><div class="bn-h">Kampioenschap</div>${d.drivers.slice(0, 3).map((x, i) => `<div class="f1-s"><span>${i + 1}. ${esc(x.name)}</span><b>${esc(x.points)}</b></div>`).join('')}</div>` : '';
  const extra = sessHtml || topHtml ? `<div class="f1-xs${wide ? ' row' : ''}">${sessHtml}${topHtml}</div>` : '';
  return `<div class="panel glass w-f1${wide ? ' wide' : ''}"><div class="f1-top"><div class="f1-info"><div class="eyebrow">Formule 1 · ronde ${esc(next.round)} van ${races.length}</div><h3>${esc(next.name.replace(/ Grand Prix$/, ' GP'))}</h3><div class="sub">${esc(when(next.date))}${lead && !topHtml ? ` · leider: ${esc(lead.name)} (${esc(lead.points)})` : ''}</div></div><div class="cd" role="timer" data-at="${at}">${countdown(at)}</div></div>${extra}</div>`;
}
function wNews(id, sz = SZ0) {   // koppen van één nieuwsbron: 1–3 kolommen, zoveel als er passen
  const n = FEED_LIST.find(x => x.id === id) || NEWS.find(x => x.id === id) || { name: id, hue: 200 }, items = (S.d[id] || {}).items || [];
  const R = room(sz, 34), cols = Math.max(1, Math.min(3, fitN(R.w + 24, 330))), img = R.w / cols >= 330 && R.h >= 62 && items.slice(0, 10).filter(a => a.image).length >= 5;   // fotokolom alleen als de bron meestal plaatjes heeft
  const rowH = img ? 62 : 46, cnt = Math.min(items.length, Math.max(1, fitN(R.h, rowH)) * cols);
  const list = items.slice(0, cnt).map(a => `<a class="nw" href="${url(a.link)}" target="_blank" rel="noopener">${img ? (a.image ? `<span class="nw-i" style="background-image:url('${url(a.image)}')"></span>` : `<span class="nw-i nw-ph" style="--h:${n.hue}">${esc(n.name.slice(0, 1))}</span>`) : ''}<span class="nw-t">${esc(a.title)}</span><small>${esc(a.time)}</small></a>`).join('');
  return `<div class="panel glass w-news"><div class="up-head"><h3><span class="dot" style="background:hsl(${n.hue} 75% 58%)"></span>${esc(n.name)}</h3></div><div class="nw-list" style="--cols:${cols}">${list || '<div class="sub">Laden…</div>'}</div></div>`;
}

// ---------------------------------------------------------------- Home: eigen indeling (gridstack, 12 kolommen, rij = 70 px)
// Widget toevoegen: functie + regel in WIDGETS. w/h = standaardmaat, minW/minH = kleinste maat, data = welke /api-bronnen nodig zijn.
const WIDGETS = Object.assign({
  psv: { name: CLUB ? CLUB : 'Mijn club', cat: 'Sport', desc: 'Aftelklok naar de volgende wedstrijd van je club, met vorige uitslag', w: 8, h: 3, minW: 2, minH: 2, data: ['eredivisie', 'premierleague', 'championsleague'], f: wPsv },
  stand: { name: 'Stand Eredivisie', cat: 'Sport', desc: 'De ranglijst, je club gemarkeerd', w: 4, h: 6, minW: 2, minH: 2, data: ['eredivisie'], f: wStand },
  f1: { name: 'Formule 1', cat: 'Sport', desc: 'Volgende race met aftelling', w: 4, h: 3, minW: 2, minH: 2, data: ['f1'], f: wF1 },
  week: { name: 'Weer deze week', cat: 'Weer', desc: '7 dagen met regenverwachting', w: 8, h: 5, minW: 2, minH: 2, data: ['weer'], f: wWeek },
  today: { name: 'Komende uren', cat: 'Weer', desc: 'Temperatuur en regenkans per uur', w: 6, h: 4, minW: 2, minH: 2, data: ['weer'], f: wToday },
}, STORE_WIDGETS, Object.fromEntries(FEED_LIST.map(n => [`nieuws-${n.id}`, { name: n.name, cat: n.cat, desc: n.desc || `Laatste koppen van ${n.name}`, w: 4, h: 5, minW: 2, minH: 2, data: [n.id], f: sz => wNews(n.id, sz) }])));
const HOME_DEFAULT = [{ id: 'psv', x: 0, y: 0, w: 8, h: 3 }, { id: 'f1', x: 8, y: 0, w: 4, h: 3 }, { id: 'week', x: 0, y: 3, w: 8, h: 5 }, { id: 'nieuws-nos', x: 8, y: 3, w: 4, h: 5 }];
const DATA_LOAD = {};
const H = { el: null, grid: null, edit: false, items: (store.get('layout', null) || HOME_DEFAULT).filter(it => WIDGETS[it.id]), saved: store.get('layout-saved', 0), busy: false, saveT: 0, reqd: {}, store: null, confirm: false };
const homeData = () => [...new Set(H.items.flatMap(it => WIDGETS[it.id].data))];
function homeLoad() {   // alleen ophalen wat de widgets op Home nodig hebben (en nog niet binnen is)
  return Promise.all(homeData().filter(n => !(n in S.d) && !H.reqd[n]).map(n => { H.reqd[n] = 1; return (DATA_LOAD[n] || (() => load(n)))(); }));
}
function homeItemEl(it) {
  const W = WIDGETS[it.id], el = document.createElement('div');
  el.className = 'grid-stack-item';
  Object.entries({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h, 'min-w': W.minW, 'min-h': W.minH }).forEach(([k, v]) => { if (v != null) el.setAttribute('gs-' + k, v); });
  if (it.x == null) el.setAttribute('gs-auto-position', 'true');
  el.innerHTML = `<div class="grid-stack-item-content"><div class="hw hw-${it.id}"></div><button type="button" class="hw-x" data-act="hw-del" data-v="${it.id}" aria-label="${esc(W.name)} verwijderen" title="Verwijderen">${ic('<path d="M7 7l10 10M17 7L7 17"></path>')}</button></div>`;
  return el;
}
function homeApply(items) {   // indeling (opnieuw) opbouwen
  H.busy = true;
  H.grid.removeAll(true);
  H.grid.el.querySelectorAll(':scope > .grid-stack-item').forEach(el => el.remove());   // removeAll laat soms DOM achter
  H.grid.batchUpdate();
  items.filter(it => WIDGETS[it.id]).forEach(it => { const el = homeItemEl(it); H.grid.el.appendChild(el); H.grid.makeWidget(el); });
  H.grid.batchUpdate(false);
  H.busy = false;
  homeSync();
}
function homeSync() {   // huidige indeling uitlezen (volgorde = leesvolgorde, ook voor mobiel)
  H.items = H.grid.getGridItems().map(el => el.gridstackNode).filter(Boolean).map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w || 1, h: n.h || 1 })).sort((a, b) => a.y - b.y || a.x - b.x);
}
function homeSave() {
  if (H.busy || !H.edit) return;
  homeSync(); homeLoad().then(() => render());
  store.set('layout', H.items);
  clearTimeout(H.saveT);
  H.saveT = setTimeout(async () => {
    try {
      const r = await fetch('/api/layout', { method: 'POST', headers: { 'X-Dashboard': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ items: H.items }) });
      const j = await r.json();
      if (j.saved) { H.saved = j.saved; store.set('layout-saved', j.saved); S.d.layout = { items: j.items, saved: j.saved }; }
    } catch (e) { toast('Indeling niet opgeslagen op de server (wel op dit apparaat)'); }
  }, 700);
}
function homeMount() {
  const main = $('#main');
  if (!H.el) {
    H.el = document.createElement('section');
    H.el.className = 'home'; H.el.setAttribute('aria-label', 'Home');
    H.el.innerHTML = `<div class="grid-stack"></div><div class="home-bar"></div>`;
  }
  if (H.el.parentNode !== main) { main.innerHTML = ''; main.appendChild(H.el); }
  if (!H.grid) {
    H.grid = GridStack.init({ column: 12, cellHeight: 70, margin: 8, float: true, animate: true, staticGrid: true,
      resizable: { handles: 'se' }, draggable: { cancel: '.hw-x' }, columnOpts: { columnMax: 12 } }, H.el.querySelector('.grid-stack'));
    H.grid.on('change added removed', () => homeSave());
    H.grid.on('dragstart resizestart', () => { H.drag = true; });
    H.grid.on('dragstop resizestop', () => { H.drag = false; setTimeout(homeFill, 0); });
    H.grid.on('resize', (e, el) => { cancelAnimationFrame(_hwRaf); _hwRaf = requestAnimationFrame(() => homeFillOne(el)); });   // live meeschalen tijdens het trekken
    homeApply(H.items);
  }
  // indeling van de server (ander apparaat) overnemen als die nieuwer is
  const L = S.d.layout;
  if (!H.edit && L && L.items && (L.saved || 0) > (H.saved || 0)) { H.saved = L.saved; store.set('layout-saved', L.saved); store.set('layout', L.items); homeApply(L.items); homeLoad(); }
  homeFill();
}
const mobileMq = matchMedia('(max-width:760px)');
function boxSize(box, n) {   // maat van het blok in px; mobiel: breedte van het scherm, hoogte volgens de gekozen rijen
  const r = box.getBoundingClientRect();
  return { W: r.width || 600, H: mobileMq.matches ? (n.h || 4) * 70 - 16 : r.height || 400 };
}
function homeFillOne(el) {
  const id = el.getAttribute('gs-id'), W = WIDGETS[id], box = el.querySelector('.hw');
  if (W && box) try { hwRender(box, W, el.gridstackNode || {}); } catch (e) { /* volgende ronde */ }
}
function hwOver(box) {   // hoeveel px steekt de inhoud onder de binnenrand van het paneel uit (0 = past)
  const p = box.firstElementChild; if (!p) return 0;
  const r = p.getBoundingClientRect(), lim = r.bottom - parseFloat(getComputedStyle(p).paddingBottom || 0) + 1;
  let max = 0;
  for (const e of p.querySelectorAll('*')) { const b = e.getBoundingClientRect(); if (b.height && b.top < r.bottom + 400 && b.bottom > lim) max = Math.max(max, b.bottom - lim); }
  return Math.ceil(max);
}
// elk blok opnieuw tekenen zodra zijn echte maat verandert (ook na de animatie van gridstack en bij vensterresize)
const hwRO = new ResizeObserver(list => { for (const en of list) {
  const box = en.target, r = box.getBoundingClientRect(), key = Math.round(r.width) + 'x' + (mobileMq.matches ? '' : Math.round(r.height));
  if (box._sz === key) continue;
  const el = box.closest('.grid-stack-item'); if (el) homeFillOne(el);
} });
function hwRender(box, W, n) {   // tekenen; steekt er toch iets uit (schatting te krap), dan opnieuw met minder hoogte
  const sz = boxSize(box, n);
  box._sz = Math.round(sz.W) + 'x' + (mobileMq.matches ? '' : Math.round(sz.H));
  hwRO.observe(box);
  box.innerHTML = W.f(sz);
  if (mobileMq.matches) return;
  for (let i = 0, o; i < 3 && (o = hwOver(box)) > 0; i++) { sz.H -= o + 4; box.innerHTML = W.f(sz); }
}
let _hwRaf = 0;
window.addEventListener('resize', () => { if (S.tab !== 'home' || !H.grid) return; cancelAnimationFrame(_hwRaf); _hwRaf = requestAnimationFrame(homeFill); });
function homeFill() {   // inhoud per blok verversen; het grid zelf blijft staan
  if (!H.grid || H.drag) return;
  H.el.classList.toggle('editing', H.edit);
  H.grid.getGridItems().forEach(el => {
    const id = el.getAttribute('gs-id'), W = WIDGETS[id], box = el.querySelector('.hw'), n = el.gridstackNode || {};
    if (!W || !box) return;
    el.style.setProperty('--ord', (n.y || 0) * 12 + (n.x || 0));
    try { hwRender(box, W, n); } catch (e) { box.innerHTML = `<div class="panel glass"><h3>${esc(W.name)}</h3><div class="sub">Fout: ${esc(e.message)}</div></div>`; }
  });
  const used = new Set(H.items.map(it => it.id));
  H.el.querySelector('.home-bar').innerHTML = H.edit
    ? `<div class="hb-edit glass"><button type="button" class="btn acc" data-act="hw-store">${ic('<path d="M12 5v14M5 12h14"></path>')}Widget toevoegen</button><button type="button" class="btn${H.confirm ? ' danger' : ''}" data-act="hw-reset">${H.confirm ? 'Zeker?' : 'Standaard'}</button><button type="button" class="btn" data-act="hw-done">${CHECK}Klaar</button></div>`
    : `<button type="button" class="btn hb-open" data-act="hw-edit" aria-label="Home aanpassen" title="Home aanpassen: blokken verplaatsen, groter/kleiner maken, toevoegen of verwijderen">${ic('<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path>')}</button>`;
  if (H.store && !H.store.hidden) storeRender(used);
}
function homeEdit(on) {
  H.edit = on; H.confirm = false;
  H.grid.setStatic(!on);
  if (!on) storeClose();
  homeFill();
}
const STORE_CATS = ['Weer', 'Thuis', 'Sport', 'Nieuws', 'Regio', 'Tech', 'Homelab-nieuws', 'Sportnieuws', 'Internationaal'];
function storeRender(used) {   // kop (zoeken + categorieën) één keer; de lijst ververst bij typen/klikken
  const body = H.store.querySelector('.mbody');
  if (!body.querySelector('.ws-q')) {
    body.innerHTML = `<h3 class="ws-h">Widget toevoegen</h3><div class="sub">Klik om toe te voegen; daarna kun je hem verslepen en groter of kleiner trekken.</div><div class="ws-top"><input class="ws-q" type="search" placeholder="Zoek een widget of nieuwsbron…" aria-label="Zoek een widget"><div class="ws-chips"></div></div><div class="ws-list"></div>`;
    body.querySelector('.ws-q').addEventListener('input', () => storeRender());
    body.querySelector('.ws-chips').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { H.storeCat = b.dataset.c; storeRender(); } });
  }
  used = used || new Set(H.items.map(it => it.id));
  const q = body.querySelector('.ws-q').value.trim().toLowerCase(), cat = H.storeCat || 'Alles';
  const all = Object.entries(WIDGETS), cats = [...new Set(all.map(([, w]) => w.cat))].sort((a, b) => (STORE_CATS.indexOf(a) + 99) % 99 - (STORE_CATS.indexOf(b) + 99) % 99);
  body.querySelector('.ws-chips').innerHTML = ['Alles'].concat(cats).map(c => `<button type="button" class="ws-chip${c === cat ? ' on' : ''}" data-c="${esc(c)}">${esc(c)}<small>${c === 'Alles' ? all.length : all.filter(([, w]) => w.cat === c).length}</small></button>`).join('');
  const hit = ([, w]) => (cat === 'Alles' || w.cat === cat) && (!q || (w.name + ' ' + w.desc + ' ' + w.cat).toLowerCase().includes(q));
  const html = cats.map(c => { const l = all.filter(([, w]) => w.cat === c).filter(hit); return l.length ? `<div class="bn-h">${esc(c)}</div><div class="ws-grid">${l.map(([id, w]) =>
    `<button type="button" class="ws${used.has(id) ? ' on' : ''}" data-act="hw-add" data-v="${id}"${used.has(id) ? ' disabled' : ''}><b>${esc(w.name)}</b><small>${esc(w.desc)}</small><span class="ws-s">${used.has(id) ? `${CHECK}Staat op Home` : `${ic('<path d="M12 5v14M5 12h14"></path>')}Toevoegen`}</span></button>`).join('')}</div>` : ''; }).join('');
  body.querySelector('.ws-list').innerHTML = html || '<div class="ws-none">Niets gevonden.</div>';
}
function storeOpen() {
  if (!H.store) {
    const d = document.createElement('div');
    d.className = 'mwrap ws-wrap'; d.hidden = true;
    d.innerHTML = '<div class="mbox glass" role="dialog" aria-modal="true" aria-label="Widget toevoegen"><button type="button" class="btn icon m-x" aria-label="Sluiten">' + ic('<path d="M7 7l10 10M17 7L7 17"></path>') + '</button><div class="mbody"></div></div>';
    $('#app').appendChild(d);
    d.addEventListener('mousedown', e => { if (e.target === d) storeClose(); });
    d.querySelector('.m-x').addEventListener('click', storeClose);
    H.store = d;
  }
  H.store.hidden = false; document.body.classList.add('m-open');
  storeRender();
  setTimeout(() => { const q = H.store.querySelector('.ws-q'); if (q && !mobileMq.matches) q.focus(); }, 30);
}
function storeClose() { if (H.store) { H.store.hidden = true; document.body.classList.remove('m-open'); } }
function homeAdd(id) {
  const W = WIDGETS[id]; if (!W || H.items.some(it => it.id === id)) return;
  storeClose();
  const el = homeItemEl({ id, w: W.w, h: W.h });
  H.grid.el.appendChild(el); H.grid.makeWidget(el);
  homeSave(); homeFill();
  el.classList.add('hw-new'); setTimeout(() => el.classList.remove('hw-new'), 1600);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function homeDel(id) {
  const el = H.grid.getGridItems().find(x => x.getAttribute('gs-id') === id);
  if (el) { H.grid.removeWidget(el); homeSave(); homeFill(); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && H.edit && !document.body.classList.contains('m-open')) homeEdit(false); });

// ---------------------------------------------------------------- render + events
function applyTheme() {   // altijd donker (licht/donker-knop weg sinds v83)
  $('#app').className = 'app theme-dark';
  document.documentElement.classList.remove('light');
}
function render() {
  document.querySelectorAll('#nav .tab').forEach(b => { const on = b.dataset.tab === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  placeNavInd();
  renderWeather();
  // filterbalk: positie van het geselecteerde bolletje onthouden, zodat het na het opnieuw tekenen kan doorschuiven
  const from = S.ready && S.barTab === S.tab ? S.indPos : null;
  if (S.ready && S.tab === 'home') homeMount();
  else if (S.ready) $('#main').innerHTML = S.tab === 'sport' ? viewSport() : viewNieuws();
  const main = $('#main'), animate = S.ready && S.animNext;
  if (S.ready) { main.className = S.tabDir ? (S.tabDir > 0 ? 'from-r' : 'from-l') : animate ? 'enter' : ''; S.animNext = false; S.tabDir = 0; }
  if (animate) main.querySelectorAll(ANIM).forEach((el, i) => { el.style.animationDelay = Math.min(i, 14) * 35 + 'ms'; });
  S.moreAnim = null;
  if (S.ready) placeInd(from);
  tickHeader();
}
// hoofdbalk: één blijvend bolletje dat naar de gekozen tab schuift
function placeNavInd(instant) {
  const nav = $('#nav'), on = nav.querySelector('.tab.on');
  let ind = nav.querySelector('.seg-ind');
  if (!on) return;
  if (!ind) { ind = document.createElement('span'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); nav.prepend(ind); nav.classList.add('has-ind'); instant = true; }
  ind.classList.toggle('move', !instant);
  ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  ind.style.width = on.offsetWidth + 'px'; ind.style.height = on.offsetHeight + 'px';
}
window.addEventListener('resize', () => { placeNavInd(true); const i = document.querySelector('#main .newsbar .seg-ind'), on = document.querySelector('#main .newsbar .chip.on');
  if (i && on) { i.classList.remove('move'); i.style.transform = `translateX(${on.offsetLeft}px)`; i.style.width = on.offsetWidth + 'px'; S.indPos = { x: on.offsetLeft, w: on.offsetWidth }; } });
function placeInd(from) {
  const seg = document.querySelector('#main .newsbar .seg'), on = seg && seg.querySelector('.chip.on');
  S.barTab = S.tab; S.indPos = null;
  if (!seg || !on) return;
  seg.classList.add('has-ind');
  const ind = document.createElement('span');
  ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true');
  seg.prepend(ind);
  const to = { x: on.offsetLeft, w: on.offsetWidth };
  const set = p => { ind.style.transform = `translateX(${p.x}px)`; ind.style.width = p.w + 'px'; };
  if (from && (from.x !== to.x || from.w !== to.w)) {
    set(from);
    ind.getBoundingClientRect();          // eerst op de oude plek tekenen
    ind.classList.add('move');
  }
  set(to);
  S.indPos = to;
}
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { const d = TABS.indexOf(tab.dataset.tab) - TABS.indexOf(S.tab); if (!d) return; S.tabDir = d > 0 ? 1 : -1; S.tab = tab.dataset.tab; store.set('tab', S.tab); history.replaceState(null, '', '#' + S.tab); render(); scrollTo({ top: 0 }); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const v = a.dataset.v;
  switch (a.dataset.act) {
    case 'match': { const [c, id] = v.split(':'); mOpen(c, id); return; }
    case 'hw-edit': homeEdit(true); return;
    case 'hw-done': homeEdit(false); return;
    case 'hw-store': storeOpen(); return;
    case 'hw-add': homeAdd(v); return;
    case 'hw-del': homeDel(v); return;
    case 'hw-reset': if (!H.confirm) { H.confirm = true; homeFill(); return; } H.confirm = false; homeApply(HOME_DEFAULT); homeSave(); homeFill(); return;
    case 'more':    // 'Toon meer' opent die bron
    case 'src': {   // zelfde subtiele schuif als de pijltjes, richting volgt de volgorde in de balk
      const order = ['alles'].concat(NEWS.map(n => n.id)), d = order.indexOf(v) - order.indexOf(S.src);
      if (!d) return;
      S.src = v; S.slideDir = d > 0 ? 1 : -1; render(); S.slideDir = null; return;
    }
    case 'slide': slide(+v); return;
    case 'comp': { const o = COMPS.map(c => c[0]), d = o.indexOf(v) - o.indexOf(S.comp); if (!d) return; S.tabDir = d > 0 ? 1 : -1; S.comp = v; store.set('comp', v); break; }
  }
  render();
});
document.addEventListener('keydown', e => {
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !document.body.classList.contains('q-open') && !(e.target.closest && e.target.closest('input,textarea,select')) && !e.metaKey && !e.altKey && !e.ctrlKey) slide(e.key === 'ArrowLeft' ? -1 : 1);
});
let touch = null;
document.addEventListener('touchstart', e => { const t = e.touches[0]; touch = e.target.closest('.slider') ? [t.clientX, t.clientY] : null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!touch) return; const t = e.changedTouches[0], dx = t.clientX - touch[0], dy = t.clientY - touch[1]; touch = null;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 50) slide(dx < 0 ? 1 : -1);
}, { passive: true });
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.includes(t)) { S.tab = t; render(); } });

// ---------------------------------------------------------------- start
placeNav(); applyTheme(); render();
// alles tegelijk ophalen, maar tonen zodra de data van de geopende tab er is (de rest vult zich daarna aan);
load('layout');
const first = { home: Promise.all([homeLoad(), load('weer')]), nieuws: loadNews(), sport: loadSport() };
if (S.tab !== 'home') load('weer');
Promise.race([first[S.tab] || first.nieuws, new Promise(r => setTimeout(r, 2500))])
  .then(() => { S.ready = true; S.animNext = true; render(); });
setInterval(tickHeader, 1000);
setInterval(loadNews, 10 * 60e3);
setInterval(() => { const live = COMPS.some(c => c[0] !== 'f1' && ((S.d[c[1]] || {}).matches || []).some(m => m.state === 'in')); if (live || Date.now() % (10 * 60e3) < 60e3) loadSport(); }, 60e3);
setInterval(() => load('weer'), 10 * 60e3);

// ---------------------------------------------------------------- wedstrijd-modal: opstellingen (ESPN via /api/match)
const compOf = key => (COMPS.find(c => c[0] === key) || [])[1] || '';
const M = { el: null, comp: '', id: '', d: null, err: '', timer: 0 };
const POSD = { G: 0, GK: 0, SW: 1, CD: 2, CB: 2, LB: 2, RB: 2, LWB: 2.5, RWB: 2.5, DM: 3, CDM: 3, CM: 4, LM: 4, RM: 4, M: 4, AM: 5, CAM: 5, LW: 5.5, RW: 5.5, F: 6, CF: 6, ST: 6, FW: 6 };
function posDepth(p) { const b = (p || '').replace(/-[LR]$/, ''); return POSD[b] ?? 4; }
function posSide(p) {   // -2 = links, +2 = rechts (vanuit de ploeg gezien)
  const b = (p || '').replace(/-[LR]$/, '');
  return /-L$/.test(p) ? -1 : /-R$/.test(p) ? 1 : /^L/.test(b) ? -2 : /^R/.test(b) ? 2 : 0;
}
function lineupLines(t) {   // [[keeper], [verdedigers], ...] van achter naar voor, elke linie van links naar rechts
  const st = t.players.filter(p => p.starter);
  const gk = st.filter(p => posDepth(p.pos) === 0).slice(0, 1), out = st.filter(p => !gk.includes(p));
  out.sort((a, b) => posDepth(a.pos) - posDepth(b.pos) || a.place - b.place);
  let sizes = (t.formation || '').split('-').map(Number).filter(Boolean);
  if (sizes.reduce((a, b) => a + b, 0) !== out.length) {   // formatie past niet: groeperen op diepte
    sizes = []; let last = null;
    out.forEach(p => { const d = posDepth(p.pos); d === last ? sizes[sizes.length - 1]++ : sizes.push(1); last = d; });
  }
  const lines = []; let i = 0;
  sizes.forEach(n => { lines.push(out.slice(i, i + n).sort((a, b) => posSide(a.pos) - posSide(b.pos))); i += n; });
  return [gk].concat(lines).filter(l => l.length);
}
const hex = c => /^[0-9a-f]{6}$/i.test(c || '') ? '#' + c : null;
const lum = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
function teamColors(teams) {
  const c = teams.map(t => hex(t.color) || '#5b6b8c'), alt = teams.map(t => hex(t.alt));
  const dist = (a, b) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    return Math.abs((x >> 16) - (y >> 16)) + Math.abs((x >> 8 & 255) - (y >> 8 & 255)) + Math.abs((x & 255) - (y & 255)); };
  if (c[1] && dist(c[0], c[1]) < 120) c[1] = alt[1] && dist(c[0], alt[1]) >= 120 ? alt[1] : c[0] === '#ffffff' ? '#222' : '#f2f2f2';
  return c.map(x => ({ bg: x, fg: lum(x) > .6 ? '#111' : '#fff' }));
}
const BALL = '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z"></path>';
function plMarker(p, col, a, c) {
  const tags = (p.goals ? `<span class="pl-g" title="${p.goals}× gescoord">${ic(BALL)}${p.goals > 1 ? p.goals : ''}</span>` : '')
    + (p.og ? `<span class="pl-g og" title="Eigen doelpunt">${ic(BALL)}</span>` : '')
    + (p.red ? '<span class="pl-c red" title="Rode kaart"></span>' : p.yellow ? '<span class="pl-c" title="Gele kaart"></span>' : '');
  const out = p.subOut ? `<span class="pl-o" title="Gewisseld ${esc(p.subOut)}">↓${esc(p.subOut.replace(/'.*$/, "'"))}</span>` : '';
  return `<div class="pl" style="--a:${a.toFixed(1)}%;--c:${c.toFixed(1)}%" title="${esc(`${p.n || ''} ${p.name} (${p.pos})`)}">
<span class="pl-n" style="background:${col.bg};color:${col.fg}">${esc(p.n || '')}${out}${tags ? `<span class="pl-t">${tags}</span>` : ''}</span><span class="pl-nm">${esc(p.short || p.name)}</span></div>`;
}
function pitch(d, cols) {
  const half = (t, ti) => {
    const lines = lineupLines(t), n = lines.length;
    return lines.map((l, li) => {
      const along = li === 0 ? 5.5 : 15 + (li - 1) * (30 / Math.max(1, n - 2));
      return l.map((p, j) => {
        const across = (j + 1) / (l.length + 1) * 100;
        return plMarker(p, cols[ti], ti === 0 ? along : 100 - along, ti === 0 ? across : 100 - across);
      }).join('');
    }).join('');
  };
  return `<div class="pitch"><i class="pt-mid"></i><i class="pt-circ"></i><i class="pt-box l"></i><i class="pt-box r"></i>${d.teams.map(half).join('')}</div>`;
}
function benchList(t) {
  const st = t.players.filter(p => p.starter), subs = t.players.filter(p => !p.starter);
  const inn = subs.filter(p => p.subIn).sort((a, b) => parseInt(a.subIn) - parseInt(b.subIn)), rest = subs.filter(p => !p.subIn);
  const outFor = p => { const ev = (M.d.events || []).find(e => e.kind === 'sub' && e.in === p.name); return ev ? ev.out : ''; };
  const row = p => `<div class="bn${p.subIn ? ' in' : ''}"><span class="bn-n">${esc(p.n || '')}</span><span class="bn-nm">${esc(p.name)}${p.goals ? ` ${ic(BALL)}` : ''}${p.red ? '<span class="pl-c red"></span>' : p.yellow ? '<span class="pl-c"></span>' : ''}${p.subIn && outFor(p) ? `<small>voor ${esc(outFor(p))}</small>` : ''}</span>${p.subIn ? `<span class="bn-m">↑ ${esc(p.subIn)}</span>` : ''}</div>`;
  void st;
  return (inn.length ? `<div class="bn-h">Ingevallen</div>${inn.map(row).join('')}` : '') + (rest.length ? `<div class="bn-h">Bank</div>${rest.map(row).join('')}` : '');
}
function formRow(t) {
  return (t.form || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map(f => {
    const k = { W: ['W', 'ok'], L: ['V', 'bad'], D: ['G', 'upd'] }[f.res] || ['?', ''];
    return `<span class="fm ${k[1]}" title="${esc(`${f.date ? new Date(f.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ', ' : ''}${f.home ? 'thuis' : 'uit'} tegen ${f.vs}: ${f.score}`)}">${k[0]}</span>`;
  }).join('');
}
function mRender() {
  if (!M.el) return;
  const body = M.el.querySelector('.mbody');
  if (M.err && !M.d) { body.innerHTML = `<div class="m-empty">Kon de wedstrijd niet laden (${esc(M.err)}).</div>`; return; }
  if (!M.d) { body.innerHTML = '<div class="m-empty"><span class="m-spin"></span>Laden…</div>'; return; }
  const d = M.d, [h, a] = d.teams, cols = teamColors(d.teams), live = d.state === 'in';
  const comp = (COMPS.find(c => c[1] === d.comp) || [])[2] || '';
  const mid = d.state === 'pre' ? `<b class="m-time">${hm(new Date(d.date))}</b>` : `<b class="m-score">${esc(h.score)} – ${esc(a.score)}</b>`;
  const st = live ? `<small class="m-live"><span class="pulse"></span>LIVE ${esc(d.detail || '')}</small>` : d.state === 'post' ? '<small>Afgelopen</small>' : `<small>${esc(dayLabel(d.date))}</small>`;
  const evs = side => d.events.filter(e => e.team === d.teams[side].name && e.kind !== 'sub').map(e =>
    `<span class="m-ev">${e.kind === 'goal' || e.kind === 'og' ? ic(BALL) : `<span class="pl-c${e.kind === 'red' ? ' red' : ''}"></span>`}${esc(e.min)} ${esc(_shortN(e.player))}${e.pen ? ' (p)' : ''}${e.kind === 'og' ? ' (e.d.)' : ''}</span>`).join('');
  const team = (t, i) => `<div class="m-team ${i ? 'r' : ''}">${crest(t.logo, t.name).replace('class="crest', 'class="crest big')}<b>${esc(t.short || t.name)}</b>${t.formation && d.lineups ? `<small>${esc(t.formation)}</small>` : ''}<div class="m-evs">${evs(i)}</div></div>`;
  const head = `<div class="m-head"><div class="eyebrow">${esc(comp)}${d.venue ? ' · ' + esc(d.venue) : ''}</div>
<div class="m-vs">${team(h, 0)}<div class="m-mid">${mid}${st}</div>${team(a, 1)}</div></div>`;
  const lineup = d.lineups ? `${pitch(d, cols)}<div class="m-bench"><div>${benchList(h)}</div><div>${benchList(a)}</div></div>`
    : `<div class="m-empty"><b>Opstellingen nog niet bekend</b><span>Die komen meestal ±1 uur voor de aftrap binnen${d.state === 'pre' ? ` (${esc(when(d.date))})` : ''}.</span></div>`;
  const form = (h.form || []).length ? `<div class="m-form"><div class="bn-h">Vorm · laatste 5, nieuwste rechts</div><div class="m-fr"><span>${esc(h.short || h.name)}</span><span class="fms">${formRow(h)}</span></div><div class="m-fr"><span>${esc(a.short || a.name)}</span><span class="fms">${formRow(a)}</span></div></div>` : '';
  body.innerHTML = head + lineup + form;
}
const _shortN = n => { const r = (n || '').split(' ').slice(1); if (!r.length) return n; const i = r.findIndex(w => /^(van|de|der|den|ter|ten|te|da|dos|del|di|von|el|al)$/i.test(w)); return i >= 0 ? r.slice(i).join(' ') : r[r.length - 1]; };
async function mLoad() {
  const key = M.comp + ':' + M.id;
  try {
    const r = await fetch(`/api/match?comp=${encodeURIComponent(M.comp)}&id=${encodeURIComponent(M.id)}`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    if (key === M.comp + ':' + M.id) { M.d = j; M.err = ''; }
  } catch (e) { M.err = e.message || 'fout'; }
  mRender();
  clearTimeout(M.timer);
  if (M.d && M.el && !M.el.hidden && (M.d.state === 'in' || (M.d.state === 'pre' && new Date(M.d.date) - Date.now() < 90 * 60e3)))
    M.timer = setTimeout(mLoad, 60e3);   // live of bijna aftrap: elke minuut verversen zolang de modal open is
}
function mOpen(comp, id) {
  if (!comp || !id) return;
  if (!M.el) {
    const d = document.createElement('div');
    d.className = 'mwrap'; d.hidden = true;
    d.innerHTML = '<div class="mbox glass" role="dialog" aria-modal="true" aria-label="Wedstrijd"><button type="button" class="btn icon m-x" aria-label="Sluiten">' + ic('<path d="M7 7l10 10M17 7L7 17"></path>') + '</button><div class="mbody"></div></div>';
    $('#app').appendChild(d);
    d.addEventListener('mousedown', e => { if (e.target === d) mClose(); });
    d.querySelector('.m-x').addEventListener('click', mClose);
    M.el = d;
  }
  M.comp = comp; M.id = id; M.d = null; M.err = '';
  M.el.hidden = false; document.body.classList.add('m-open');
  mRender(); mLoad();
  M.el.querySelector('.m-x').focus();
}
function mClose() { if (!M.el) return; M.el.hidden = true; document.body.classList.remove('m-open'); clearTimeout(M.timer); }
document.addEventListener('keydown', e => {
  if (document.body.classList.contains('m-open') && e.key === 'Escape') { e.preventDefault(); mClose(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-act="match"]')) { e.preventDefault(); e.target.click(); }
});

// ---------------------------------------------------------------- zoeken: begin te typen → venster in het midden
const Q = { el: null, sel: 0, hits: [] };
function qBuild() {
  const d = document.createElement('div');
  d.className = 'qwrap'; d.hidden = true;
  d.innerHTML = `<div class="qbox glass" role="dialog" aria-label="Zoeken"><div class="qin"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4 4"></path></svg><input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="Zoek op Google of typ een adres…"><kbd>esc</kbd></div><div class="qlist" id="qlist"></div></div>`;
  $('#app').appendChild(d);
  d.addEventListener('mousedown', e => { if (e.target === d) qClose(); });
  const inp = d.querySelector('#q');
  inp.addEventListener('input', () => qRender());
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); qClose(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); Q.sel = (Q.sel + (e.key === 'ArrowDown' ? 1 : -1) + Q.hits.length) % Q.hits.length; qRender(true); }
    else if (e.key === 'Enter') { e.preventDefault(); qGo(Q.hits[Q.sel]); }
    else if (e.key === 'Delete' && e.shiftKey && Q.hits[Q.sel] && Q.hits[Q.sel].k) { e.preventDefault(); qForget(Q.hits[Q.sel].k); }
  });
  d.querySelector('#qlist').addEventListener('click', e => {
    const x = e.target.closest('[data-del]');
    if (x) { e.preventDefault(); e.stopPropagation(); qForget(x.dataset.del); $('#q').focus(); return; }
    const r = e.target.closest('[data-i]'); if (r) qGo(Q.hits[+r.dataset.i]);
  });
  Q.el = d;
}
// eigen geschiedenis van het zoekvenster (alleen in deze browser): wat je vaak/recent opent komt bovenaan
const qHist = () => { try { return JSON.parse(localStorage.getItem('dash-qhist') || '[]'); } catch (e) { return []; } };
const qScore = e => e.n / (1 + (Date.now() - e.t) / (7 * 864e5));   // vaak + recent (halveert ruwweg per week)
function qRemember(h) {
  if (!h || !h.url) return;
  const l = qHist(), key = h.kind === 'svc' ? 'svc:' + h.id : h.url;
  const e = l.find(x => x.k === key) || (l.push({ k: key, kind: h.kind === 'url' ? 'site' : h.kind, n: 0 }), l[l.length - 1]);
  Object.assign(e, { n: e.n + 1, t: Date.now(), url: h.url, name: h.kind === 'url' ? h.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : h.name, id: h.id, sub: h.sub });
  l.sort((x, y) => qScore(y) - qScore(x));
  try { localStorage.setItem('dash-qhist', JSON.stringify(l.slice(0, 200))); } catch (e2) { /* geen opslag */ }
}
function qForget(k) {   // één regel uit de zoekgeschiedenis halen (× of Shift+Delete)
  try { localStorage.setItem('dash-qhist', JSON.stringify(qHist().filter(e => e.k !== k))); } catch (e) { /* geen opslag */ }
  qRender(true); Q.sel = Math.min(Q.sel, Math.max(0, Q.hits.length - 1)); qRender(true);
}
function qRender(keepSel) {
  const v = $('#q').value.trim(), lv = v.toLowerCase();
  const svc = [];
  // lijkt het op een adres (tweakers.net, https://…, 192.168.1.1:8080/x)? dan eerst 'Open', Google daaronder
  const isUrl = /^(https?:\/\/\S+|(localhost|\d{1,3}(\.\d{1,3}){3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?([\/?#]\S*)?)$/i.test(v);
  const site = isUrl ? [{ kind: 'url', name: v, url: /^https?:\/\//i.test(v) ? v : (/^(localhost|\d)/.test(v) ? 'http://' : 'https://') + v }] : [];
  // geschiedenis: leeg = meest bezocht; bij typen alles wat erop lijkt (naam of adres), beste eerst
  const hist = qHist().filter(e => !lv || (e.name + ' ' + e.url).toLowerCase().includes(lv))
    .filter(e => !site.length || e.url.replace(/\/$/, '') !== site[0].url.replace(/\/$/, ''))
    .sort((a, b) => lv ? (b.n - a.n) || (b.t - a.t) : 0)   // bij typen: vaakst bezocht bovenaan
    .slice(0, lv ? 5 : 7).map(e => ({ kind: 'hist', k: e.k, hk: e.kind, name: e.name, url: e.url, id: e.id, sub: e.sub, n: e.n }));
  const svcNew = svc.filter(x => !hist.some(e => e.hk === 'svc' && e.id === x.id));
  const start = h => (h.name.toLowerCase().replace(/^www\./, '').startsWith(lv) || h.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').startsWith(lv));
  const top = !isUrl && hist.find(h => h.hk !== 'g' && start(h));   // vaak bezochte site die begint met wat je typt: meteen onder Enter
  Q.hits = (top ? [top] : []).concat(site, hist.filter(h => h !== top), v ? [{ kind: 'g', name: v, url: 'https://www.google.com/search?q=' + encodeURIComponent(v) }] : [], svcNew);
  if (!keepSel) { const gi = Q.hits.findIndex(h => h.kind === 'g'); Q.sel = top || isUrl ? 0 : svcNew.length && svcNew[0].name.toLowerCase().startsWith(lv) ? Q.hits.indexOf(svcNew[0]) : Math.max(0, gi); }
  const CLOCK = ic('<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path>');
  $('#qlist').innerHTML = (lv ? '' : hist.length ? '<div class="q-h">Vaak bezocht</div>' : '') + Q.hits.map((h, i) => `<button type="button" class="qrow${i === Q.sel ? ' on' : ''}" data-i="${i}">${h.kind === 'url'
    ? `<span class="qic g" aria-hidden="true">${ic('<path d="M10 14l10-10M14 4h6v6"></path><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"></path>')}</span><span class="qt one">Open <b>${esc(h.url.replace(/^https:\/\//, ''))}</b></span>`
    : h.kind === 'hist'
    ? `<span class="qic g" aria-hidden="true">${h.hk === 'g' ? 'G' : CLOCK}</span><span class="qt"><b>${esc(h.hk === 'g' ? h.name : h.name)}</b><small>${esc(h.hk === 'g' ? 'eerder gezocht' : h.hk === 'svc' ? (h.sub || '') : h.url.replace(/^https?:\/\//, ''))}</small></span><span class="qx" role="button" tabindex="-1" data-del="${esc(h.k)}" title="Uit geschiedenis verwijderen" aria-label="Uit geschiedenis verwijderen">×</span>`
    : h.kind === 'g'
    ? `<span class="qic g" aria-hidden="true">G</span><span class="qt one">Zoek op Google: <b>${esc(h.name)}</b></span>`
    : `<span class="qic" aria-hidden="true"></span><span class="qt"><b>${esc(h.name)}</b><small>${esc(h.sub)}</small></span>`}<span class="qk">${i === Q.sel ? '↵' : ''}</span></button>`).join('');
}
function qOpen(ch) {
  if (!Q.el) qBuild();
  Q.el.hidden = false; document.body.classList.add('q-open');
  const inp = $('#q'); inp.value = ch || ''; inp.focus(); qRender();
}
function qClose() { if (!Q.el) return; Q.el.hidden = true; document.body.classList.remove('q-open'); }
function qGo(h) {
  if (!h) return;
  qRemember(h.kind === 'hist' ? { kind: h.hk === 'site' ? 'url' : h.hk, name: h.name, url: h.url, id: h.id, sub: h.sub } : h);
  qClose();
  window.open(h.url, '_blank', 'noopener');
}
document.addEventListener('keydown', e => {
  if (document.body.classList.contains('q-open') || document.body.classList.contains('m-open') || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
  if (e.key.length === 1 && e.key.trim()) { e.preventDefault(); qOpen(e.key); }
  else if (e.key === '/') { e.preventDefault(); qOpen(''); }
});
