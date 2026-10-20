'use strict';

/* ================= константы ================= */
const CRIT = ['Сюжет', 'Актёрская игра', 'Визуал', 'Напряжение', 'Смысл', 'Впечатление', 'Пересмотр'];
// подсказки к критериям (значок «?» рядом с названием)
const CRIT_INFO = {
  'Сюжет': 'Насколько интересна и логична история: завязка, повороты, нет ли дыр и натяжек, убедителен ли финал. <b>10</b> — захватывает, и всё сходится.',
  'Актёрская игра': 'Веришь ли героям: живые ли эмоции, нет ли фальши, подходят ли актёры на свои роли. <b>10</b> — забываешь, что это актёры.',
  'Визуал': 'Как фильм снят: операторская работа, свет, цвет, монтаж, декорации и спецэффекты. <b>10</b> — хочется ставить на паузу и разглядывать кадры.',
  'Напряжение': 'Держит ли фильм внимание: темп, драматургия, нет ли затянутых мест. <b>10</b> — невозможно оторваться до самых титров.',
  'Смысл': 'Есть ли за историей идея или мораль, о которой думаешь после просмотра. Лёгкое кино оценивайте по задачам жанра. <b>10</b> — фильм что-то в тебе поменял.',
  'Впечатление': 'Общее чувство после просмотра: понравилось ли, какие эмоции остались. Ставится сердцем, а не по пунктам.',
  'Пересмотр': 'Захочется ли посмотреть ещё раз.<br><b>10</b> — определённо да · <b>8</b> — скорее да · <b>6</b> — может быть · <b>4</b> — наверное нет · <b>2</b> — твёрдо нет.',
  manual: 'Итоговый балл, если среднее по критериям не отражает ваше отношение к фильму. Когда переключатель выключен, общая оценка — это среднее по критериям.',
};
// категории: мята → лайм → янтарь → оранжевый → розово-красный
const TIERS = [
  { name: 'Отлично',   min: 9, lo: 9, hi: 10, range: '9 – 10',  c1: '#4ee6b8' },
  { name: 'Хорошо',    min: 7, lo: 7, hi: 9,  range: '7 – 8.9', c1: '#b4e85a' },
  { name: 'Нормально', min: 5, lo: 5, hi: 7,  range: '5 – 6.9', c1: '#fbcf4a' },
  { name: 'Странно',   min: 3, lo: 3, hi: 5,  range: '3 – 4.9', c1: '#fb9450' },
  { name: 'Провал',    min: 0, lo: 1, hi: 3,  range: '1 – 2.9', c1: '#f4506e' },
];
TIERS.forEach(t => t.c2 = t.c1);
const SORTS = [
  ['title', 'По названию'], ['new', 'Сначала новые'], ['old', 'Сначала старые'],
  ['score', 'По моей оценке'], ['imdb', 'По рейтингу IMDb'], ['recent', 'Недавно оценённые'],
];
// пороги фильтра IMDb: 0 — любой рейтинг
const IMDB_MIN = [[0, 'Любой рейтинг'], [8, '8 и выше'], [7.5, '7.5 и выше'], [7, '7 и выше'], [6.5, '6.5 и выше'], [6, '6 и выше']];
const RING_C = 2 * Math.PI * 86;
const ICON = {
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  coll: '<svg viewBox="0 0 24 24"><rect x="3.5" y="7.5" width="17" height="12.5" rx="2.5"/><path d="M6.5 4.5h11"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

// страна производства — для достижений «Знаток советского кино» и «Наше кино»
const madeIn = (m, c) => (m.country || []).includes(c);
const isSoviet = m => madeIn(m, 'СССР');
const isRussian = m => madeIn(m, 'Россия') && !(m.year && m.year < 1992);
const isSeries = m => m.genres.includes('Сериал');
// режиссёров в базе пишут через запятую: «Сарик Андреасян, Давид Дадунашвили»
const people = s => String(s || '').split(/\s*,\s*/).filter(Boolean);
const hasPerson = (m, p) => people(m.director).includes(p) || m.actors.includes(p);

/* ================= состояние ================= */
// y1/y2 — выбранный диапазон годов, yMin/yMax — границы по всей базе
// country — фильтр по стране, person — фильмография режиссёра или актёра
// colls — свои коллекции [{ id, name, desc, ids }], coll — открытая коллекция (null — список коллекций)
const S = { movies: [], ratings: {}, colls: [], coll: null, view: 'all', tier: 'any', genre: null, imdbMin: 0, country: null, person: null, q: '', sort: 'title', list: [], cur: null, y1: 0, y2: 9999, yMin: 0, yMax: 9999 };
const cards = new Map();
// версия кэша цветов: при замене постеров старые цвета сбрасываются
const COLORS_VER = 3;
if (load('kc_colors_ver', 0) !== COLORS_VER) { try { localStorage.removeItem('kc_colors'); } catch { } keep('kc_colors_ver', COLORS_VER); }
const colors = load('kc_colors', {});
const pver = load('kc_pv', {});
// в браузерной версии (телефон) свои постеры хранятся в IndexedDB как data:-картинки
const localPosters = {};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hue = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const tierIdx = s => TIERS.findIndex(t => s >= t.min);
const fmt = s => (s >= 10 ? '10' : s.toFixed(1));
// для поиска: регистр и «ё» не важны
const norm = s => String(s).toLowerCase().replace(/ё/g, 'е');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }
function keep(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }

/* ================= связь с приложением ================= */
const host = window.chrome && window.chrome.webview;
// Android-приложение (APK): страница внутри WebView, файлы сохраняет и отправляет Java-часть
const droid = window.KinoraAndroid;
const pending = new Map();
let reqN = 0;
if (host) host.addEventListener('message', e => {
  const m = e.data, r = pending.get(m.id);
  if (r) { pending.delete(m.id); r(m); }
});
function call(type, data = {}) {
  if (!host) return Promise.resolve({ ok: false, error: 'Нет связи с приложением' });
  return new Promise(res => { const id = ++reqN; pending.set(id, res); host.postMessage({ id, type, ...data }); });
}

// приложение скачало обновление в фоне — плашка с кнопкой «Перезапустить» (иначе применится при следующем запуске)
window.kinoraUpdate = () => {
  if (document.getElementById('updBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updBar'; bar.className = 'upd-bar';
  bar.innerHTML = '<span class="upd-ico">⬆</span><span class="upd-t"><b>Обновление Kinora готово</b>Новые фильмы и улучшения</span>' +
    '<button class="btn sm accent" data-u="go">Перезапустить</button><button class="upd-x" data-u="no" title="Позже">✕</button>';
  bar.onclick = e => {
    const b = e.target.closest('[data-u]');
    if (!b) return;
    if (b.dataset.u === 'no') { bar.remove(); toast('Обновление применится при следующем запуске'); return; }
    if (droid && droid.applyUpdate) droid.applyUpdate();
    else if (host) host.postMessage({ type: 'applyUpdate' });
  };
  document.body.append(bar);
};

/* ================= постеры в браузерной версии ================= */
// на телефоне нет Windows-части, поэтому поиск и выбор постера делаются прямо на странице
const posterDB = (() => {
  let db;
  const open = () => db || (db = new Promise((res, rej) => {
    const r = indexedDB.open('kinora', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('posters');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const store = (await open()).transaction('posters', mode).objectStore('posters');
    return new Promise((res, rej) => { const q = fn(store); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  };
  return {
    async all() { const keys = await run('readonly', s => s.getAllKeys()), vals = await run('readonly', s => s.getAll()); return keys.map((k, i) => [k, vals[i]]); },
    put: (k, v) => run('readwrite', s => s.put(v, k)),
    del: k => run('readwrite', s => s.delete(k)),
  };
})();

const loadAnyImg = (src, cors) => new Promise(res => {
  const i = new Image();
  if (cors) i.crossOrigin = 'anonymous';
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null);
    i.oncancel = () => res(null);
    i.click();
  });
}

// JPEG не шире 400 px, как постеры из каталога (Posters.SaveFrom в Windows-версии ограничивает 600 px)
async function storePoster(m, img) {
  const w = Math.min(400, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
  const url = c.toDataURL('image/jpeg', .86);
  await posterDB.put(m.id, url);
  localPosters[m.id] = url;
}

async function webPickPoster(m) {
  const f = await pickFile('image/*');
  if (!f) return { ok: false };
  const u = URL.createObjectURL(f), img = await loadAnyImg(u);
  URL.revokeObjectURL(u);
  if (!img) return { ok: false, error: 'Не удалось открыть картинку' };
  await storePoster(m, img);
  return { ok: true };
}

// тот же порядок поиска в Википедии, что и в Windows-версии (Posters.cs)
async function wikiThumb(host, params) {
  const u = `https://${host}/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilicense=any&redirects=1&` + params;
  try {
    const d = await (await fetch(u)).json();
    return Object.values((d.query || {}).pages || {}).map(p => p.thumbnail && p.thumbnail.source).find(Boolean) || null;
  } catch { return null; }
}
async function webFetchPoster(m) {
  const t = s => 'titles=' + encodeURIComponent(s), q = s => 'generator=search&gsrlimit=1&gsrsearch=' + encodeURIComponent(s);
  const tries = [];
  if (m.orig) {
    const en = 'en.wikipedia.org';
    if (m.wiki) tries.push([en, t(m.wiki)]);
    tries.push([en, t(`${m.orig} (${m.year} film)`)], [en, t(`${m.orig} (film)`)], [en, q(`${m.orig} ${m.year} film`)]);
  }
  if (m.title) {
    const ru = 'ru.wikipedia.org';
    tries.push([ru, t(`${m.title} (фильм, ${m.year})`)], [ru, t(`${m.title} (фильм)`)], [ru, q(`${m.title} ${m.year} фильм`)]);
  }
  for (const [h, p] of tries) {
    const src = await wikiThumb(h, p);
    const img = src && await loadAnyImg(src, true);
    if (!img) continue;
    try { await storePoster(m, img); return { ok: true }; } catch { }
  }
  return { ok: false };
}

const fetchPoster = m => host
  ? call('fetchPoster', { movieId: m.id, title: m.title, orig: m.orig || '', wiki: m.wiki || '', year: m.year || 0 })
  : webFetchPoster(m);
const pickPoster = m => host ? call('pickPoster', { movieId: m.id }) : webPickPoster(m);
function deletePoster(m) {
  if (host) { call('deletePoster', { movieId: m.id }); return; }
  delete localPosters[m.id];
  posterDB.del(m.id).catch(() => { });
}

/* ================= оценки ================= */
const R = id => S.ratings[id];
function getR(id) { return S.ratings[id] || (S.ratings[id] = { scores: {}, manual: 0, comment: '', favorite: false }); }
function autoAvg(r) {
  if (!r) return -1;
  const v = Object.values(r.scores || {}).filter(x => x > 0);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : -1;
}
function overall(r) { return !r ? -1 : (r.manual > 0 ? r.manual : autoAvg(r)); }
const ov = m => overall(R(m.id));
const isEmpty = r => overall(r) < 0 && !(r.comment || '').trim() && !r.favorite && !r.watch && !(r.views || []).length && !r.seasons && !r.done;

const saveRatings = debounce(async () => {
  for (const [k, r] of Object.entries(S.ratings)) if (isEmpty(r)) delete S.ratings[k];
  if (!host) { keep('kc_ratings', S.ratings); return; }
  const res = await call('save', { file: 'ratings', data: JSON.stringify(S.ratings, null, 1) });
  if (!res.ok) toast('⚠ Не удалось сохранить: ' + (res.error || ''));
}, 200);

// ratedAt — момент, когда у фильма впервые появилась оценка (для «Марафонца»)
function touch(r) {
  r.updated = new Date().toISOString();
  if (overall(r) >= 0) r.ratedAt = r.ratedAt || r.updated; else delete r.ratedAt;
  saveRatings(); checkAch();
}

function saveCustom() {
  const data = S.movies.filter(m => m.custom).map(({ custom, _hay, ...m }) => m);
  if (!host) { keep('kc_custom', data); return; }
  call('save', { file: 'my_movies', data: JSON.stringify(data, null, 1) });
}

/* ================= коллекции ================= */
const curColl = () => (S.coll && S.colls.find(c => c.id === S.coll)) || null;
const collsOf = m => S.colls.filter(c => c.ids.includes(m.id));
// копия в localStorage есть всегда: если файл не записался (старый Kinora.exe), коллекции не пропадут
const saveColls = debounce(async () => {
  keep('kc_colls', S.colls);
  if (!host) return;
  const res = await call('save', { file: 'collections', data: JSON.stringify(S.colls, null, 1) });
  if (!res.ok) toast('⚠ Не удалось сохранить коллекции: ' + (res.error || ''));
}, 200);
function collsChanged() { saveColls(); checkAch(); }
function newColl(name, desc = '', ids = []) {
  const c = { id: 'c_' + Date.now(), name, desc, ids, created: new Date().toISOString() };
  S.colls.push(c);
  collsChanged();
  return c;
}

/* ================= цвета постеров ================= */
// пути относительные: страница лежит в web/, рядом папки data/ и posters/ — так работает и в приложении, и на любом хостинге
const purl = m => localPosters[m.id] || '../posters/' + encodeURIComponent(m.id) + '.jpg' + (pver[m.id] ? '?v=' + pver[m.id] : '');
const hsl = (c, dh = 0, dl = 0) => `hsl(${(c[0] + dh + 360) % 360} ${c[1]}% ${Math.min(80, c[2] + dl)}%)`;
const keepColors = debounce(() => keep('kc_colors', colors), 800);

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), s, l];
}

function extractColor(img) {
  const id = img.dataset.id;
  if (!id) return;
  if (!colors[id]) {
    try {
      const c = document.createElement('canvas');
      c.width = 24; c.height = 36;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 24, 36);
      const d = x.getImageData(0, 0, 24, 36).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const sat = mx ? (mx - mn) / mx : 0;
        const wt = sat * sat * (mx / 255) + .015;
        r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
      }
      const [h, s, l] = rgbToHsl(r / w, g / w, b / w);
      colors[id] = [h, Math.round(Math.max(s, .62) * 100), Math.round(Math.min(Math.max(l, .55), .66) * 100)];
      keepColors();
    } catch { return; }
  }
  const card = cards.get(id);
  if (card) card.style.setProperty('--glow', hsl(colors[id]));
  if (S.cur && S.cur.id === id) setAccent(colors[id]);
}

function setAccent() { /* акцент фиксированный — спокойная палитра */ }

document.addEventListener('load', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.closest('.poster')) return;
  img.classList.add('ok');
  extractColor(img);
}, true);
document.addEventListener('error', e => {
  if (e.target.tagName === 'IMG' && e.target.closest('.poster')) e.target.remove();
}, true);

/* ================= карточки ================= */
function posterHTML(m, withInfo) {
  return `<div class="poster" style="--h:${hue(m.title)}">
    <img data-id="${esc(m.id)}" src="${purl(m)}" loading="lazy" decoding="async" alt="">
    <div class="ph">${esc(m.title)}</div>
    ${withInfo ? `<div class="shade"></div><div class="hover-info"><b>Режиссёр</b>${esc(m.director || '—')}</div>` : ''}
  </div>`;
}

function makeCard(m) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = m.id;
  el.innerHTML = `<div class="pz">${posterHTML(m, true)}</div>
    <div class="ct">${esc(m.title)}</div>
    <div class="cm"><span class="cm-l">${m.year || ''}${m.genres[0] ? '<i>•</i>' + esc(m.genres[0]) : ''}</span>${m.imdb ? `<span class="cm-r" title="Рейтинг IMDb">${m.imdb.toFixed(1)}</span>` : ''}</div>`;
  if (colors[m.id]) el.style.setProperty('--glow', hsl(colors[m.id]));
  if (!calm) { el.addEventListener('pointermove', tilt); el.addEventListener('pointerleave', untilt); }
  badges(el, m);
  return el;
}

function badges(el, m) {
  el.querySelectorAll('.score, .flags').forEach(x => x.remove());
  const p = el.querySelector('.poster'), r = R(m.id), s = overall(r);
  if (s >= 0) {
    const t = TIERS[tierIdx(s)];
    p.insertAdjacentHTML('beforeend', `<div class="score" style="--t1:${t.c1};--t2:${t.c2}" title="${t.name}">${fmt(s)}</div>`);
  }
  const views = (r && r.views || []).length;
  const flags = (r && r.favorite ? '<i class="fav" title="В избранном">♥</i>' : '') +
    (r && r.watch ? `<i class="wl" title="Смотреть позже">${ICON.bookmark}</i>` : '') +
    // прогресс сериала: «✓» — досмотрен, «S3» — посмотрено три сезона
    (r && isSeries(m) && (r.done || r.seasons) ? `<i class="ss" title="${r.done ? 'Досмотрен' : 'Посмотрено сезонов: ' + r.seasons}">${r.done ? '✓' : 'S' + r.seasons}</i>` : '') +
    (views > 1 ? `<i class="rw" title="Смотрели ${views} ${plural(views, 'раз', 'раза', 'раз')}">↻${views}</i>` : '');
  if (flags) p.insertAdjacentHTML('beforeend', `<div class="flags">${flags}</div>`);
}

// рейтинг IMDb: спокойная плашка рядом с годом в окне фильма
const votesFmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1e3 ? Math.round(n / 1e3) + ' тыс.' : String(n);
function imdbTag(m) {
  if (!m.imdb) return '';
  return `<span class="imdb-tag" title="Рейтинг IMDb${m.imdbVotes ? ' · ' + m.imdbVotes.toLocaleString('ru-RU') + ' оценок' : ''}">` +
    `<b>IMDb</b><span class="iv">${m.imdb.toFixed(1)}</span>${m.imdbVotes ? `<small>${votesFmt(m.imdbVotes)}</small>` : ''}</span>`;
}

// карточки создаются по требованию — только те, что реально попадают в сетку
function cardOf(m) {
  let el = cards.get(m.id);
  if (!el) { el = makeCard(m); cards.set(m.id, el); }
  return el;
}

function replaceCard(m) {
  delete m._hay;
  const old = cards.get(m.id), el = makeCard(m);
  el.classList.add('in');
  cards.set(m.id, el);
  if (old && old.parentNode) old.replaceWith(el);
}

/* ================= плавные анимации ================= */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchUI = matchMedia('(hover: none)').matches;
const EASE = 'cubic-bezier(.22, 1, .36, 1)';

// карточки проявляются по мере прокрутки — пачкой, с небольшим шагом
const reveal = new IntersectionObserver(entries => {
  let k = 0;
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.style.setProperty('--d', Math.min(k++, 12) * 45 + 'ms');
    e.target.classList.add('in');
    reveal.unobserve(e.target);
  });
}, { rootMargin: '0px 0px -30px 0px' });

// постер наклоняется за курсором, по нему скользит блик
function tilt(e) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget, r = el.querySelector('.pz').getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  el.style.setProperty('--ry', (x - .5) * 14 + 'deg');
  el.style.setProperty('--rx', (.5 - y) * 10 + 'deg');
  el.style.setProperty('--mx', x * 100 + '%');
  el.style.setProperty('--my', y * 100 + '%');
}
function untilt(e) {
  e.currentTarget.style.setProperty('--rx', '0deg');
  e.currentTarget.style.setProperty('--ry', '0deg');
}

// FLIP: карточки, что были на экране, переезжают на новые места; остальные проявятся при прокрутке
function visibleRects() {
  const map = new Map();
  if (grid.classList.contains('hidden')) return map;
  for (const el of grid.children) {
    const b = el.getBoundingClientRect();
    if (b.bottom > 0 && b.top < innerHeight) map.set(el, b);
  }
  return map;
}
function playGrid(before) {
  for (const el of grid.children) {
    const a = before.get(el);
    if (!a) { el.classList.remove('in'); el.style.removeProperty('--d'); reveal.observe(el); continue; }
    if (calm) continue;
    const b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dy) > innerHeight) { el.animate([{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: EASE }); continue; }
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 650, easing: EASE });
  }
}

// окно фильма «вырастает» из постера и при закрытии возвращается в него
function flyFrom(sheet, el) {
  if (!el || calm) return null;
  const a = el.getBoundingClientRect(), b = sheet.getBoundingClientRect();
  if (!a.width || a.bottom < 0 || a.top > innerHeight) return null;
  return `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${a.width / b.width})`;
}

// цифры на плитках статистики отсчитываются от нуля
function countUp(root) {
  if (calm) return;
  $$('.tile .v', root).forEach(el => {
    const to = parseFloat(el.textContent);
    if (isNaN(to)) return;
    const dec = el.textContent.includes('.') ? 1 : 0, t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, Math.max(0, (now - t0) / 1100)), e = 1 - Math.pow(1 - p, 4);
      el.textContent = (to * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ================= фильтры и сетка ================= */
const grid = $('#grid');

function matches(m, ignoreTier) {
  const r = R(m.id), s = overall(r);
  if (S.view === 'fav' && !(r && r.favorite)) return false;
  if (S.view === 'watch' && !(r && r.watch)) return false;
  if (S.view === 'coll') { const c = curColl(); if (!c || !c.ids.includes(m.id)) return false; }
  if (!inYears(m)) return false;
  if (!imdbOk(m)) return false;
  if (S.country && !madeIn(m, S.country)) return false;
  if (S.person && !hasPerson(m, S.person)) return false;
  if (!ignoreTier) {
    if (S.tier === 'none' && s >= 0) return false;
    if (typeof S.tier === 'number' && (s < 0 || tierIdx(s) !== S.tier)) return false;
  }
  if (S.genre && !m.genres.includes(S.genre)) return false;
  if (S.q) {
    const hay = m._hay || (m._hay = norm([m.title, m.orig, m.director, ...m.actors, ...(m.country || []), m.year].join(' ')));
    if (!S.q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

const COLL = new Intl.Collator('ru');
function sorted(list) {
  const byTitle = (a, b) => COLL.compare(a.title, b.title);
  const f = {
    title: byTitle,
    new: (a, b) => b.year - a.year || byTitle(a, b),
    old: (a, b) => a.year - b.year || byTitle(a, b),
    score: (a, b) => ov(b) - ov(a) || byTitle(a, b),
    imdb: (a, b) => (b.imdb || 0) - (a.imdb || 0) || (b.imdbVotes || 0) - (a.imdbVotes || 0) || byTitle(a, b),
    recent: (a, b) => ((R(b.id) || {}).updated || '').localeCompare((R(a.id) || {}).updated || '') || byTitle(a, b),
  }[S.sort];
  return list.sort(f);
}

/* ================= «в центре внимания» ================= */
const HERO_COUNT = 5;
let heroList = [], heroIdx = 0, heroTimer;

function pickHero() {
  const pool = S.movies.filter(m => ov(m) < 0 && m.desc);
  const src = pool.length >= HERO_COUNT ? pool : S.movies;
  heroList = [...src].sort(() => Math.random() - .5).slice(0, HERO_COUNT);
  heroIdx = 0;
  $('#heroDots').innerHTML = heroList.map((_, i) => `<span data-i="${i}"></span>`).join('');
  $$('#heroDots span').forEach(d => d.onclick = () => showHero(+d.dataset.i));
}

function showHero(i) {
  if (!heroList.length) return;
  heroIdx = (i + heroList.length) % heroList.length;
  const m = heroList[heroIdx], hero = $('#hero');
  const bg = document.createElement('div');
  bg.className = 'hero-bg';
  bg.style.backgroundImage = `url('${purl(m)}')`;
  hero.prepend(bg);
  requestAnimationFrame(() => requestAnimationFrame(() => bg.classList.add('on')));
  $$('.hero-bg', hero).slice(1).forEach(old => { old.classList.remove('on'); setTimeout(() => old.remove(), 1500); });

  const s = ov(m);
  const t = $('#heroText');
  t.innerHTML = `<div class="eyebrow">${s >= 0 ? 'Вы оценили · ' + fmt(s) : 'В центре внимания'}</div>
    <h1>${esc(m.title)}</h1>
    <div class="meta"><b>${m.year || ''}</b>${m.genres.slice(0, 3).map(g => '<i>●</i>' + esc(g)).join('')}<i>●</i>реж. ${esc(m.director || '—')}</div>
    <p>${esc(m.desc || '')}</p>
    <div class="acts"><button class="btn grad" id="heroRate">Оценить фильм</button><button class="btn ghost" id="heroNext">Следующий →</button></div>`;
  t.classList.remove('swap'); void t.offsetWidth; t.classList.add('swap');
  const p = $('#heroPoster');
  p.innerHTML = posterHTML(m, false);
  p.classList.remove('swap'); void p.offsetWidth; p.classList.add('swap');
  p.onclick = () => openDetail(m, $('.poster', p));
  $('#heroRate').onclick = () => openDetail(m, $('.poster', p));
  $('#heroNext').onclick = () => showHero(heroIdx + 1);
  $$('#heroDots span').forEach((d, k) => { d.classList.remove('on'); if (k === heroIdx) { void d.offsetWidth; d.classList.add('on'); } });

  clearTimeout(heroTimer);
  heroTimer = setTimeout(function tick() {
    if (S.cur || $('#hero').matches(':hover') || S.view !== 'all') { heroTimer = setTimeout(tick, 2000); return; }
    showHero(heroIdx + 1);
  }, 10000);
}

const VIEW_TITLES = { all: 'Каталог', fav: 'Избранное', watch: 'Смотреть позже', coll: 'Коллекции', stats: 'Статистика' };

// фильм без года проходит только при полном диапазоне
const yearsAll = () => S.y1 <= S.yMin && S.y2 >= S.yMax;
const inYears = m => m.year ? m.year >= S.y1 && m.year <= S.y2 : yearsAll();
// при выбранном пороге фильмы без рейтинга IMDb скрываются
const imdbOk = m => !S.imdbMin || (m.imdb || 0) >= S.imdbMin;

function updateCounter() {
  const rated = S.movies.filter(m => ov(m) >= 0).length;
  $('#counter').innerHTML = `<b>${S.list.length}</b> из ${S.movies.length} · оценено <b>${rated}</b>`;
}

function render() {
  const before = visibleRects();
  // collList — список коллекций, coll — открытая коллекция (её фильмы показываются обычной сеткой)
  const stats = S.view === 'stats', coll = S.view === 'coll' ? curColl() : null, collList = S.view === 'coll' && !coll;
  const noGrid = stats || collList;
  document.body.className = 'v-' + S.view + (document.body.classList.contains('cols3') ? ' cols3' : '');
  $('#sectTitle').textContent = coll ? coll.name : VIEW_TITLES[S.view];
  $('#counter').classList.toggle('hidden', noGrid);
  $('#hero').classList.toggle('hidden', S.view !== 'all');
  $('#stats').classList.toggle('hidden', !stats);
  $('#colls').classList.toggle('hidden', !collList);
  $('#filters').classList.toggle('hidden', noGrid);
  grid.classList.toggle('hidden', noGrid);
  renderSectActs(coll, collList);
  if (noGrid) {
    $('#empty').classList.add('hidden');
    $('#personChip').classList.add('hidden');
    $('#resetF').classList.add('hidden');
    if (stats) renderStats(); else renderColls();
    return;
  }
  // пустой список без фильтров — подсказка, как его наполнить, а не «ничего не нашлось»
  const bare = !filtersOn() && !S.q && !S.person;
  const [eT, eS] = coll && !coll.ids.length ? ['В коллекции пока пусто', 'Откройте любой фильм и нажмите «В коллекцию»']
    : bare && S.view === 'fav' ? ['В избранном пока пусто', 'Откройте фильм и нажмите «♥ В избранное» — он появится здесь']
    : bare && S.view === 'watch' ? ['Список «Смотреть позже» пуст', 'Нажмите «Посмотреть» в окне фильма — и он будет ждать вас здесь']
    : ['Ничего не нашлось', 'Попробуйте другой запрос или сбросьте фильтры'];
  $('#emptyT').textContent = eT;
  $('#emptyS').textContent = eS;

  const pc = $('#personChip');
  pc.classList.toggle('hidden', !S.person);
  if (S.person) pc.innerHTML = `Фильмы: <b>${esc(S.person)}</b><i>✕</i>`;
  $('#resetF').classList.toggle('hidden', !filtersOn());

  S.list = sorted(S.movies.filter(m => matches(m)));
  shown = Math.min(S.list.length, PAGE);
  grid.replaceChildren(...S.list.slice(0, shown).map(cardOf));
  playGrid(before);
  fillGrid();
  $('#empty').classList.toggle('hidden', S.list.length > 0);
  updatePills();
  updateCounter();
  syncMobileFilters();
}

/* ---------- экран коллекций ---------- */
// кнопки справа от заголовка: «Новая коллекция» в списке, «Все коллекции» и «Изменить» внутри коллекции
function renderSectActs(coll, list) {
  const box = $('#sectActs'), desc = $('#collDesc');
  desc.textContent = coll ? coll.desc || '' : '';
  desc.classList.toggle('hidden', !(coll && coll.desc));
  box.innerHTML = list ? `<button class="btn sm accent" data-ca="new">${ICON.plus}Новая коллекция</button>`
    : coll ? `<button class="btn sm" data-ca="back">← Все коллекции</button><button class="btn sm" data-ca="edit">Изменить</button>` : '';
  $$('[data-ca]', box).forEach(b => b.onclick = () => {
    const a = b.dataset.ca;
    if (a === 'new') openCollEditor(null);
    else if (a === 'edit') openCollEditor(coll);
    else { S.coll = null; render(); window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }); }
  });
}

function renderColls() {
  const box = $('#colls');
  const tiles = S.colls.map((c, i) => {
    const ms = c.ids.map(id => S.movies.find(m => m.id === id)).filter(Boolean);
    const cover = ms.slice(0, 4).map(m => posterHTML(m, false)).join('');
    return `<button class="coll" data-id="${esc(c.id)}" style="animation-delay:${i * 40}ms">
      <div class="coll-cover">${cover || `<div class="coll-ph">${ICON.coll}</div>`}</div>
      <div class="coll-t">${esc(c.name)}</div>
      <div class="coll-n">${ms.length} ${plural(ms.length, 'фильм', 'фильма', 'фильмов')}${c.desc ? ' · ' + esc(c.desc) : ''}</div>
    </button>`;
  }).join('');
  // новую коллекцию создаёт кнопка у заголовка; пока коллекций нет — подсказка, зачем они
  box.innerHTML = tiles || `<div class="coll-intro">Собирайте свои подборки: «На Новый год», «Посмотреть с друзьями», «Весь Нолан».
      Фильм добавляется в коллекцию из его окна — кнопкой <b>«В коллекцию»</b>.</div>`;
  $$('.coll[data-id]', box).forEach(b => b.onclick = () => { S.coll = b.dataset.id; render(); window.scrollTo({ top: 0 }); });
}

// создание и правка коллекции — в том же окне, что и редактор фильма
function openCollEditor(c) {
  const isNew = !c;
  editor.innerHTML = `<div class="backdrop"></div>
    <div class="sheet form coll-form">
      <button class="x" title="Закрыть (Esc)">✕</button>
      <h2>${isNew ? 'Новая коллекция' : 'Изменить коллекцию'}</h2>
      <label class="field"><span>Название *</span><input name="cname" maxlength="60" value="${esc(c ? c.name : '')}" placeholder="Например, «На Новый год»" autocomplete="off"></label>
      <label class="field"><span>Описание — по желанию</span><textarea name="cdesc" maxlength="300" placeholder="Для чего эта подборка">${esc(c ? c.desc : '')}</textarea></label>
      <div class="foot">${isNew ? '' : '<button class="btn danger" data-act="cdel">Удалить</button><span class="sp"></span>'}
        <button class="btn" data-act="cancel">Отмена</button><button class="btn grad" data-act="csave">${isNew ? 'Создать' : 'Сохранить'}</button></div>
    </div>`;
  const close = () => editor.classList.remove('open');
  $('.x', editor).onclick = $('.backdrop', editor).onclick = $('[data-act="cancel"]', editor).onclick = close;
  const nameIn = $('[name="cname"]', editor);
  const save = () => {
    const name = nameIn.value.trim(), desc = $('[name="cdesc"]', editor).value.trim();
    if (!name) { nameIn.focus(); toast('Введите название коллекции'); return; }
    if (isNew) c = newColl(name, desc);
    else { Object.assign(c, { name, desc }); collsChanged(); }
    close();
    // новая коллекция сразу открывается — там подсказка, как добавить фильмы
    if (S.view === 'coll') { S.coll = c.id; render(); }
    toast(isNew ? `🗂 Коллекция «${name}» создана` : 'Сохранено');
  };
  $('[data-act="csave"]', editor).onclick = save;
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  const del = $('[data-act="cdel"]', editor);
  if (del) del.onclick = () => {
    if (!confirm(`Удалить коллекцию «${c.name}»?\nСами фильмы и оценки останутся.`)) return;
    S.colls = S.colls.filter(x => x !== c);
    if (S.coll === c.id) S.coll = null;
    collsChanged(); close(); render();
    toast('Коллекция удалена');
  };
  editor.classList.add('open');
  setTimeout(() => nameIn.focus(), 100);
}

// список коллекций в окне фильма: галочки и создание новой прямо отсюда
function paintCollPick(m) {
  const box = $('.coll-pick', detail);
  if (!box) return;
  box.innerHTML = `<div class="cp-h">Коллекции</div>
    ${S.colls.length ? `<div class="cp-list">${S.colls.map(c => `<label class="cp-row"><input type="checkbox" data-c="${esc(c.id)}" ${c.ids.includes(m.id) ? 'checked' : ''}>
      <span class="cp-box"></span><span class="cp-name">${esc(c.name)}</span><small>${c.ids.length}</small></label>`).join('')}</div>`
    : '<div class="cp-none">Коллекций пока нет — создайте первую</div>'}
    <div class="cp-new"><input placeholder="Новая коллекция…" maxlength="60" autocomplete="off"><button class="btn sm accent">Создать</button></div>`;
  $$('[data-c]', box).forEach(i => i.onchange = () => {
    const c = S.colls.find(x => x.id === i.dataset.c);
    if (!c) return;
    c.ids = i.checked ? [...new Set([...c.ids, m.id])] : c.ids.filter(id => id !== m.id);
    collsChanged(); paintCollPick(m); updateHeart(m);
    toast(i.checked ? `🗂 Добавлено в «${c.name}»` : `Убрано из «${c.name}»`);
  });
  const inp = $('.cp-new input', box);
  const make = () => {
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    newColl(name, '', [m.id]);
    paintCollPick(m); updateHeart(m);
    toast(`🗂 Коллекция «${name}» создана`);
  };
  $('.cp-new .btn', box).onclick = make;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
}

// сетка дорисовывается порциями при прокрутке: в DOM только то, до чего дошёл пользователь
const PAGE = 60;
let shown = 0;
const gridMore = document.createElement('div');
gridMore.className = 'grid-more';
grid.after(gridMore);
function showMore() {
  const next = S.list.slice(shown, shown + PAGE);
  if (!next.length) return false;
  const els = next.map(cardOf);
  els.forEach(el => { el.classList.remove('in'); el.style.removeProperty('--d'); reveal.observe(el); });
  grid.append(...els);
  shown += next.length;
  return true;
}
// догружаем, пока низ сетки ближе полутора экранов
function fillGrid() {
  if (grid.classList.contains('hidden')) return;
  while (shown < S.list.length && gridMore.getBoundingClientRect().top < innerHeight * 2.5 && showMore());
}
new IntersectionObserver(es => { if (es[0].isIntersecting) fillGrid(); }, { rootMargin: '0px 0px 150% 0px' }).observe(gridMore);

function buildPills() {
  const items = [{ k: 'any', name: 'Любая' }, ...TIERS.map((t, i) => ({ k: i, name: t.name, t })), { k: 'none', name: 'Без оценки' }];
  $('#tiers').innerHTML = items.map(it => `<button class="pill ${it.t ? '' : 'plain'}" data-k="${it.k}"
      ${it.t ? `style="--c1:${it.t.c1};--c2:${it.t.c2}"` : ''}>${it.t ? '<span class="dot"></span>' : ''}${it.name}<span class="n">0</span></button>`).join('');
  $$('#tiers .pill').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    S.tier = (k === 'any' || k === 'none') ? k : +k;
    render();
  });
}

function updatePills() {
  const base = S.movies.filter(m => matches(m, true));
  $$('#tiers .pill').forEach(b => {
    const k = b.dataset.k;
    const n = k === 'any' ? base.length : k === 'none' ? base.filter(m => ov(m) < 0).length
      : base.filter(m => { const s = ov(m); return s >= 0 && tierIdx(s) === +k; }).length;
    b.querySelector('.n').textContent = n;
    b.classList.toggle('on', String(S.tier) === k);
  });
}

function buildGenres() {
  const counts = {};
  S.movies.forEach(m => m.genres.forEach(g => counts[g] = (counts[g] || 0) + 1));
  const list = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'ru'));
  if (S.genre && !counts[S.genre]) S.genre = null;
  $('#genres').innerHTML = `<button class="chip ${S.genre ? '' : 'on'}" data-g="">Все жанры</button>` +
    list.map(g => `<button class="chip ${S.genre === g ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}<small>${counts[g]}</small></button>`).join('');
  $$('#genres .chip').forEach(b => b.onclick = () => {
    S.genre = b.dataset.g || null;
    $$('#genres .chip').forEach(x => x.classList.toggle('on', x === b));
    render();
  });
}

function buildSort() {
  $('#sortMenu').innerHTML = SORTS.map(([k, n]) => `<button data-k="${k}">${n}</button>`).join('');
  const sync = () => {
    $('#sortLabel').textContent = SORTS.find(s => s[0] === S.sort)[1];
    $$('#sortMenu button').forEach(b => b.classList.toggle('on', b.dataset.k === S.sort));
  };
  $$('#sortMenu button').forEach(b => b.onclick = () => { S.sort = b.dataset.k; keep('kc_sort', S.sort); sync(); $('#sortDd').classList.remove('open'); render(); });
  $('#sortBtn').onclick = e => { e.stopPropagation(); ddToggle('#sortDd'); };
  sync();
}

// открыто только одно выпадающее меню; клик мимо закрывает все
const ddToggle = sel => $$('.dd').forEach(d => d.classList.toggle('open', d.matches(sel) && !d.classList.contains('open')));
document.addEventListener('click', e => { if (!e.target.closest('.dd-menu')) $$('.dd').forEach(d => d.classList.remove('open')); });
// на телефоне меню — панель снизу экрана: под ней затемнение, панель можно смахнуть вниз
new MutationObserver(() => document.documentElement.classList.toggle('dd-on', !!$('.dd.open')))
  .observe($('#filters'), { subtree: true, attributes: true, attributeFilter: ['class'] });
$$('.dd-menu').forEach(menu => {
  let y0 = 0, dy = 0, drag = false;
  menu.addEventListener('touchstart', e => { drag = menu.scrollTop <= 0 && e.touches.length === 1; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  menu.addEventListener('touchmove', e => {
    if (!drag) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { menu.style.transition = 'none'; menu.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  menu.addEventListener('touchend', () => {
    if (!drag) return;
    drag = false; menu.style.transition = ''; menu.style.transform = '';
    if (dy > 70) menu.closest('.dd').classList.remove('open');
  }, { passive: true });
});

// фильтры, кроме поиска и фильмографии, — для кнопки «Сбросить фильтры»
const filtersOn = () => S.tier !== 'any' || !!S.genre || !!S.imdbMin || !!S.country || !yearsAll();
$('#resetF').onclick = () => {
  Object.assign(S, { tier: 'any', genre: null, imdbMin: 0, country: null, y1: S.yMin, y2: S.yMax });
  buildGenres(); buildYears(); syncImdb(); syncCountry();
  render();
};

/* ---------- телефон: меньше кнопок на главном экране ---------- */
// фильтры (категории, IMDb, страна, годы) уезжают в панель снизу; на экране остаются кнопка «Фильтры», сортировка и жанры
const phoneMQ = matchMedia('(max-width: 640px)');
const filtersEl = $('#filters');
function placeForPhone() {
  if (phoneMQ.matches) $('#mBar').append($('#sortDd'), $('.genres-box'));
  else { filtersEl.classList.remove('open'); $('#filters .tb-row').append($('#sortDd')); $('.genres-wrap').prepend($('.genres-box')); }
}
phoneMQ.addEventListener('change', placeForPhone);
placeForPhone();
const setFilt = on => filtersEl.classList.toggle('open', on);
new MutationObserver(() => document.documentElement.classList.toggle('filt-on', filtersEl.classList.contains('open')))
  .observe(filtersEl, { attributes: true, attributeFilter: ['class'] });
$('#mFilt').onclick = e => { e.stopPropagation(); setFilt(true); };
$('#mFiltReset').onclick = () => $('#resetF').onclick();
$('#mFiltDone').onclick = () => {
  setFilt(false);
  requestAnimationFrame(() => $('#sectHead').scrollIntoView({ behavior: calm ? 'auto' : 'smooth' }));
};
// нажатие на затемнение: сначала закрывается открытый список, потом сама панель
$('#ddScrim').addEventListener('click', () => { if (!$('.dd.open')) setFilt(false); });
// панель смахивается вниз за заголовок
(() => {
  let y0 = 0, dy = 0, drag = false;
  filtersEl.addEventListener('touchstart', e => { drag = filtersEl.scrollTop <= 0 && !!e.target.closest('.m-sheet-h'); y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  filtersEl.addEventListener('touchmove', e => { if (!drag) return; dy = e.touches[0].clientY - y0; if (dy > 0) { filtersEl.style.transition = 'none'; filtersEl.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  filtersEl.addEventListener('touchend', () => { if (!drag) return; drag = false; filtersEl.style.transition = filtersEl.style.transform = ''; if (dy > 70) setFilt(false); }, { passive: true });
})();
function syncMobileFilters() {
  const n = (S.tier !== 'any') + !!S.imdbMin + !!S.country + !yearsAll();
  $('#mFiltN').textContent = n;
  $('#mFiltN').classList.toggle('hidden', !n);
  $('#mFilt').classList.toggle('set', !!n);
  $('#mFiltReset').classList.toggle('hidden', !filtersOn());
  $('#mFiltDone').textContent = S.list.length ? `Показать ${S.list.length} ${plural(S.list.length, 'фильм', 'фильма', 'фильмов')}` : 'Ничего не нашлось';
}

// меню «Ещё»: добавить фильм, тема, экскурсия
const moreSheet = $('#moreSheet');
$('#moreBtn').onclick = () => {
  $('#moreTheme').textContent = document.documentElement.dataset.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
  moreSheet.classList.add('open');
};
moreSheet.addEventListener('click', e => {
  const b = e.target.closest('[data-more]');
  if (!b && !e.target.closest('.msheet-scrim')) return;
  moreSheet.classList.remove('open');
  if (!b) return;
  if (b.dataset.more === 'add') openEditor(null);
  else if (b.dataset.more === 'theme') setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  else startTour();
});

function buildImdb() {
  $('#imdbMenu').innerHTML = IMDB_MIN.map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('');
  syncImdb = () => {
    $('#imdbLabel').textContent = S.imdbMin ? S.imdbMin + '+' : '';
    $('#imdbDd').classList.toggle('set', !!S.imdbMin);
    $$('#imdbMenu button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.imdbMin));
  };
  $$('#imdbMenu button').forEach(b => b.onclick = () => { S.imdbMin = +b.dataset.v; syncImdb(); $('#imdbDd').classList.remove('open'); render(); });
  $('#imdbBtn').onclick = e => { e.stopPropagation(); ddToggle('#imdbDd'); };
  syncImdb();
}
let syncImdb = () => { }, syncCountry = () => { };

// страны — по числу фильмов в каталоге; список пересобирается при добавлении своих фильмов
function buildCountry() {
  const counts = {};
  S.movies.forEach(m => (m.country || []).forEach(c => counts[c] = (counts[c] || 0) + 1));
  const list = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'ru'));
  if (S.country && !counts[S.country]) S.country = null;
  $('#countryMenu').innerHTML = `<button data-c="">Все страны</button>` +
    list.map(c => `<button data-c="${esc(c)}">${esc(c)}<small>${counts[c]}</small></button>`).join('');
  syncCountry = () => {
    $('#countryLabel').textContent = S.country || 'Страна';
    $('#countryDd').classList.toggle('set', !!S.country);
    $$('#countryMenu button').forEach(b => b.classList.toggle('on', b.dataset.c === (S.country || '')));
  };
  $$('#countryMenu button').forEach(b => b.onclick = () => { S.country = b.dataset.c || null; syncCountry(); $('#countryDd').classList.remove('open'); render(); });
  $('#countryBtn').onclick = e => { e.stopPropagation(); ddToggle('#countryDd'); };
  syncCountry();
}

function moveTabInd() {
  const on = $('#tabs button.on'), ind = $('.tab-ind');
  // на телефоне и планшете индикатор — стеклянная капсула во всю кнопку
  const pad = matchMedia('(max-width: 1000px)').matches ? 0 : parseFloat(getComputedStyle(on).paddingLeft);
  ind.style.left = (on.offsetLeft + pad) + 'px';
  ind.style.width = Math.max(0, on.offsetWidth - pad * 2) + 'px';
}

// фильмография: все фильмы человека из каталога, остальные фильтры сбрасываются, чтобы ничего не спряталось
function showPerson(name) {
  closeDetail();
  Object.assign(S, { person: name, q: '', genre: null, tier: 'any', imdbMin: 0, country: null, y1: S.yMin, y2: S.yMax });
  $('#q').value = '';
  buildGenres(); buildYears(); syncImdb(); syncCountry();
  if (S.view !== 'all') $('#tabs button[data-view="all"]').click(); else render();
  requestAnimationFrame(() => $('#sectHead').scrollIntoView({ behavior: calm ? 'auto' : 'smooth' }));
}
$('#personChip').onclick = () => { S.person = null; render(); };

grid.addEventListener('click', e => {
  const c = e.target.closest('.card');
  if (c) openDetail(S.movies.find(m => m.id === c.dataset.id), $('.poster', c));
});

/* ================= карточка фильма ================= */
const detail = $('#detail');

function critRow(name, key) {
  const pips = Array.from({ length: 10 }, (_, i) => `<div class="pip" data-v="${i + 1}" style="--k:${i}"><b>${i + 1}</b></div>`).join('');
  return `<div class="crit ${key === 'manual' ? 'manual off' : ''}" data-key="${esc(key)}">
    <div class="cn">${esc(name)}${CRIT_INFO[key] ? `<span class="qi" tabindex="0" aria-label="Что это значит">?<span class="tip" role="tooltip">${CRIT_INFO[key]}</span></span>` : ''}</div><div class="pips">${pips}</div><div class="cv">—</div></div>`;
}

// «?» у критерия: наведение показывает подсказку, клик закрепляет, повторный клик или клик мимо — убирает
document.addEventListener('click', e => {
  const q = e.target.closest('.qi');
  $$('.qi.open').forEach(x => { if (x !== q) x.classList.remove('open'); });
  if (q && !e.target.closest('.tip')) q.classList.toggle('open');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.qi.open').forEach(x => x.classList.remove('open')); });

// имя — кнопка: открывает все фильмы этого человека в каталоге
const personLinks = list => list.length
  ? list.map(p => `<button class="plink" data-person="${esc(p)}" title="Все фильмы в каталоге">${esc(p)}</button>`).join(', ')
  : '—';

// прямые ссылки на страницу фильма в онлайн-кинотеатрах — только там, где фильм точно есть
// (okko, kp, ivi в movies.json: из Wikidata и проверенных страниц okko.tv)
function watchLinks(m) {
  const out = '<svg viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/></svg>';
  const links = [
    m.okko && ['Okko', /^https?:/.test(m.okko) ? m.okko : 'https://okko.tv/' + m.okko],
    m.kp && ['Кинопоиск', 'https://www.kinopoisk.ru/film/' + encodeURIComponent(m.kp) + '/'],
    // в базе только фильмы, которые на Иви можно смотреть, а не просто карточки с описанием
    m.ivi && ['Иви', 'https://www.ivi.tv/watch/' + encodeURIComponent(m.ivi)],
  ].filter(Boolean);
  if (!links.length) return '<span class="where-none">Нет ссылки для просмотра фильма, придётся Вам найти его самим</span>';
  return links.map(([n, u]) => `<a class="wlink" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${n}${out}</a>`).join('');
}

/* ---------- журнал просмотров и прогресс сериала ---------- */
// даты хранятся как «ГГГГ-ММ-ДД» по местному времени
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayFmt = k => new Date(k + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function paintWatchLog(m) {
  const box = $('.wlog', detail);
  if (!box) return;
  const r = R(m.id) || {}, views = [...(r.views || [])].sort(), ss = r.seasons || 0;
  box.innerHTML = `${isSeries(m) ? `<div class="wl-row"><span class="wl-l">Сезоны</span>
      <div class="stepper"><button data-ss="-1" title="Меньше" ${ss ? '' : 'disabled'}>−</button><b>${ss}</b><button data-ss="1" title="Больше">+</button></div>
      <span class="wl-h">${plural(ss, 'сезон посмотрен', 'сезона посмотрено', 'сезонов посмотрено')}</span>
      <label class="switch"><input type="checkbox" data-done ${r.done ? 'checked' : ''}><span class="tr"></span>Досмотрел до конца</label></div>` : ''}
    <div class="wl-row"><span class="wl-l">Просмотры</span>
      <div class="wl-views">${views.length ? views.map(v => `<span class="vchip">${dayFmt(v)}<button data-vdel="${v}" title="Убрать">✕</button></span>`).join('') : '<span class="wl-h">ещё не отмечали</span>'}</div>
      <button class="btn sm" data-vadd>+ Сегодня</button>
      <input type="date" class="vdate" max="${dayKey()}" title="Отметить просмотр в другой день">
    </div>
    ${views.length > 1 ? `<div class="wl-h wl-re">↻ Пересмотрено ${views.length - 1} ${plural(views.length - 1, 'раз', 'раза', 'раз')}</div>` : ''}`;

  const done = msg => { const rr = R(m.id); if (rr) touch(rr); paintWatchLog(m); const c = cards.get(m.id); if (c) badges(c, m); if (msg) toast(msg); };
  $$('[data-ss]', box).forEach(b => b.onclick = () => { const rr = getR(m.id); rr.seasons = Math.max(0, (rr.seasons || 0) + +b.dataset.ss); done(); });
  const dn = $('[data-done]', box);
  if (dn) dn.onchange = () => { getR(m.id).done = dn.checked; done(dn.checked ? '✓ Сериал досмотрен' : ''); };
  const add = k => {
    const rr = getR(m.id);
    if ((rr.views || []).includes(k)) { toast('Этот просмотр уже отмечен'); return; }
    rr.views = [...(rr.views || []), k];
    done(rr.views.length > 1 ? '↻ Пересмотр отмечен' : '🎬 Просмотр отмечен');
  };
  $('[data-vadd]', box).onclick = () => add(dayKey());
  $('.vdate', box).onchange = e => { if (e.target.value) add(e.target.value); };
  $$('[data-vdel]', box).forEach(b => b.onclick = () => {
    const rr = getR(m.id), i = rr.views.indexOf(b.dataset.vdel);
    if (i >= 0) rr.views.splice(i, 1);
    done();
  });
}

function openDetail(m, from) {
  if (!m) return;
  S.cur = m;
  const r = R(m.id);
  const idx = S.list.indexOf(m);
  detail.innerHTML = `
    <div class="backdrop"><div class="art" style="background-image:url('${purl(m)}')"></div></div>
    ${idx > 0 ? '<button class="navbtn prev" title="Предыдущий (←)">‹</button>' : ''}
    ${idx >= 0 && idx < S.list.length - 1 ? '<button class="navbtn next" title="Следующий (→)">›</button>' : ''}
    <div class="sheet">
      <button class="x" title="Закрыть (Esc)">✕</button>
      <div class="d-wrap">
        <div class="d-left">
          <div class="d-poster">${posterHTML(m, false)}</div>
          <div class="d-mhead">
            <div class="d-title">${esc(m.title)}</div>
            <div class="d-sub">${m.orig && m.orig !== m.title ? esc(m.orig) + ' · ' : ''}${m.year || ''}${imdbTag(m)}</div>
          </div>
          <div class="d-actions">
            <button class="btn heart" data-act="fav"></button>
            <button class="btn watch" data-act="watch"></button>
            <button class="btn collb" data-act="coll" aria-expanded="false"></button>
            <button class="btn accent" data-act="share" title="Карточка-картинка с вашей оценкой">${ICON.share} Карточка</button>
            <div class="coll-pick hidden"></div>
            <button class="btn sm pmore" data-act="pmore">Сменить постер…</button>
            <button class="btn sm" data-act="web">Постер онлайн</button>
            <button class="btn sm" data-act="file">Постер из файла</button>
            ${m.custom ? '<button class="btn sm" data-act="edit">Изменить</button><button class="btn sm danger" data-act="del">Удалить</button>' : ''}
          </div>
        </div>
        <div class="d-right">
          <div class="d-title">${esc(m.title)}</div>
          <div class="d-sub">${m.orig && m.orig !== m.title ? esc(m.orig) + ' · ' : ''}${m.year || ''}${imdbTag(m)}</div>
          <div class="d-chips">${m.genres.map(g => `<span>${esc(g)}</span>`).join('')}</div>
          <dl class="d-info">
            <dt>Режиссёр</dt><dd class="who">${personLinks(people(m.director))}</dd>
            ${m.country && m.country.length ? `<dt>Страна</dt><dd>${m.country.map(esc).join(', ')}</dd>` : ''}
            <dt>В ролях</dt><dd class="actors">${personLinks(m.actors)}</dd>
          </dl>
          ${m.desc ? `<p class="d-desc">${esc(m.desc)}</p>` : ''}
          <div class="where"><span class="where-l">Где смотреть</span>${watchLinks(m)}</div>
          <div class="wlog"></div>
          <div class="rate">
            <div>
              <h3>Ваша оценка</h3>
              <div class="hint">${touchUI ? 'Нажмите на деление — поставить балл · повторное нажатие — убрать' : 'Клик — поставить балл · повторный клик или правая кнопка — убрать'}</div>
              ${CRIT.map(c => critRow(c, c)).join('')}
              <label class="switch"><input type="checkbox" id="manualSw"><span class="tr"></span>Поставить общую оценку вручную</label>
              ${critRow('Общая', 'manual')}
            </div>
            <div class="ring-box">
              <div class="ring">
                <svg viewBox="0 0 200 200"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style="stop-color:var(--t1)"/><stop offset="1" style="stop-color:var(--t2)"/></linearGradient></defs>
                  <circle class="trk" cx="100" cy="100" r="86"/>
                  <circle class="prg" cx="100" cy="100" r="86" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>
                <div class="num"><b>—</b><small>общая оценка</small></div>
              </div>
              <div class="tier-name none">Ещё не оценён</div>
            </div>
            <div class="scale">
              <div class="bars">${[...TIERS].reverse().map(t => `<div class="bar" style="--c1:${t.c1};--c2:${t.c2}"></div>`).join('')}</div>
              <div class="marker" style="left:0;opacity:0"></div>
              <div class="labels">${[...TIERS].reverse().map(t => `<div style="--c1:${t.c1}">${t.name}<small>${t.range}</small></div>`).join('')}</div>
            </div>
          </div>
          <div class="notes"><label>Заметки</label><textarea placeholder="Что запомнилось, с кем смотрели, что пересмотреть…">${esc(r ? r.comment : '')}</textarea></div>
        </div>
      </div>
    </div>`;

  $$('.crit', detail).forEach(row => {
    const key = row.dataset.key;
    const val = () => { const rr = R(m.id); return !rr ? 0 : key === 'manual' ? (rr.manual || 0) : ((rr.scores || {})[key] || 0); };
    paintRow(row, val());
    const pips = $('.pips', row);
    pips.addEventListener('mousemove', e => { const p = e.target.closest('.pip'); if (p) paintRow(row, val(), +p.dataset.v); });
    pips.addEventListener('mouseleave', () => paintRow(row, val()));
    // сброс ручной оценки выключает и переключатель, иначе он остаётся включённым при пустой строке
    const syncManual = () => { if (key === 'manual' && !val()) { sw.checked = false; manualRow.classList.add('off'); } };
    pips.addEventListener('click', e => {
      const p = e.target.closest('.pip');
      if (!p) return;
      const v = +p.dataset.v;
      setScore(m, key, v === val() ? 0 : v);
      paintRow(row, val());
      syncManual();
      p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit');
    });
    pips.addEventListener('contextmenu', e => { e.preventDefault(); setScore(m, key, 0); paintRow(row, val()); syncManual(); });
  });

  const sw = $('#manualSw', detail), manualRow = $('.crit.manual', detail);
  sw.checked = !!(r && r.manual > 0);
  manualRow.classList.toggle('off', !sw.checked);
  sw.onchange = () => {
    const rr = getR(m.id);
    rr.manual = sw.checked ? Math.max(1, Math.round(autoAvg(rr) > 0 ? autoAvg(rr) : 7)) : 0;
    manualRow.classList.toggle('off', !sw.checked);
    paintRow(manualRow, rr.manual);
    touch(rr); refreshScore(m);
  };

  $('textarea', detail).addEventListener('input', debounce(e => { const rr = getR(m.id); rr.comment = e.target.value; touch(rr); }, 400));
  $('.x', detail).onclick = closeDetail;
  $('.backdrop', detail).onclick = closeDetail;
  const prev = $('.navbtn.prev', detail), next = $('.navbtn.next', detail);
  if (prev) prev.onclick = () => step(-1);
  if (next) next.onclick = () => step(1);
  $$('[data-act]', detail).forEach(b => b.onclick = () => action(m, b.dataset.act, b));
  $$('[data-person]', detail).forEach(b => b.onclick = () => showPerson(b.dataset.person));
  paintWatchLog(m);

  updateHeart(m);
  refreshScore(m, true);
  setAccent(colors[m.id] || null);
  if (!detail.classList.contains('open')) {
    detail.classList.add('open');
    document.body.style.overflow = 'hidden';
    const sheet = $('.sheet', detail), t = flyFrom(sheet, from);
    if (t) sheet.animate([{ transform: t, opacity: 0 }, { opacity: 1, offset: .3 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: EASE });
  }
}

function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }

function closeDetail() {
  const sheet = $('.sheet', detail), card = S.cur && cards.get(S.cur.id);
  const t = sheet && card && card.isConnected && flyFrom(sheet, $('.poster', card));
  if (t) sheet.animate([{ transform: 'none', opacity: 1 }, { opacity: 1, offset: .55 }, { transform: t, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  detail.classList.remove('open');
  document.body.style.overflow = '';
  S.cur = null;
  setAccent(null);
  // в открытой коллекции фильм могли убрать или добавить — сетку обновляем после закрытия, а не во время листания
  if (S.view === 'coll' && curColl()) render();
}

function step(d) {
  const i = S.list.indexOf(S.cur);
  if (i < 0) return;
  const m = S.list[i + d];
  if (m) openDetail(m);
}

function paintRow(row, value, preview) {
  const shown = preview || value;
  const t = TIERS[tierIdx(shown || 0)];
  row.style.setProperty('--t1', t.c1);
  row.style.setProperty('--t2', t.c2);
  $$('.pip', row).forEach(p => {
    const v = +p.dataset.v;
    p.classList.toggle('f', v <= value && !(preview && v > preview));
    p.classList.toggle('pv', !!preview && v <= preview && v > value);
  });
  const cv = $('.cv', row);
  cv.textContent = shown ? shown : '—';
  cv.style.color = shown ? t.c1 : '';
}

function setScore(m, key, v) {
  const r = getR(m.id);
  if (key === 'manual') r.manual = v;
  else if (v > 0) r.scores[key] = v;
  else delete r.scores[key];
  touch(r);
  refreshScore(m);
}

let shownScore = -1;
function refreshScore(m, initial) {
  const s = ov(m);
  const ring = $('.ring', detail), name = $('.tier-name', detail);
  const num = $('.num b', ring), prg = $('.prg', ring);
  const ti = s >= 0 ? tierIdx(s) : -1;
  const t = ti >= 0 ? TIERS[ti] : null;
  ring.style.setProperty('--t1', t ? t.c1 : '#555');
  ring.style.setProperty('--t2', t ? t.c2 : '#333');
  name.style.setProperty('--t1', t ? t.c1 : '');
  requestAnimationFrame(() => prg.setAttribute('stroke-dashoffset', RING_C * (1 - Math.max(0, s) / 10)));
  const prevName = name.textContent;
  name.textContent = t ? t.name : 'Ещё не оценён';
  name.classList.toggle('none', !t);
  if (t && prevName !== t.name && !initial) { name.classList.remove('bump'); void name.offsetWidth; name.classList.add('bump'); }
  countTo(num, initial ? 0 : shownScore, s);
  shownScore = s;

  // шкала категорий
  const k = ti >= 0 ? TIERS.length - 1 - ti : -1;
  $$('.scale .bar', detail).forEach((b, i) => b.classList.toggle('on', i === k));
  $$('.scale .labels div', detail).forEach((b, i) => b.classList.toggle('on', i === k));
  const marker = $('.scale .marker', detail);
  if (t) {
    const pos = (k + Math.min(1, Math.max(0, (s - t.lo) / (t.hi - t.lo)))) / TIERS.length * 100;
    marker.style.left = pos + '%';
    marker.style.opacity = 1;
  } else marker.style.opacity = 0;

  const card = cards.get(m.id);
  if (card) badges(card, m);
  updatePills();
  updateCounter();
  syncMobileFilters();
}

function countTo(el, from, to) {
  cancelAnimationFrame(el._raf);
  if (to < 0) { el.textContent = '—'; return; }
  const a = Math.max(0, from), t0 = performance.now(), dur = 900;
  const tick = now => {
    const p = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - p, 4);
    const v = a + (to - a) * e;
    el.textContent = p < 1 ? v.toFixed(1) : fmt(to);
    if (p < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

function updateHeart(m) {
  const b = $('[data-act="fav"]', detail), on = !!(R(m.id) && R(m.id).favorite);
  b.classList.toggle('on', on);
  b.innerHTML = `<span class="hi">${on ? '♥' : '♡'}</span> ${on ? 'В избранном' : 'В избранное'}`;
  const w = $('[data-act="watch"]', detail), won = !!(R(m.id) && R(m.id).watch);
  w.classList.toggle('on', won);
  w.innerHTML = `<span class="hi">${ICON.bookmark}</span> ${won ? 'В списке' : 'Посмотреть'}`;
  w.title = won ? 'Убрать из «Смотреть позже»' : 'Добавить в «Смотреть позже»';
  const cb = $('[data-act="coll"]', detail), n = collsOf(m).length;
  cb.classList.toggle('on', n > 0);
  cb.innerHTML = `<span class="hi">${ICON.coll}</span> ${n ? 'В коллекциях: ' + n : 'В коллекцию'}`;
}

function toggleWatch(m) {
  const r = getR(m.id);
  r.watch = !r.watch;
  saveRatings(); checkAch();
  const card = cards.get(m.id);
  if (card) badges(card, m);
  updatePills();
  toast(r.watch ? '🔖 Добавлено в «Смотреть позже»' : 'Убрано из «Смотреть позже»');
}

async function action(m, act, btn) {
  if (act === 'fav') {
    const r = getR(m.id);
    r.favorite = !r.favorite;
    touch(r); updateHeart(m); if (cards.has(m.id)) badges(cards.get(m.id), m); updatePills();
    toast(r.favorite ? '♥ Добавлено в избранное' : 'Убрано из избранного');
  } else if (act === 'watch') {
    toggleWatch(m); updateHeart(m);
  } else if (act === 'coll') {
    const box = $('.coll-pick', detail), open = box.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open);
    if (open) { paintCollPick(m); box.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }); }
  } else if (act === 'share') {
    openShare(m);
  } else if (act === 'pmore') {
    btn.parentElement.classList.add('pm-open');
  } else if (act === 'web') {
    const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '⏳ Ищу…';
    const res = await fetchPoster(m);
    btn.disabled = false; btn.innerHTML = old;
    if (res.ok) posterChanged(m, 'Постер обновлён ✨');
    else toast(res.error ? '⚠ ' + res.error : 'Постер не найден — попробуйте «Из файла»');
  } else if (act === 'file') {
    const res = await pickPoster(m);
    if (res.ok) posterChanged(m, 'Постер обновлён ✨');
    else if (res.error) toast('⚠ ' + res.error);
  } else if (act === 'edit') {
    openEditor(m);
  } else if (act === 'del') {
    if (!confirm(`Удалить фильм «${m.title}» вместе с оценками?`)) return;
    closeDetail();
    S.movies = S.movies.filter(x => x !== m);
    delete S.ratings[m.id];
    if (collsOf(m).length) { S.colls.forEach(c => c.ids = c.ids.filter(id => id !== m.id)); collsChanged(); }
    cards.get(m.id)?.remove();
    cards.delete(m.id);
    deletePoster(m);
    saveCustom(); saveRatings(); buildGenres(); buildCountry(); buildYears(); render();
    toast('Фильм удалён');
  }
}

function posterChanged(m, msg) {
  pver[m.id] = Date.now();
  keep('kc_pv', pver);
  delete colors[m.id];
  replaceCard(m);
  if (S.cur === m) openDetail(m);
  if (msg) toast(msg);
}

/* ================= добавление / редактирование ================= */
const editor = $('#editor');

/* ---------- добавление по ссылке ---------- */
// ссылка на Кинопоиск, IMDb, Okko, Иви или Википедию (или просто название) → фильм в Wikidata → поля формы.
// Wikidata и Википедия отвечают со страницы напрямую (origin=*), поэтому работает и на телефоне, и в Windows-версии.
const WD = 'https://www.wikidata.org/w/api.php?format=json&origin=*&';
const getJSON = async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const wd = params => getJSON(WD + params);

function parseLink(s) {
  s = s.trim();
  let x;
  if ((x = s.match(/imdb\.com\/(?:[a-z]{2}\/)?title\/(tt\d+)/i) || s.match(/^(tt\d{5,})$/i))) return { prop: 'P345', id: x[1], keep: { imdbId: x[1] } };
  if ((x = s.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i))) return { prop: 'P2603', id: x[1], keep: { kp: x[1] } };
  if ((x = s.match(/okko\.tv\/(?:player\/)?(movie|serial)\/([\w-]+)/i))) return { prop: 'P14727', id: x[2], keep: { okko: x[1].toLowerCase() + '/' + x[2] } };
  if ((x = s.match(/ivi\.(?:ru|tv)\/watch\/([\w-]+)/i))) return { prop: 'P11682', id: x[1], keep: { ivi: x[1] } };
  if ((x = s.match(/\/\/(\w+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i))) return { site: x[1] + 'wiki', title: decodeURIComponent(x[2]).replace(/_/g, ' ') };
  if (/^https?:\/\//i.test(s)) return { unknown: true };
  return s ? { text: s } : null;
}

// номер элемента Wikidata (Q…) по разобранной ссылке
async function findQid(p) {
  if (p.prop) {
    const d = await wd('action=query&list=search&srlimit=1&srsearch=' + encodeURIComponent(`haswbstatement:"${p.prop}=${p.id}"`));
    return ((d.query || {}).search || [])[0]?.title || null;
  }
  if (p.site) {
    const d = await wd(`action=wbgetentities&props=info&sites=${p.site}&titles=` + encodeURIComponent(p.title));
    return Object.keys(d.entities || {}).find(k => k.startsWith('Q')) || null;
  }
  // по названию: поиск русской Википедии ранжирует названия лучше, чем Wikidata;
  // берём первую статью, у которой в Wikidata есть IMDb, — почти наверняка фильм или сериал
  const r = await getJSON('https://ru.wikipedia.org/w/api.php?format=json&origin=*&action=query&generator=search&gsrlimit=8&prop=pageprops&ppprop=wikibase_item&gsrsearch=' + encodeURIComponent(p.text));
  const ids = Object.values((r.query || {}).pages || {}).sort((a, b) => a.index - b.index).map(x => (x.pageprops || {}).wikibase_item).filter(Boolean);
  if (!ids.length) return null;
  const e = await wd('action=wbgetentities&props=claims&ids=' + ids.join('|'));
  return ids.find(id => e.entities[id]?.claims?.P345) || null;
}
const DISAMBIG = 'Q4167410';

const GENRE_MAP = [[/драм/, 'Драма'], [/комеди/, 'Комедия'], [/ужас/, 'Ужасы'], [/научн|фантаст/, 'Фантастика'], [/фэнтези/, 'Фэнтези'],
  [/боевик/, 'Боевик'], [/триллер/, 'Триллер'], [/криминал|гангстер/, 'Криминал'], [/мелодрам|романтич/, 'Мелодрама'], [/приключ/, 'Приключения'],
  [/военн/, 'Военный'], [/анимац|мультип|аниме/, 'Мультфильм'], [/историч/, 'Исторический'], [/биограф/, 'Биография'],
  [/музыкальн|мюзикл/, 'Мюзикл'], [/спорт/, 'Спорт'], [/вестерн/, 'Вестерн'], [/детектив/, 'Детектив']];
const COUNTRY_FIX = { 'РСФСР': 'СССР', 'Грузинская ССР': 'СССР', 'Республика Корея': 'Южная Корея', 'Китайская Республика (Тайвань)': 'Тайвань', 'Объединённые Арабские Эмираты': 'ОАЭ' };
const SERIES_Q = ['Q5398426', 'Q1259759', 'Q581714', 'Q526877', 'Q63952888', 'Q117467246'];

// сюжет из русской Википедии: первый абзац раздела «Сюжет», иначе начало статьи
async function wikiPlot(title) {
  try {
    const d = await getJSON('https://ru.wikipedia.org/w/api.php?format=json&origin=*&action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=' + encodeURIComponent(title));
    const text = Object.values(d.query.pages)[0].extract || '';
    const sec = text.match(/==\s*Сюжет\s*==\s*\n+([\s\S]*?)(?:\n\s*\n|\n==|$)/);
    const par = (sec ? sec[1] : text.split('\n')[0]).trim();
    // не больше двух предложений
    const sentences = par.match(/[^.!?…]+[.!?…]+/g) || [par];
    return sentences.slice(0, 2).join('').trim().slice(0, 400);
  } catch { return ''; }
}

async function filmFromLink(raw) {
  const p = parseLink(raw);
  if (!p) return null;
  if (p.unknown) throw new Error('Такие ссылки не поддерживаются — нужна ссылка на Кинопоиск, IMDb, Okko, Иви или Википедию');
  const qid = await findQid(p);
  if (!qid) return { keep: p.keep || {} };
  const e = (await wd(`action=wbgetentities&props=labels|claims|sitelinks&languages=ru|en&ids=${qid}`)).entities[qid];
  const cl = e.claims || {};
  const vals = k => (cl[k] || []).map(c => c.mainsnak.datavalue?.value).filter(v => v != null);
  const ids = k => vals(k).map(v => v.id).filter(Boolean);
  if (ids('P31').includes(DISAMBIG)) throw new Error('Это страница-список с несколькими фильмами — откройте в Википедии нужный и вставьте ссылку на него');
  // у мультфильмов вместо актёров — актёры озвучания (P725)
  const dirs = ids('P57'), cast = (ids('P161').length ? ids('P161') : ids('P725')).slice(0, 5), genres = ids('P136'), countries = ids('P495'), kinds = ids('P31');
  const need = [...new Set([...dirs, ...cast, ...genres, ...countries, ...kinds])];
  const labels = {};
  for (let i = 0; i < need.length; i += 50) {
    const d = await wd('action=wbgetentities&props=labels&languages=ru|en&ids=' + need.slice(i, i + 50).join('|'));
    Object.values(d.entities || {}).forEach(x => labels[x.id] = (x.labels.ru || x.labels.en || {}).value);
  }
  const L = list => list.map(id => labels[id]).filter(Boolean);
  const kindText = L(kinds).join(' ').toLowerCase();
  const series = kinds.some(k => SERIES_Q.includes(k)) || /сериал/.test(kindText);
  const g = new Set();
  L(genres).forEach(name => GENRE_MAP.forEach(([re, ours]) => { if (re.test(name.toLowerCase())) g.add(ours); }));
  if (/анимац|мультип|аниме/.test(kindText)) g.add('Мультфильм');
  const years = [...vals('P577'), ...vals('P580')].map(v => +String(v.time).slice(1, 5)).filter(Boolean);
  const ru = (e.labels.ru || {}).value, en = (e.labels.en || {}).value;
  const origT = vals('P1476').find(v => v.language !== 'ru');
  const sl = e.sitelinks || {};
  const imdb = vals('P345')[0], kp = vals('P2603')[0], okko = vals('P14727')[0], ivi = vals('P11682')[0];
  return {
    title: ru || en || '', orig: origT ? origT.text : (en || ''), year: years.length ? Math.min(...years) : 0,
    director: L(dirs).join(', '), actors: L(cast), genres: [...(series ? ['Сериал'] : []), ...g],
    country: [...new Set(L(countries).map(c => COUNTRY_FIX[c] || c))],
    desc: sl.ruwiki ? await wikiPlot(sl.ruwiki.title) : '',
    // ссылки на просмотр и данные для поиска постера; ссылка, которую вставили, важнее
    keep: { ...(imdb && { imdbId: imdb }), ...(kp && { kp }), ...(okko && { okko: 'movie/' + okko }), ...(ivi && { ivi }),
      ...(sl.enwiki && { wiki: sl.enwiki.title }), ...(p.keep || {}) },
  };
}

function openEditor(m) {
  const isNew = !m;
  const all = [...new Set(S.movies.flatMap(x => x.genres))].sort((a, b) => a.localeCompare(b, 'ru'));
  const v = m || { title: '', orig: '', year: new Date().getFullYear(), director: '', actors: [], genres: [], country: [], desc: '' };
  editor.innerHTML = `<div class="backdrop"></div>
    <div class="sheet form">
      <button class="x">✕</button>
      <h2>${isNew ? 'Новый фильм' : 'Изменить фильм'}</h2>
      <div class="field linkf"><span>Ссылка на фильм или его название — остальное заполнится само</span>
        <div class="link-row"><input name="link" placeholder="Кинопоиск, IMDb, Okko, Иви, Википедия…" autocomplete="off" spellcheck="false">
          <button class="btn accent sm" data-act="find">Найти</button></div>
        <div class="link-st"></div></div>
      <label class="field"><span>Название *</span><input name="title" value="${esc(v.title)}"></label>
      <div class="grid2">
        <label class="field"><span>Оригинальное название (помогает найти постер)</span><input name="orig" value="${esc(v.orig)}"></label>
        <label class="field"><span>Год</span><input name="year" type="number" min="1890" max="2100" value="${v.year || ''}"></label>
      </div>
      <label class="field"><span>Режиссёр</span><input name="director" value="${esc(v.director)}"></label>
      <label class="field"><span>Страна — через запятую</span><input name="country" value="${esc((v.country || []).join(', '))}" placeholder="Россия"></label>
      <label class="field"><span>Актёры — через запятую</span><input name="actors" value="${esc(v.actors.join(', '))}"></label>
      <div class="field"><span>Жанры</span><div class="gpick">${all.map(g => `<button class="chip ${v.genres.includes(g) ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div></div>
      <label class="field"><span>Свой жанр — через запятую</span><input name="extra"></label>
      <label class="field"><span>Описание</span><textarea name="desc">${esc(v.desc)}</textarea></label>
      ${isNew ? '<label class="switch"><input type="checkbox" name="web" checked><span class="tr"></span>Найти постер в Википедии автоматически</label>' : ''}
      <div class="foot"><button class="btn" data-act="cancel">Отмена</button><button class="btn grad" data-act="save">${isNew ? 'Добавить' : 'Сохранить'}</button></div>
    </div>`;
  $$('.gpick .chip', editor).forEach(c => c.onclick = () => c.classList.toggle('on'));
  const close = () => editor.classList.remove('open');

  // найденные по ссылке данные, которых нет в полях формы: IMDb, ссылки на кинотеатры, статья для постера
  let keep = {};
  const st = $('.link-st', editor), findBtn = $('[data-act="find"]', editor), linkIn = $('[name="link"]', editor);
  const status = (html, cls = '') => { st.className = 'link-st ' + cls; st.innerHTML = html; };
  const find = async () => {
    const raw = linkIn.value.trim();
    if (!raw) { linkIn.focus(); return; }
    findBtn.disabled = true; findBtn.textContent = 'Ищу…'; status('');
    try {
      const r = await filmFromLink(raw);
      if (!r) return;
      keep = r.keep || {};
      if (!r.title) {
        status(Object.keys(keep).length ? 'Данных о фильме не нашлось — заполните поля сами, ссылку для просмотра сохраню' : 'Ничего не нашлось — проверьте ссылку или заполните поля сами', 'warn');
        return;
      }
      // такой фильм уже есть — предлагаем открыть его, а не создавать копию
      const dup = S.movies.find(x => x !== m && ((keep.imdbId && x.imdbId === keep.imdbId) || (keep.kp && x.kp === keep.kp) ||
        (norm(x.title) === norm(r.title) && x.year === r.year)));
      const f = n => $(`[name="${n}"]`, editor);
      f('title').value = r.title; f('orig').value = r.orig; f('year').value = r.year || '';
      f('director').value = r.director; f('country').value = r.country.join(', '); f('actors').value = r.actors.join(', ');
      if (r.desc) f('desc').value = r.desc;
      const chips = $$('.gpick .chip', editor);
      chips.forEach(c => c.classList.toggle('on', r.genres.includes(c.dataset.g)));
      f('extra').value = r.genres.filter(g => !chips.some(c => c.dataset.g === g)).join(', ');
      if (dup) {
        status(`«${esc(dup.title)}» уже есть в каталоге. <button class="btn sm" data-act="dup">Открыть</button>`, 'warn');
        $('[data-act="dup"]', st).onclick = () => { close(); openDetail(dup); };
      } else status(`✓ Нашёл: <b>${esc(r.title)}</b>${r.year ? ' · ' + r.year : ''} — проверьте поля и нажмите «${isNew ? 'Добавить' : 'Сохранить'}»`, 'ok');
    } catch (e) {
      status(/HTTP 429/.test(e.message) ? 'Википедия просит немного подождать — попробуйте через минуту'
        : /fetch|HTTP|network/i.test(e.message) ? 'Не удалось связаться с Википедией — проверьте интернет или попробуйте через минуту' : esc(e.message), 'warn');
    } finally { findBtn.disabled = false; findBtn.textContent = 'Найти'; }
  };
  findBtn.onclick = find;
  linkIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
  // вставили ссылку — сразу ищем
  linkIn.addEventListener('paste', () => setTimeout(() => { if (/^https?:\/\//i.test(linkIn.value.trim())) find(); }, 0));
  $('.x', editor).onclick = close;
  $('.backdrop', editor).onclick = close;
  $('[data-act="cancel"]', editor).onclick = close;
  $('[data-act="save"]', editor).onclick = () => {
    const f = n => $(`[name="${n}"]`, editor);
    const title = f('title').value.trim();
    if (!title) { f('title').focus(); toast('Введите название фильма'); return; }
    const list = s => s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
    const genres = $$('.gpick .chip.on', editor).map(c => c.dataset.g);
    list(f('extra').value).forEach(g => { g = g[0].toUpperCase() + g.slice(1); if (!genres.includes(g)) genres.push(g); });
    const target = m || { id: 'my_' + Date.now(), custom: true };
    Object.assign(target, {
      title, orig: f('orig').value.trim(), year: +f('year').value || 0, director: f('director').value.trim(),
      actors: list(f('actors').value), genres, country: list(f('country').value), desc: f('desc').value.trim(),
    }, keep);
    const web = isNew && f('web').checked;
    if (isNew) S.movies.push(target); else replaceCard(target);
    saveCustom(); buildGenres(); buildCountry(); buildYears(); render(); close();
    openDetail(target);
    toast(isNew ? 'Фильм добавлен 🎉' : 'Сохранено');
    if (web) {
      toast('Ищу постер…');
      fetchPoster(target)
        .then(res => res.ok ? posterChanged(target, 'Постер найден ✨') : toast('Постер не найден — можно выбрать файл'));
    }
  };
  editor.classList.add('open');
  setTimeout(() => $(isNew ? '[name="link"]' : '[name="title"]', editor).focus(), 100);
}

/* ================= статистика ================= */
function renderStats() {
  const st = $('#stats');
  const rated = S.movies.map(m => ({ m, r: R(m.id), s: ov(m) })).filter(x => x.s >= 0);
  const favs = S.movies.filter(m => R(m.id) && R(m.id).favorite).length;
  const avg = rated.length ? rated.reduce((a, x) => a + x.s, 0) / rated.length : -1;
  const tile = (v, l, i) => `<div class="panel tile" style="animation-delay:${i * 60}ms"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  let html = tile(S.movies.length, 'фильмов в базе', 0) + tile(rated.length, 'оценено', 1) +
    tile(avg >= 0 ? avg.toFixed(1) : '—', 'средняя оценка', 2) + tile(favs, 'в избранном', 3);

  if (!rated.length) {
    html += `<div class="panel span4"><div class="nodata">Пока нет ни одной оценки. Откройте любой фильм и проставьте баллы по критериям — здесь появятся графики и ваш личный топ.</div></div>`;
    st.innerHTML = html + monthsPanel(260, 'span4') + achPanel(300) + accentPanel() + backupPanel();
    wireBackup(st);
    countUp(st);
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.fil', st).forEach(f => f.style[f.closest('.mo-bar') ? 'height' : 'width'] = f.dataset.w + '%')));
    return;
  }
  const bar = (name, val, max, t, label) => `<div class="hbar" style="--c1:${t.c1};--c2:${t.c2}"><span class="nm">${esc(name)}</span><div class="trk"><div class="fil" data-w="${Math.max(2, val / max * 100)}"></div></div><b>${label}</b></div>`;

  // кольцевая диаграмма по категориям
  const counts = TIERS.map((t, i) => rated.filter(x => tierIdx(x.s) === i).length);
  let acc = 0;
  const stops = TIERS.map((t, i) => { const a = acc; acc += counts[i] / rated.length * 100; return `${t.c1} ${a}% ${acc}%`; }).join(',');
  html += `<div class="panel span2" style="animation-delay:240ms"><h3>Распределение по категориям</h3><div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(${stops})"><b>${rated.length}</b></div>
      <div class="legend">${TIERS.map((t, i) => `<div style="--c1:${t.c1};--c2:${t.c2}"><i></i>${t.name}<span>${counts[i]}</span></div>`).join('')}</div>
    </div></div>`;

  html += `<div class="panel span2" style="animation-delay:300ms"><h3>Средние баллы по критериям</h3>${CRIT.map(c => {
    const vals = rated.map(x => (x.r.scores || {})[c]).filter(v => v > 0);
    const a = vals.length ? vals.reduce((p, q) => p + q, 0) / vals.length : 0;
    return bar(c, a, 10, a ? TIERS[tierIdx(a)] : { c1: '#555', c2: '#333' }, a ? a.toFixed(1) : '—');
  }).join('')}</div>`;

  const byGenre = {};
  rated.forEach(x => x.m.genres.forEach(g => (byGenre[g] = byGenre[g] || []).push(x.s)));
  const gl = Object.entries(byGenre).map(([g, v]) => ({ g, a: v.reduce((p, q) => p + q, 0) / v.length, n: v.length }))
    .sort((a, b) => b.a - a.a || b.n - a.n).slice(0, 12);
  html += `<div class="panel span2" style="animation-delay:360ms"><h3>Любимые жанры</h3>${gl.map(x => bar(`${x.g} (${x.n})`, x.a, 10, TIERS[tierIdx(x.a)], x.a.toFixed(1))).join('')}</div>`;

  const top = rated.sort((a, b) => b.s - a.s || a.m.title.localeCompare(b.m.title, 'ru')).slice(0, 10);
  html += `<div class="panel span2" style="animation-delay:420ms"><h3>Ваш топ-10</h3><div class="top10">${top.map((x, i) => {
    const t = TIERS[tierIdx(x.s)];
    return `<div class="trow" data-id="${esc(x.m.id)}" style="--t1:${t.c1};animation-delay:${450 + i * 40}ms">
      <div class="rk">${i + 1}</div><div class="th">${posterHTML(x.m, false)}</div>
      <div class="tt">${esc(x.m.title)}<small>${[x.m.year, x.m.director].filter(Boolean).map(esc).join(' · ')}</small></div>
      <div class="tn">${t.name}</div><div class="ts">${fmt(x.s)}</div></div>`;
  }).join('')}</div></div>`;

  // страны: сколько оценено и средняя оценка; клик — каталог этой страны
  const byCountry = {};
  rated.forEach(x => (x.m.country || []).forEach(c => (byCountry[c] = byCountry[c] || []).push(x.s)));
  const cl = Object.entries(byCountry).map(([c, v]) => ({ c, a: v.reduce((p, q) => p + q, 0) / v.length, n: v.length }))
    .sort((a, b) => b.n - a.n || b.a - a.a).slice(0, 10);
  html += `<div class="panel span2" style="animation-delay:440ms"><h3>Страны <small>по числу оценок</small></h3>${cl.length
    ? cl.map(x => `<div class="crow" data-country="${esc(x.c)}" title="Показать фильмы: ${esc(x.c)}">${bar(`${x.c} (${x.n})`, x.a, 10, TIERS[tierIdx(x.a)], x.a.toFixed(1))}</div>`).join('')
    : '<div class="nodata">У оценённых фильмов не указана страна</div>'}</div>`;
  html += monthsPanel(460, 'span2');

  st.innerHTML = html + achPanel(500) + accentPanel() + backupPanel();
  wireBackup(st);
  countUp(st);
  $$('.trow', st).forEach(rw => rw.onclick = () => { S.list = top.map(x => x.m); openDetail(S.movies.find(m => m.id === rw.dataset.id), $('.th', rw)); });
  $$('.crow', st).forEach(rw => rw.onclick = () => {
    Object.assign(S, { country: rw.dataset.country, person: null });
    syncCountry();
    $('#tabs button[data-view="all"]').click();
  });
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.fil', st).forEach(f => f.style[f.closest('.mo-bar') ? 'height' : 'width'] = f.dataset.w + '%')));
}

// просмотры за последние 12 месяцев — по отметкам «Посмотрел» в окне фильма
function monthsPanel(delay, span) {
  const all = S.movies.flatMap(m => (R(m.id) || {}).views || []);
  const now = new Date(), months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, d, n: all.filter(v => v.startsWith(key)).length });
  }
  const max = Math.max(1, ...months.map(x => x.n)), year = months.reduce((s, x) => s + x.n, 0);
  const rewatch = S.movies.reduce((s, m) => s + Math.max(0, ((R(m.id) || {}).views || []).length - 1), 0);
  const head = `<h3>Просмотры по месяцам <small>${year ? `за год ${year}${rewatch ? ` · пересмотров ${rewatch}` : ''}` : ''}</small></h3>`;
  if (!all.length) return `<div class="panel ${span}" style="animation-delay:${delay}ms">${head}<div class="nodata">Отмечайте просмотры кнопкой «+ Сегодня» в окне фильма — здесь появится график по месяцам.</div></div>`;
  return `<div class="panel ${span}" style="animation-delay:${delay}ms">${head}<div class="months">${months.map(x =>
    `<div class="mo" title="${x.d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}: ${x.n}">
      <span class="mo-n">${x.n || ''}</span><div class="mo-bar"><i class="fil" data-w="${x.n / max * 100}"></i></div>
      <small>${x.d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</small></div>`).join('')}</div></div>`;
}

/* ================= достижения ================= */
function achCtx() {
  const rated = S.movies.filter(m => ov(m) >= 0);
  const rs = S.movies.map(m => R(m.id)).filter(Boolean);
  const by = f => rated.filter(f).length;
  const allOf = re => { const list = S.movies.filter(m => re.test(m.director || '')); return [list.filter(m => ov(m) >= 0).length, list.length]; };
  // больше всего оценок за один день: считается день первой оценки, а не последней правки
  // (у старых записей без ratedAt — день последнего изменения)
  const days = {};
  rs.forEach(r => {
    const at = overall(r) >= 0 && (r.ratedAt || r.updated);
    if (at) { const d = new Date(at).toDateString(); days[d] = (days[d] || 0) + 1; }
  });
  const bestDay = Math.max(0, ...Object.values(days));
  return { rated, rs, by, allOf, bestDay };
}
// v(c) — сколько набрано; lv — пороги уровней (1, 2, 3) или функция от c
// в описании {n} — цель уровня, {n:фильм,фильма,фильмов} — цель со словом в нужном падеже
const ACH = [
  { id: 'first', icon: '🎬', name: 'Первые шаги', desc: 'Оцените {n:фильм,фильма,фильмов}', lv: [1, 50, 100], v: c => c.rated.length },
  { id: 'critic', icon: '🏆', name: 'Кинокритик', desc: 'Оцените {n} фильмов', lv: [150, 300, 500], v: c => c.rated.length },
  { id: 'perfect', icon: '🎯', name: 'Перфекционист', desc: '{n:фильм,фильма,фильмов} по всем 7 критериям', lv: [1, 10, 50], v: c => c.rs.filter(r => CRIT.every(k => (r.scores || {})[k] > 0)).length },
  { id: 'generous', icon: '💎', name: 'Щедрая душа', desc: '{n} фильмов на «Отлично»', lv: [5, 20, 50], v: c => c.by(m => ov(m) >= 9) },
  { id: 'harsh', icon: '🗑️', name: 'Строгий критик', desc: '{n:фильм,фильма,фильмов} с оценкой «Провал»', lv: [1, 5, 15], v: c => c.by(m => ov(m) < 3) },
  { id: 'genres', icon: '🧭', name: 'Всеядный зритель', desc: 'Фильмы {n} разных жанров', lv: [6, 12, 18], v: c => new Set(c.rated.flatMap(m => m.genres)).size },
  { id: 'decades', icon: '⏳', name: 'Машина времени', desc: 'Фильмы из {n} разных десятилетий', lv: [4, 7, 10], v: c => new Set(c.rated.filter(m => m.year).map(m => Math.floor(m.year / 10))).size },
  { id: 'classic', icon: '📽️', name: 'Золотая классика', desc: '{n} фильмов, снятых до 1980 года', lv: [5, 15, 40], v: c => c.by(m => m.year && m.year < 1980) },
  { id: 'soviet', icon: '☭', name: 'Знаток советского кино', desc: 'Оцените {n} советских фильмов', lv: [5, 15, 30], v: c => c.by(isSoviet) },
  { id: 'russian', icon: '🪆', name: 'Наше кино', desc: 'Оцените {n} российских фильмов', lv: [5, 15, 30], v: c => c.by(isRussian) },
  // третий уровень — все фильмы режиссёра из каталога
  { id: 'nolan', icon: '🌀', name: 'Нолановед', desc: 'Оцените {n:фильм,фильма,фильмов} Кристофера Нолана', lv: c => [3, 6, c.allOf(/Кристофер Нолан/)[1]], v: c => c.allOf(/Кристофер Нолан/)[0] },
  { id: 'tarantino', icon: '🩸', name: 'Тарантиномания', desc: 'Оцените {n:фильм,фильма,фильмов} Квентина Тарантино', lv: c => [3, 6, c.allOf(/Тарантино/)[1]], v: c => c.allOf(/Тарантино/)[0] },
  { id: 'anim', icon: '🧸', name: 'Мультипликатор', desc: 'Оцените {n} мультфильмов', lv: [5, 15, 40], v: c => c.by(m => m.genres.includes('Мультфильм')) },
  { id: 'horror', icon: '👻', name: 'Не боюсь темноты', desc: 'Оцените {n} фильмов ужасов', lv: [5, 15, 40], v: c => c.by(m => m.genres.includes('Ужасы')) },
  { id: 'war', icon: '🎖️', name: 'Ветеран', desc: 'Оцените {n} военных фильмов', lv: [5, 15, 35], v: c => c.by(m => m.genres.includes('Военный')) },
  { id: 'series', icon: '📺', name: 'Сериаломан', desc: 'Оцените {n:сериал,сериала,сериалов}', lv: [3, 10, 30], v: c => c.by(m => m.genres.includes('Сериал')) },
  { id: 'fresh', icon: '✨', name: 'В тренде', desc: '{n} фильмов 2023 года и новее', lv: [5, 15, 40], v: c => c.by(m => m.year >= 2023) },
  { id: 'imdbtop', icon: '🥇', name: 'Золотой фонд', desc: '{n} фильмов с рейтингом IMDb 8+', lv: [10, 50, 150], v: c => c.by(m => m.imdb >= 8) },
  { id: 'contrarian', icon: '🙃', name: 'Своё мнение', desc: 'Разойтись с IMDb на 3+ балла: {n:раз,раза,раз}', lv: [1, 5, 15], v: c => c.by(m => m.imdb && Math.abs(ov(m) - m.imdb) >= 3) },
  { id: 'marathon', icon: '🏃', name: 'Марафонец', desc: 'Оцените {n:фильм,фильма,фильмов} за один день', lv: [3, 6, 10], v: c => c.bestDay },
  { id: 'favs', icon: '❤️', name: 'Коллекционер', desc: '{n} фильмов в избранном', lv: [5, 20, 50], v: c => c.rs.filter(r => r.favorite).length },
  { id: 'planner', icon: '🔖', name: 'Планировщик', desc: '{n} фильмов в «Смотреть позже»', lv: [5, 20, 50], v: c => c.rs.filter(r => r.watch).length },
  { id: 'curator', icon: '🗂️', name: 'Куратор', desc: '{n:коллекция,коллекции,коллекций} хотя бы с 3 фильмами', lv: [1, 3, 6], v: () => S.colls.filter(c => c.ids.length >= 3).length },
  { id: 'notes', icon: '✍️', name: 'Летописец', desc: 'Заметки к {n} фильмам', lv: [5, 20, 50], v: c => c.rs.filter(r => (r.comment || '').trim()).length },
];
const LV_NAME = ['', 'Бронза', 'Серебро', 'Золото'];
const plural = (n, one, few, many) => { const a = n % 100, b = n % 10; return a >= 11 && a <= 14 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };
const achText = (desc, n) => desc.replace(/\{n(?::([^}]+))?\}/, (_, w) => w ? `${n} ${plural(n, ...w.split(','))}` : n);
// состояние достижения: достигнутый уровень и цель следующего
function achState(a, c) {
  const v = a.v(c), lv = typeof a.lv === 'function' ? a.lv(c) : a.lv;
  const level = lv.filter(g => g > 0 && v >= g).length, max = lv.length;
  const goal = lv[Math.min(level, max - 1)];
  // уровень цвета: у одноуровневых сразу «золото»
  const metal = level === 0 ? 0 : level === max ? 3 : level;
  return { a, v: Math.min(v, goal), lv, level, max, goal, metal, done: max > 0 && lv[0] > 0 && level === max,
    desc: achText(a.desc, goal) };
}
let achSeen = load('kc_ach', null);
// открытые уровни в виде ключей «id:уровень»
const achDone = () => { const c = achCtx(); return ACH.flatMap(a => { const s = achState(a, c); return Array.from({ length: s.level }, (_, k) => `${a.id}:${k + 1}`); }); };
// старый формат (без уровней) молча переводится на новый, чтобы не засыпать уведомлениями
if (achSeen && achSeen.some(k => !k.includes(':'))) achSeen = null;

// новые уровни — уведомлением; уже открытые запоминаются, чтобы не повторяться
const checkAch = debounce(() => {
  const done = achDone();
  if (!achSeen) { achSeen = done; keep('kc_ach', achSeen); return; }
  const fresh = done.filter(k => !achSeen.includes(k));
  if (!fresh.length) return;
  achSeen = [...new Set([...achSeen, ...done])];
  keep('kc_ach', achSeen);
  // если за раз открылось несколько уровней одного достижения, показываем только старший
  const c = achCtx();
  const ids = [...new Set(fresh.map(k => k.split(':')[0]))];
  ids.forEach((id, i) => setTimeout(() => achToast(achState(ACH.find(x => x.id === id), c)), i * 900));
}, 700);

// уровень: подпись и три деления
const lvPips = s => s.max > 1 ? `<span class="lv-pips">${[1, 2, 3].map(k => `<i class="${k <= s.level ? 'on' : ''}"></i>`).join('')}</span>` : '';

// карточка нового достижения: выезжает сверху, закрывается сама, по нажатию или смахиванием вверх
const ACH_SHOW = 5200;
function achToast(s) {
  const a = s.a, el = document.createElement('div');
  el.className = 'achpop';
  el.dataset.m = s.metal;
  el.style.setProperty('--life', ACH_SHOW + 'ms');
  const desc = s.max > 1 ? achText(a.desc, s.lv[s.level - 1]) : a.desc;
  el.innerHTML = `<div class="ap-ico"><span>${a.icon}</span></div>
    <div class="ap-t"><small>${s.max > 1 && s.level > 1 ? 'Новый уровень' : 'Достижение открыто'}</small><b>${esc(a.name)}</b><span>${esc(desc)}</span></div>
    ${s.max > 1 ? `<div class="ap-n"><em>${LV_NAME[s.metal]}</em>${lvPips(s)}</div>` : ''}<i class="ap-bar"></i>`;
  $('#achPops').appendChild(el);
  const close = () => {
    if (el.classList.contains('out')) return;
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  };
  const timer = setTimeout(close, ACH_SHOW);
  el.onclick = close;
  let y0 = null;
  el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; el.style.transition = 'none'; }, { passive: true });
  el.addEventListener('touchmove', e => {
    const dy = Math.min(0, e.touches[0].clientY - y0);
    el.style.transform = `translateY(${dy}px)`; el.style.opacity = 1 + dy / 120;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - y0;
    el.style.transition = ''; el.style.transform = ''; el.style.opacity = '';
    if (dy < -35) close();
  });
}

function achPanel(delay) {
  const c = achCtx();
  const items = ACH.map(a => achState(a, c));
  const got = items.reduce((s, x) => s + x.level, 0), all = items.reduce((s, x) => s + x.max, 0);
  return `<div class="panel span4" style="animation-delay:${delay}ms"><h3>Достижения <small>уровней ${got} из ${all}</small></h3>
    <div class="ach-grid">${items.map((x, i) => `
      <div class="ach ${x.level ? 'got' : ''} ${x.done ? 'done' : ''}" data-m="${x.metal}" style="animation-delay:${delay + 60 + i * 25}ms">
        <div class="ach-ico">${x.a.icon}</div>
        <div class="ach-t"><b>${x.a.name}${x.level && x.max > 1 ? `<em class="lv-tag">${LV_NAME[x.metal]}</em>` : ''}</b><span>${x.done && x.max > 1 ? achText(x.a.desc, x.goal) + ' — все уровни' : x.desc}</span>
          <div class="ach-bar"><i class="fil" data-w="${x.goal ? x.v / x.goal * 100 : 0}"></i></div></div>
        <div class="ach-n">${x.done ? '✓' : `${x.v}/${x.goal}`}${lvPips(x)}</div>
      </div>`).join('')}</div></div>`;
}

/* ================= резервная копия ================= */
const offlineReady = () => !host && 'caches' in window && navigator.serviceWorker && navigator.serviceWorker.controller;
function backupPanel() {
  return `<div class="panel span4 backup"><h3>Резервная копия</h3>
    <p class="nodata">Оценки, заметки, списки и коллекции хранятся только на этом устройстве. Сохраните их в файл, чтобы не потерять или перенести на другой телефон или компьютер. Загрузить можно и файл <b>ratings.json</b> из папки Kinora на компьютере.</p>
    <div class="bk-acts"><button class="btn accent" data-bk="export">Сохранить в файл</button><button class="btn" data-bk="import">Загрузить из файла</button>
    ${offlineReady() ? '<button class="btn" data-bk="offline">Скачать постеры для работы без интернета</button>' : ''}</div></div>`;
}
function wireBackup(root) {
  $$('[data-acc]', root).forEach(b => b.onclick = () => {
    keep('kc_accent', b.dataset.acc); applyAccent(b.dataset.acc);
    $$('[data-acc]', root).forEach(x => x.classList.toggle('on', x === b));
  });
  $('[data-bk="export"]', root).onclick = exportBackup;
  $('[data-bk="import"]', root).onclick = importBackup;
  const off = $('[data-bk="offline"]', root);
  if (off) off.onclick = () => cacheAllPosters(off);
}

function exportBackup() {
  const data = {
    app: 'kinora', version: 1, saved: new Date().toISOString(), ratings: S.ratings,
    custom: S.movies.filter(m => m.custom).map(({ custom, _hay, ...m }) => m),
    collections: S.colls,
  };
  const name = `kinora-оценки-${new Date().toISOString().slice(0, 10)}.json`;
  if (droid) {
    const err = droid.saveFile(name, 'application/json', JSON.stringify(data, null, 1));
    toast(err ? '⚠ ' + err : '💾 Файл с оценками сохранён в «Загрузки/Kinora»');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('💾 Файл с оценками сохранён в «Загрузки»');
}

// принимает и свою резервную копию, и ratings.json из Windows-версии
async function importBackup() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let d;
  try { d = JSON.parse(await f.text()); } catch { d = null; }
  const full = d && d.app === 'kinora';
  const ratings = full ? d.ratings : d;
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) { toast('⚠ Это не файл с оценками Kinora'); return; }
  const entries = Object.entries(ratings).filter(([, r]) => r && typeof r === 'object');
  if (!confirm(`Загрузить записей: ${entries.length}?\nОценки к тем же фильмам на этом устройстве заменятся, остальные останутся.`)) return;
  const ids = new Set(S.movies.map(m => m.id));
  (full && Array.isArray(d.custom) ? d.custom : []).forEach(m => {
    if (m && m.id && !ids.has(m.id)) S.movies.push({ ...m, title: m.title || m.id, genres: m.genres || [], actors: m.actors || [], custom: true });
  });
  entries.forEach(([k, r]) => S.ratings[k] = { scores: {}, manual: 0, comment: '', favorite: false, ...r });
  // коллекции из копии: с тем же id заменяются, новые добавляются
  (full && Array.isArray(d.collections) ? d.collections : []).forEach(c => {
    if (!c || !c.id || !Array.isArray(c.ids)) return;
    const v = { id: String(c.id), name: String(c.name || 'Коллекция'), desc: String(c.desc || ''), ids: c.ids.filter(x => typeof x === 'string'), created: c.created };
    const i = S.colls.findIndex(x => x.id === v.id);
    if (i >= 0) S.colls[i] = v; else S.colls.push(v);
  });
  saveRatings(); saveCustom(); saveColls();
  achSeen = achDone(); keep('kc_ach', achSeen);
  S.movies.forEach(m => { const c = cards.get(m.id); if (c) badges(c, m); });
  buildGenres(); buildCountry(); buildYears(); render();
  toast(`✅ Загружено записей: ${entries.length}`);
}

// постеры кэшируются по мере просмотра; эта кнопка скачивает сразу все
async function cacheAllPosters(btn) {
  btn.disabled = true;
  const c = await caches.open('kinora-posters-v1');
  const list = S.movies.map(purl).filter(u => !u.startsWith('data:'));
  let done = 0;
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(list.slice(i, i + 8).map(async u => {
      try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } catch { }
      done++;
    }));
    btn.textContent = `Скачиваю постеры… ${done} из ${list.length}`;
  }
  btn.textContent = 'Постеры сохранены ✓';
  toast('✅ Каталог теперь открывается и без интернета');
}

/* ================= рулетка «Что посмотреть?» ================= */
const roul = $('#roulette');
const ROUL_SRC = [['unrated', 'Неоценённые'], ['watch', 'Смотреть позже'], ['all', 'Все фильмы']];
const R_ITEM = 150, R_STEP = 164, R_WIN = 42;
let roulSrc = 'unrated', roulItems = [], spinning = false;

function roulPool() {
  return S.movies.filter(m => {
    const r = R(m.id);
    if (roulSrc === 'unrated' && ov(m) >= 0) return false;
    if (roulSrc === 'watch' && !(r && r.watch)) return false;
    if (roulSrc === 'coll' && !(curColl() || { ids: [] }).ids.includes(m.id)) return false;
    if (S.genre && !m.genres.includes(S.genre)) return false;
    if (S.country && !madeIn(m, S.country)) return false;
    return inYears(m) && imdbOk(m);
  });
}

function stripHTML(list) {
  return list.map(m => `<div class="r-item"><div class="poster" style="--h:${hue(m.title)}"><img src="${purl(m)}" alt=""><div class="ph">${esc(m.title)}</div></div></div>`).join('');
}

function openRoulette() {
  const cond = [S.genre, S.country, !yearsAll() && `${S.y1}–${S.y2}`, S.imdbMin && `IMDb ${S.imdbMin}+`].filter(Boolean);
  // внутри открытой коллекции можно крутить только её фильмы
  const inColl = S.view === 'coll' && curColl();
  const srcs = inColl ? [['coll', 'Коллекция'], ...ROUL_SRC] : ROUL_SRC;
  if (inColl) roulSrc = 'coll'; else if (roulSrc === 'coll') roulSrc = 'unrated';
  roul.innerHTML = `<div class="backdrop"></div>
    <div class="sheet roul">
      <button class="x" title="Закрыть (Esc)">✕</button>
      <h2>Что посмотреть?</h2>
      <div class="r-sub">Крутите ленту — Kinora выберет фильм за вас${cond.length ? `<br>Учитываются фильтры: <b>${esc(cond.join(' · '))}</b>` : ''}</div>
      <div class="seg">${srcs.map(([k, n]) => `<button data-k="${k}" class="${k === roulSrc ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="r-window"><div class="r-strip"></div><div class="r-mark"></div></div>
      <div class="r-result"></div>
      <div class="r-foot"><button class="btn accent r-spin">🎲 Крутить</button></div>
    </div>`;
  $('.x', roul).onclick = $('.backdrop', roul).onclick = closeRoulette;
  $$('.seg button', roul).forEach(b => b.onclick = () => {
    if (spinning) return;
    roulSrc = b.dataset.k;
    $$('.seg button', roul).forEach(x => x.classList.toggle('on', x === b));
    previewStrip();
  });
  $('.r-spin', roul).onclick = spin;
  roul.classList.add('open');
  previewStrip();
}

function closeRoulette() { if (!spinning) roul.classList.remove('open'); }

function placeStrip(index, extra = 0) {
  return $('.r-window', roul).clientWidth / 2 - (index * R_STEP + R_ITEM / 2) + extra;
}

function previewStrip() {
  const pool = roulPool(), strip = $('.r-strip', roul), res = $('.r-result', roul);
  strip.getAnimations().forEach(a => a.cancel());
  res.innerHTML = '';
  $('.r-spin', roul).disabled = !pool.length;
  $('.r-spin', roul).innerHTML = '🎲 Крутить';
  if (!pool.length) {
    roulItems = [];
    strip.innerHTML = '';
    res.innerHTML = '<div class="r-empty">Под эти условия нет ни одного фильма — смените источник или фильтры</div>';
    return;
  }
  roulItems = Array.from({ length: 9 }, () => pool[Math.random() * pool.length | 0]);
  strip.innerHTML = stripHTML(roulItems);
  strip.style.transform = `translateX(${placeStrip(4)}px)`;
}

function spin() {
  const pool = roulPool();
  if (spinning || !pool.length) return;
  spinning = true;
  const strip = $('.r-strip', roul), mark = $('.r-mark', roul), res = $('.r-result', roul), btn = $('.r-spin', roul);
  const winner = pool[Math.random() * pool.length | 0];
  // первые карточки оставляем как были, чтобы старт выглядел непрерывно
  const items = [...roulItems.slice(0, 9)];
  while (items.length < R_WIN + 5) items.push(items.length === R_WIN ? winner : pool[Math.random() * pool.length | 0]);
  strip.getAnimations().forEach(a => a.cancel());
  strip.innerHTML = stripHTML(items);
  roulItems = items;
  res.innerHTML = '';
  btn.disabled = true;
  $$('.seg button', roul).forEach(b => b.disabled = true);

  const x0 = placeStrip(4), jitter = (Math.random() - .5) * R_ITEM * .7, x1 = placeStrip(R_WIN, jitter);
  const run = strip.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }],
    { duration: calm ? 300 : 5600, easing: 'cubic-bezier(.12, .7, .1, 1)', fill: 'forwards' });

  // «щелчок» указателя, когда мимо него проезжает очередной постер
  let last = -1;
  const w = $('.r-window', roul).clientWidth;
  (function tick() {
    if (!spinning) return;
    const x = new DOMMatrix(getComputedStyle(strip).transform).m41;
    const i = Math.round((w / 2 - x - R_ITEM / 2) / R_STEP);
    if (i !== last) { last = i; mark.classList.remove('tick'); void mark.offsetWidth; mark.classList.add('tick'); }
    requestAnimationFrame(tick);
  })();

  run.finished.then(() => {
    const settle = strip.animate([{ transform: `translateX(${x1}px)` }, { transform: `translateX(${placeStrip(R_WIN)}px)` }],
      { duration: 450, easing: EASE, fill: 'forwards' });
    return settle.finished;
  }).then(() => {
    spinning = false;
    const win = strip.children[R_WIN];
    win.classList.add('win');
    btn.disabled = false;
    btn.innerHTML = '🎲 Ещё раз';
    $$('.seg button', roul).forEach(b => b.disabled = false);
    const wr = R(winner.id), watching = !!(wr && wr.watch);
    res.innerHTML = `<div class="r-title">${esc(winner.title)}</div>
      <div class="r-meta">${winner.year || ''}${winner.genres.slice(0, 3).map(g => ' · ' + esc(g)).join('')}${winner.director ? ' · реж. ' + esc(winner.director) : ''}</div>
      ${winner.desc ? `<p>${esc(winner.desc)}</p>` : ''}
      <div class="r-acts"><button class="btn accent" data-r="open">Открыть фильм</button>
        <button class="btn" data-r="watch">${watching ? '✓ В «Смотреть позже»' : '🔖 Смотреть позже'}</button></div>`;
    $('[data-r="open"]', res).onclick = () => { const p = $('.poster', win); roul.classList.remove('open'); openDetail(winner, p); };
    $('[data-r="watch"]', res).onclick = e => {
      toggleWatch(winner);
      const on = !!(R(winner.id) && R(winner.id).watch);
      e.currentTarget.innerHTML = on ? '✓ В «Смотреть позже»' : '🔖 Смотреть позже';
    };
  });
}

/* ================= карточка-картинка ================= */
const shareM = $('#share');
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function cover(x, img, l, t, w, h) {
  const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k;
  x.drawImage(img, l + (w - iw) / 2, t + (h - ih) / 2, iw, ih);
}
function wrapText(x, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (x.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (l && x.measureText(l + '…').width > maxW) l = l.slice(0, -1);
    lines[maxLines - 1] = l.trimEnd() + '…';
  }
  return lines;
}

async function drawCard(m) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const F = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
  const img = await loadImg(purl(m));
  const r = R(m.id), s = ov(m), t = s >= 0 ? TIERS[tierIdx(s)] : null;
  const grad = (x0, y0, x1, y1) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#9d7bff'); g.addColorStop(.5, '#6f8cff'); g.addColorStop(1, '#4fd8ff'); return g; };

  // фон: размытый постер, затемнение и цветное свечение
  x.fillStyle = '#09090f'; x.fillRect(0, 0, W, H);
  if (img) { x.save(); x.filter = 'blur(70px) saturate(1.3) brightness(.5)'; cover(x, img, -120, -120, W + 240, H + 240); x.restore(); }
  let g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(9,9,15,.3)'); g.addColorStop(.5, 'rgba(9,9,15,.78)'); g.addColorStop(1, 'rgba(9,9,15,.97)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(W, 0, 0, W, 0, 700); g.addColorStop(0, 'rgba(79,216,255,.18)'); g.addColorStop(1, 'rgba(79,216,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(0, H, 0, 0, H, 800); g.addColorStop(0, 'rgba(139,123,255,.2)'); g.addColorStop(1, 'rgba(139,123,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // постер
  const px = 80, py = 100, pw = 380, ph = 570;
  x.save(); x.shadowColor = 'rgba(0,0,0,.65)'; x.shadowBlur = 70; x.shadowOffsetY = 30;
  x.beginPath(); x.roundRect(px, py, pw, ph, 28); x.fillStyle = '#1b1b27'; x.fill(); x.restore();
  x.save(); x.beginPath(); x.roundRect(px, py, pw, ph, 28); x.clip();
  if (img) cover(x, img, px, py, pw, ph);
  else {
    x.fillStyle = grad(px, py, px + pw, py + ph); x.globalAlpha = .35; x.fillRect(px, py, pw, ph); x.globalAlpha = 1;
    x.fillStyle = '#eef0fa'; x.font = `800 40px ${F}`; x.textAlign = 'center';
    wrapText(x, m.title, pw - 60, 4).forEach((l, i) => x.fillText(l, px + pw / 2, py + ph / 2 - 40 + i * 48));
    x.textAlign = 'left';
  }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2; x.beginPath(); x.roundRect(px, py, pw, ph, 28); x.stroke();

  // правая колонка: название и данные
  const rx = 520, rw = W - rx - 80;
  x.textBaseline = 'alphabetic';
  x.letterSpacing = '5px'; x.font = `700 22px ${F}`; x.fillStyle = grad(rx, 0, rx + 360, 0);
  x.fillText('KINORA · МОЯ ОЦЕНКА', rx, 140);
  // длинное название сначала уменьшаем, чтобы оно влезло в две строки, и только потом переносим на третью
  x.letterSpacing = '-1.5px'; x.fillStyle = '#ffffff';
  let fs = 62, tl;
  for (; ; fs -= 4) { x.font = `800 ${fs}px ${F}`; tl = wrapText(x, m.title, rw, 3); if (tl.length <= 2 || fs <= 50) break; }
  const lh = Math.round(fs * 1.1);
  tl.forEach((l, i) => x.fillText(l, rx, 215 + i * lh));
  let y = 215 + (tl.length - 1) * lh + 52;
  x.letterSpacing = '0px'; x.font = `500 27px ${F}`; x.fillStyle = '#a9abc4';
  x.fillText([m.orig && m.orig !== m.title ? m.orig : '', m.year].filter(Boolean).join(' · ').slice(0, 60), rx, y);
  if (m.director) { y += 40; wrapText(x, 'реж. ' + m.director, rw, 1).forEach(l => x.fillText(l, rx, y)); }
  if (m.genres.length) { y += 40; x.fillStyle = '#7d80a0'; wrapText(x, m.genres.slice(0, 3).join(' · '), rw, 1).forEach(l => x.fillText(l, rx, y)); }

  // кольцо общей оценки: опускается под текст, если название длинное (но не залезает на критерии)
  const rad = 95, cx = rx + 105, cy = Math.min(630, Math.max(565, y + 40 + rad));
  x.lineCap = 'round';
  x.lineWidth = 14; x.strokeStyle = 'rgba(255,255,255,.1)'; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.stroke();
  if (t) {
    x.save(); x.shadowColor = t.c1; x.shadowBlur = 30;
    x.strokeStyle = t.c1; x.beginPath(); x.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s / 10); x.stroke(); x.restore();
  }
  x.textAlign = 'center'; x.fillStyle = '#ffffff'; x.font = `800 66px ${F}`; x.letterSpacing = '-2px';
  x.fillText(t ? fmt(s) : '—', cx, cy + 16);
  x.letterSpacing = '3px'; x.font = `700 17px ${F}`; x.fillStyle = '#7d80a0'; x.fillText('ИЗ 10', cx, cy + 48);
  x.textAlign = 'left'; x.letterSpacing = '-1px';
  x.font = `800 46px ${F}`; x.fillStyle = t ? t.c1 : '#7d80a0';
  x.fillText(t ? t.name : 'Ещё не оценён', cx + rad + 40, cy + 6);
  x.letterSpacing = '0px'; x.font = `500 24px ${F}`; x.fillStyle = '#a9abc4';
  x.fillText(t ? 'общая оценка' : 'откройте фильм и поставьте баллы', cx + rad + 40, cy + 44);

  // оценки по критериям
  const sc = (r && r.scores) || {};
  let cyy = 790;
  x.font = `800 30px ${F}`; x.fillStyle = '#ffffff'; x.letterSpacing = '-.5px';
  x.fillText('Оценки по критериям', 80, cyy);
  x.letterSpacing = '0px';
  CRIT.forEach((k, i) => {
    const v = sc[k] || 0, ry = cyy + 62 + i * 58, bx = 380, bw = 520;
    x.font = `500 26px ${F}`; x.fillStyle = '#cfd1e4'; x.fillText(k, 80, ry);
    x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.roundRect(bx, ry - 17, bw, 14, 7); x.fill();
    if (v) { x.fillStyle = TIERS[tierIdx(v)].c1; x.beginPath(); x.roundRect(bx, ry - 17, Math.max(14, bw * v / 10), 14, 7); x.fill(); }
    x.textAlign = 'right'; x.font = `800 28px ${F}`; x.fillStyle = v ? TIERS[tierIdx(v)].c1 : '#5b5e78';
    x.fillText(v ? String(v) : '—', 1000, ry); x.textAlign = 'left';
  });

  // подвал: логотип и дата
  const fy = 1262;
  x.beginPath(); x.roundRect(80, fy - 40, 54, 54, 16); x.fillStyle = grad(80, fy - 40, 134, fy + 14); x.fill();
  x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(99, fy - 26); x.lineTo(99, fy); x.lineTo(121, fy - 13); x.closePath(); x.fill();
  x.font = `800 36px ${F}`; x.letterSpacing = '-1.5px'; x.fillStyle = '#ffffff'; x.fillText('kinora', 150, fy - 2);
  x.letterSpacing = '0px'; x.textAlign = 'right'; x.font = `500 22px ${F}`; x.fillStyle = '#7d80a0';
  const when = r && r.updated ? new Date(r.updated) : new Date();
  x.fillText(when.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }), 1000, fy - 2);
  x.textAlign = 'left';
  return c;
}

async function openShare(m) {
  shareM.innerHTML = `<div class="backdrop"></div>
    <div class="sheet share">
      <button class="x" title="Закрыть (Esc)">✕</button>
      <h2>Карточка фильма</h2>
      <div class="r-sub">Картинка 1080 × 1350 — удобно отправить другу или выложить в сторис</div>
      <div class="sh-prev"><div class="sh-load">Рисую карточку…</div></div>
      <div class="r-foot"><button class="btn" data-s="copy" disabled>Копировать</button><button class="btn accent" data-s="save" disabled>Сохранить PNG</button></div>
    </div>`;
  $('.x', shareM).onclick = $('.backdrop', shareM).onclick = () => shareM.classList.remove('open');
  shareM.classList.add('open');
  const canvas = await drawCard(m), url = canvas.toDataURL('image/png');
  $('.sh-prev', shareM).innerHTML = `<img src="${url}" alt="">`;
  const name = `kinora — ${m.title}`;
  $$('[data-s]', shareM).forEach(b => b.disabled = false);
  $('[data-s="save"]', shareM).onclick = async () => {
    if (droid) { const err = droid.saveFile(name + '.png', 'image/png', url); toast(err ? '⚠ ' + err : '🖼 Карточка сохранена в галерею'); return; }
    if (!host) { const a = document.createElement('a'); a.href = url; a.download = name + '.png'; a.click(); return; }
    const res = await call('saveImage', { data: url, name });
    if (res.ok) toast('🖼 Карточка сохранена');
    else if (res.error) toast('⚠ ' + res.error);
  };
  $('[data-s="copy"]', shareM).onclick = async () => {
    try {
      if (host) { const res = await call('copyImage', { data: url }); if (!res.ok) throw new Error(res.error); }
      else { const blob = await new Promise(r => canvas.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); }
      toast('📋 Картинка скопирована — вставьте её в чат (Ctrl+V)');
    } catch (e) { toast('⚠ Не удалось скопировать' + (e && e.message ? ': ' + e.message : '')); }
  };
  // на телефоне вместо копирования — системное меню «Поделиться» (Telegram, WhatsApp…)
  if (droid) {
    const b = $('[data-s="copy"]', shareM);
    b.textContent = 'Поделиться';
    b.onclick = () => { const err = droid.shareImage(name + '.png', url); if (err) toast('⚠ ' + err); };
  } else if (!host && navigator.canShare) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], name + '.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      const b = $('[data-s="copy"]', shareM);
      b.textContent = 'Поделиться';
      b.onclick = () => navigator.share({ files: [file], title: m.title }).catch(() => { });
    }
  }
}

/* ================= фильтр по годам ================= */
const renderSoon = debounce(render, 90);
function buildYears() {
  const ys = S.movies.map(m => m.year).filter(Boolean);
  if (!ys.length) return;
  const wasAll = yearsAll();
  S.yMin = Math.min(...ys); S.yMax = Math.max(...ys);
  if (wasAll) { S.y1 = S.yMin; S.y2 = S.yMax; }
  else { S.y1 = Math.max(S.yMin, S.y1); S.y2 = Math.min(S.yMax, S.y2); }
  const a = $('#yrA'), b = $('#yrB'), box = $('#years');
  [a, b].forEach(i => { i.min = S.yMin; i.max = S.yMax; i.step = 1; });
  a.value = S.y1; b.value = S.y2;
  const sync = () => {
    const v1 = Math.min(+a.value, +b.value), v2 = Math.max(+a.value, +b.value), span = S.yMax - S.yMin || 1;
    S.y1 = v1; S.y2 = v2;
    box.style.setProperty('--a', (v1 - S.yMin) / span);
    box.style.setProperty('--b', (v2 - S.yMin) / span);
    $('#yrText').textContent = yearsAll() ? 'Все годы' : v1 === v2 ? String(v1) : `${v1} – ${v2}`;
    box.classList.toggle('set', !yearsAll());
  };
  a.oninput = b.oninput = () => { sync(); renderSoon(); };
  $('#yrReset').onclick = () => { a.value = S.yMin; b.value = S.yMax; sync(); render(); };
  sync();
}

/* ================= светлая и тёмная тема ================= */
function setTheme(theme, ev) {
  const apply = () => { document.documentElement.dataset.theme = theme; keep('kc_theme', theme); syncThemeColor(); };
  if (!document.startViewTransition || calm || !ev) { apply(); return; }
  // новая тема раскрывается кругом от кнопки
  const x = ev.clientX, y = ev.clientY, rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() => document.documentElement.animate(
    { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
    { duration: 700, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' }));
}
// цвет строки состояния телефона — в тон теме
function syncThemeColor() {
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = document.documentElement.dataset.theme === 'light' ? '#f4f5fb' : '#09090f';
}
document.documentElement.dataset.theme = load('kc_theme', 'dark');
syncThemeColor();

/* ================= цвет оформления ================= */
// a/a2 — акцент в тёмной теме, la/la2 — в светлой (темнее, чтобы читалось на белом), g — градиент кнопок и полосок
const ACCENTS = [
  ['violet', 'Фиолетовый', null],
  ['emerald', 'Изумруд', { a: '#34d399', a2: '#7ee8c3', g: ['#2fd3a0', '#10b981', '#22d3ee'], rgb: '52, 211, 153', la: '#0e9f6e', la2: '#057a55' }],
  ['ocean', 'Океан', { a: '#3b9cff', a2: '#8cc4ff', g: ['#4f7bff', '#2d8cff', '#22e0e0'], rgb: '59, 156, 255', la: '#1d6fe0', la2: '#1659b8' }],
  ['rose', 'Розовый', { a: '#f472b6', a2: '#f9a8d4', g: ['#c084fc', '#f472b6', '#fb7185'], rgb: '244, 114, 182', la: '#d6338a', la2: '#b0206e' }],
  ['sunset', 'Закат', { a: '#ff6b6b', a2: '#ff9f9f', g: ['#ff8a5b', '#ff4f8b', '#ffb347'], rgb: '255, 107, 107', la: '#e0483f', la2: '#b8302a' }],
  ['gold', 'Золото', { a: '#f5b818', a2: '#ffd66b', g: ['#ffd34d', '#f59e0b', '#fb7f3c'], rgb: '245, 184, 24', la: '#b7791f', la2: '#975a16' }],
  ['crimson', 'Красный', { a: '#ff3d57', a2: '#ff8c9c', g: ['#ff5470', '#e50914', '#ff8a45'], rgb: '255, 61, 87', la: '#d61f3a', la2: '#b0172e' }],
];
const accentGrad = p => p ? `linear-gradient(135deg, ${p.g.join(', ')})` : 'linear-gradient(135deg, #9d7bff, #6f8cff, #4fd8ff)';
function applyAccent(k) {
  const p = (ACCENTS.find(x => x[0] === k) || ACCENTS[0])[2];
  let st = $('#accentStyle');
  if (!st) { st = document.createElement('style'); st.id = 'accentStyle'; document.head.append(st); }
  st.textContent = !p ? '' : `
    :root { --accent: ${p.a}; --accent2: ${p.a2}; --cyan: ${p.g[2]}; --accent-soft: rgba(${p.rgb}, .12); --grad: linear-gradient(115deg, ${p.g[0]} 0%, ${p.g[1]} 50%, ${p.g[2]} 100%); }
    :root[data-theme="light"] { --accent: ${p.la}; --accent2: ${p.la2}; --accent-soft: rgba(${p.rgb}, .12); }
    body::before { background: radial-gradient(800px 500px at 100% 0%, rgba(${p.rgb}, .07), transparent 70%), radial-gradient(900px 600px at 0% 100%, rgba(${p.rgb}, .08), transparent 70%); }
    .tab-ind { box-shadow: 0 0 14px rgba(${p.rgb}, .7); }
    .logo-mark { box-shadow: 0 8px 22px -8px rgba(${p.rgb}, .9), inset 0 1px 0 rgba(255, 255, 255, .3); }`;
}
applyAccent(load('kc_accent', 'violet'));
function accentPanel() {
  const cur = load('kc_accent', 'violet');
  return `<div class="panel span4 accents"><h3>Цвет оформления</h3>
    <div class="acc-list">${ACCENTS.map(([k, n, p]) => `<button class="acc ${k === cur ? 'on' : ''}" data-acc="${k}"><i style="background:${accentGrad(p)}"></i>${n}</button>`).join('')}</div></div>`;
}

/* ================= уведомления ================= */
function toast(text, cls) {
  const t = document.createElement('div');
  t.className = 'toast' + (cls ? ' ' + cls : '');
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, cls === 'ach' ? 4200 : 2200);
}

/* ================= знакомство: плашка и экскурсия ================= */
// экскурсия подсвечивает элемент и рассказывает, что он делает; шаги без своего элемента на экране пропускаются
const TOUR = [
  { sel: '.search', t: 'Поиск', d: 'Ищет по названию, режиссёру, актёрам, стране и году. На компьютере — <b>Ctrl + K</b>.' },
  { sel: '#tabs', t: 'Разделы', d: '<b>Каталог</b> — все фильмы, <b>Избранное</b> и <b>«Смотреть позже»</b> — ваши списки, <b>Коллекции</b> — свои подборки, <b>Статистика</b> — графики и достижения.' },
  { sel: '#rouletteBtn', t: 'Что посмотреть?', d: 'Не можете выбрать — крутите рулетку. Она учитывает выбранные жанр, страну и годы.' },
  { sel: '#addBtn, #moreBtn', t: 'Свой фильм', d: 'Нужного фильма нет? Вставьте ссылку на Кинопоиск, IMDb или Википедию — остальное заполнится само.' },
  { sel: '#filters .tb-row, #mBar', t: 'Фильтры', d: 'Категории по <b>вашей</b> оценке, рейтинг IMDb, страна и сортировка.' },
  { sel: '.genres-wrap, #mBar .genres-box', t: 'Жанры и годы', d: 'Лента жанров листается вбок, ползунок сужает годы выхода.' },
  { sel: '#grid .card', t: 'Окно фильма', d: 'Нажмите на постер: оценка по 7 критериям, заметки, где смотреть, отметки просмотров и кнопка <b>«В коллекцию»</b>.' },
  { sel: '#tabs [data-view="coll"]', t: 'Коллекции', d: 'Собирайте подборки: «На Новый год», «Весь Нолан», «С друзьями». Создать коллекцию можно здесь или прямо в окне фильма.' },
  { sel: '#helpBtn, #moreBtn', t: 'Подсказка всегда здесь', d: 'Экскурсию можно пройти ещё раз в любой момент. Приятного просмотра!' },
];
const tourEl = $('#tour'), helpTip = $('#helpTip');
let tourI = 0;
const tourTarget = s => $$(s.sel).find(el => el.getClientRects().length && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden') || null;

function startTour() {
  hideHelpTip();
  if (detail.classList.contains('open')) closeDetail();
  [roul, editor, shareM].forEach(x => x.classList.remove('open'));
  if (S.view !== 'all') $('#tabs button[data-view="all"]').click();
  tourEl.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"></div>';
  tourEl.classList.add('open');
  showTourStep(0);
}
function endTour() {
  tourEl.classList.remove('open');
  keep('kc_tour', 1);
}
function showTourStep(i) {
  tourI = Math.max(0, Math.min(TOUR.length - 1, i));
  const s = TOUR[tourI], el = tourTarget(s), card = $('.tour-card', tourEl), last = tourI === TOUR.length - 1;
  card.innerHTML = `<div class="tc-top"><span class="tc-step">${tourI + 1} из ${TOUR.length}</span>${last ? '' : '<button class="tc-skip">Пропустить</button>'}</div>
    <b>${s.t}</b><p>${s.d}</p>
    <div class="tc-acts">${tourI ? '<button class="btn sm" data-t="-1">Назад</button>' : ''}<button class="btn sm accent" data-t="1">${last ? 'Готово' : 'Далее'}</button></div>`;
  $$('[data-t]', card).forEach(b => b.onclick = () => last && +b.dataset.t > 0 ? endTour() : showTourStep(tourI + +b.dataset.t));
  const skip = $('.tc-skip', card);
  if (skip) skip.onclick = endTour;
  // элемент на странице прокручиваем к середине экрана; шапка и нижняя панель видны всегда
  if (el && !el.closest('.top')) {
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 140) window.scrollTo({ top: scrollY + r.top - innerHeight / 2 + r.height / 2, behavior: 'instant' });
  }
  card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
  requestAnimationFrame(placeTour);
}
function placeTour() {
  if (!tourEl.classList.contains('open')) return;
  const el = tourTarget(TOUR[tourI]), hole = $('.tour-hole', tourEl), card = $('.tour-card', tourEl);
  const vw = document.documentElement.clientWidth, vh = innerHeight, cw = card.offsetWidth, ch = card.offsetHeight;
  if (!el) {
    Object.assign(hole.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: 0, height: 0 });
    Object.assign(card.style, { left: (vw - cw) / 2 + 'px', top: (vh - ch) / 2 + 'px' });
    return;
  }
  const r = el.getBoundingClientRect(), pad = 6;
  const L = Math.max(4, r.left - pad), T = Math.max(4, r.top - pad), R = Math.min(vw - 4, r.right + pad), B = Math.min(vh - 4, r.bottom + pad);
  Object.assign(hole.style, { left: L + 'px', top: T + 'px', width: R - L + 'px', height: B - T + 'px' });
  // карточка — под подсветкой, если не помещается — над ней, иначе посередине экрана
  const gap = 14;
  const top = B + gap + ch <= vh - 8 ? B + gap : T - gap - ch >= 8 ? T - gap - ch : Math.max(8, (vh - ch) / 2);
  const left = Math.min(Math.max(12, (L + R) / 2 - cw / 2), vw - cw - 12);
  Object.assign(card.style, { left: left + 'px', top: top + 'px' });
}

// плашка при первом запуске: стоит под кнопкой «?», чтобы было видно, где потом искать экскурсию
function showHelpTip() {
  helpTip.innerHTML = `<button class="ht-x" title="Скрыть">✕</button>
    <b>👋 Впервые в Kinora?</b><span>Покажу за минуту, где что находится.</span>
    <div class="ht-acts"><button class="btn sm accent" data-h="go">Показать</button><button class="btn sm" data-h="no">Не сейчас</button></div>`;
  $('[data-h="go"]', helpTip).onclick = startTour;
  $('[data-h="no"]', helpTip).onclick = $('.ht-x', helpTip).onclick = () => { hideHelpTip(); toast('Экскурсия — по кнопке «?» вверху'); };
  helpTip.classList.add('open');
  placeHelpTip();
}
function hideHelpTip() {
  helpTip.classList.remove('open');
  $('#helpBtn').classList.remove('new'); $('#moreBtn').classList.remove('new');
  keep('kc_tour', 1);
}
function placeHelpTip() {
  if (!helpTip.classList.contains('open')) return;
  const b = (phoneMQ.matches ? $('#moreBtn') : $('#helpBtn')).getBoundingClientRect(), vw = document.documentElement.clientWidth, w = helpTip.offsetWidth;
  const left = Math.min(Math.max(12, b.left + b.width / 2 - w / 2), vw - w - 12);
  Object.assign(helpTip.style, { top: b.bottom + 12 + 'px', left: left + 'px' });
  helpTip.style.setProperty('--ax', b.left + b.width / 2 - left + 'px');
}
// человек занялся другим — плашка уходит, не мешая; точка на «?» остаётся, а при следующем запуске плашка появится снова
document.addEventListener('click', e => {
  if (helpTip.classList.contains('open') && !e.target.closest('#helpTip, #helpBtn')) helpTip.classList.remove('open');
}, true);
window.addEventListener('resize', () => { placeTour(); placeHelpTip(); });
window.addEventListener('scroll', placeTour, { passive: true });

/* ================= телефон: кнопка «Назад» и свайпы ================= */
// каждое открытое окно — шаг в истории браузера: «Назад» на Android закрывает окно, а не всё приложение
function setupBackButton() {
  const closers = new Map([
    [detail, () => closeDetail()], [roul, () => closeRoulette()],
    [editor, () => editor.classList.remove('open')], [shareM, () => shareM.classList.remove('open')],
    [tourEl, () => endTour()],
    // «Назад» на телефоне закрывает и открытое меню фильтра
    ...$$('.dd').map(d => [d, () => d.classList.remove('open')]),
    [$('#filters'), () => $('#filters').classList.remove('open')],
    [$('#moreSheet'), () => $('#moreSheet').classList.remove('open')],
  ]);
  const stack = [];
  // на все открытые окна в истории одна запись: если в одном такте закрыть окно и открыть другое
  // («Открыть фильм» в рулетке), отложенный history.back() не путается с pushState и не уводит со страницы
  let held = false, fromPop = false;
  const sync = () => {
    if (stack.length && !held) { history.pushState({ kinora: 1 }, ''); held = true; }
    else if (!stack.length && held && !fromPop) { held = false; history.back(); }
  };
  const mo = new MutationObserver(recs => {
    recs.forEach(r => {
      const el = r.target, open = el.classList.contains('open'), i = stack.lastIndexOf(el);
      if (open && i < 0) stack.push(el);
      else if (!open && i >= 0) stack.splice(i, 1);
    });
    sync();
  });
  closers.forEach((_, el) => mo.observe(el, { attributes: true, attributeFilter: ['class'] }));
  window.addEventListener('popstate', () => {
    // запись уже снята своим history.back() — это не нажатие «Назад»
    if (!held) return;
    held = false;
    const el = stack[stack.length - 1];
    if (!el) return;
    fromPop = true;
    closers.get(el)();
    // остались открытые окна или окно отказалось закрываться (рулетка ещё крутится) — возвращаем запись
    setTimeout(() => { fromPop = false; sync(); }, 0);
  });
}

// в окне фильма свайп влево/вправо листает фильмы
function setupSwipe() {
  let x0 = 0, y0 = 0, ok = false;
  detail.addEventListener('touchstart', e => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY;
    ok = e.touches.length === 1 && !e.target.closest('.pips, textarea, input, label, .qi, .switch, button');
  }, { passive: true });
  detail.addEventListener('touchend', e => {
    if (!ok) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 80 && Math.abs(dy) < Math.abs(dx) * .5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/* ================= запуск ================= */
async function init() {
  const get = async (u, d) => {
    try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : d; } catch { return d; }
  };
  const base = await get('../data/movies.json', []);
  const custom = host ? await get('../data/my_movies.json', []) : load('kc_custom', []);
  S.ratings = host ? await get('../data/ratings.json', {}) : load('kc_ratings', {});
  const fileColls = host ? await get('../data/collections.json', null) : null;
  S.colls = (Array.isArray(fileColls) ? fileColls : load('kc_colls', []))
    .filter(c => c && c.id && Array.isArray(c.ids)).map(c => ({ desc: '', ...c, name: String(c.name || 'Коллекция') }));
  // хранилище постеров иногда недоступно (инкогнито, урезанный браузер) — не ждём его дольше 2 секунд
  if (!host) {
    try {
      const saved = await Promise.race([posterDB.all(), new Promise(r => setTimeout(() => r([]), 2000))]);
      for (const [k, v] of saved) localPosters[k] = v;
    } catch { }
  }
  custom.forEach(m => m.custom = true);
  S.movies = [...base, ...custom].filter(m => m && m.id).map(m => ({
    ...m, title: m.title || m.orig || m.id, genres: m.genres || [], actors: m.actors || [],
  }));
  S.sort = load('kc_sort', 'title');
  if (!SORTS.some(s => s[0] === S.sort)) S.sort = 'title';

  // демо-оценки для проверки вида в обычном браузере (в приложении не используются)
  if (!host && location.hash.includes('demo')) {
    S.movies.slice(0, 14).forEach((m, i) => {
      const v = [10, 9, 8, 7, 9, 6, 5, 4, 8, 3, 2, 9, 7, 6][i];
      S.ratings[m.id] = { scores: Object.fromEntries(CRIT.map((c, k) => [c, Math.max(1, Math.min(10, v + ((k % 3) - 1)))])), manual: 0, comment: '', favorite: i % 4 === 0 };
    });
  }

  // на телефоне постеры в 2 или 3 ряда — кнопка-сетка у заголовка раздела
  document.body.classList.toggle('cols3', load('kc_cols', 2) === 3);
  $('#densBtn').onclick = () => {
    const three = document.body.classList.toggle('cols3');
    keep('kc_cols', three ? 3 : 2);
    toast(three ? 'Три постера в ряд' : 'Два постера в ряд');
  };

  if (!achSeen) { achSeen = achDone(); keep('kc_ach', achSeen); }
  buildPills(); buildGenres(); buildCountry(); buildSort(); buildImdb(); buildYears();
  render();
  moveTabInd();
  pickHero();
  showHero(0);
  const top = $('.top');
  // параллакс баннера: фон и текст уходят вверх с разной скоростью
  const hero = $('#hero');
  let scrollTick = false, lastSy = -1;
  window.addEventListener('scroll', () => {
    fillGrid();
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      const y = window.scrollY, sy = Math.min(y, 700);
      top.classList.toggle('scrolled', y > 30);
      // параллакс пересчитываем, только пока баннер виден и значение меняется
      if (!calm && sy !== lastSy) { lastSy = sy; hero.style.setProperty('--sy', sy); }
    });
  }, { passive: true });

  $$('#tabs button').forEach(b => b.onclick = () => {
    $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    moveTabInd();
    S.view = b.dataset.view;
    // вкладка «Коллекции» всегда открывает их список
    if (S.view === 'coll') S.coll = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  const q = $('#q');
  q.addEventListener('input', debounce(() => {
    S.q = norm(q.value.trim());
    if (S.view === 'stats' || (S.view === 'coll' && !curColl())) $('#tabs button[data-view="all"]').click();
    render();
  }, 140));
  $('#addBtn').onclick = () => openEditor(null);
  // кнопка «Наверх» появляется, когда каталог пролистан далеко
  const up = $('#upBtn');
  window.addEventListener('scroll', () => up.classList.toggle('on', window.scrollY > 1600), { passive: true });
  up.onclick = () => window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  $('#rouletteBtn').onclick = openRoulette;
  $('#helpBtn').onclick = startTour;
  $('#themeBtn').onclick = e => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', e);
  // колесо мыши прокручивает ленту жанров по горизонтали
  const gl = $('#genres');
  gl.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || gl.scrollWidth <= gl.clientWidth) return;
    e.preventDefault(); gl.scrollLeft += e.deltaY;
  }, { passive: false });
  window.addEventListener('resize', moveTabInd);

  document.addEventListener('keydown', e => {
    if (tourEl.classList.contains('open')) {
      if (e.key === 'Escape') endTour();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); tourI === TOUR.length - 1 ? endTour() : showTourStep(tourI + 1); }
      else if (e.key === 'ArrowLeft') showTourStep(tourI - 1);
      return;
    }
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.ctrlKey && e.code === 'KeyK') || (e.key === '/' && !typing)) {
      e.preventDefault(); q.focus(); q.select(); return;
    }
    if (e.key === 'Escape') {
      if (shareM.classList.contains('open')) shareM.classList.remove('open');
      else if (editor.classList.contains('open')) editor.classList.remove('open');
      else if (roul.classList.contains('open')) closeRoulette();
      else if (detail.classList.contains('open')) closeDetail();
      else if (typing) document.activeElement.blur();
      return;
    }
    if (detail.classList.contains('open') && !editor.classList.contains('open') && !shareM.classList.contains('open') && !typing) {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    }
  });

  // в узкой шапке длинная подсказка обрезается
  if (matchMedia('(max-width: 400px)').matches) q.placeholder = 'Поиск фильма';
  else if (matchMedia('(max-width: 640px)').matches) q.placeholder = 'Фильм, актёр, год…';
  if (!host) { setupBackButton(); setupSwipe(); }
  // установка на главный экран и работа без интернета (только на сайте, не в Windows-приложении)
  if (!host && !droid && 'serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });

  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('view')) { const b = $(`#tabs button[data-view="${h.get('view')}"]`); if (b) b.click(); }
  if (h.get('coll') && S.colls.some(c => c.id === h.get('coll'))) { S.coll = h.get('coll'); render(); }
  if (h.get('open')) openDetail(S.movies.find(m => m.id === h.get('open')));

  // первый запуск: плашка с предложением экскурсии; потом её можно вызвать кнопкой «?»
  if (!load('kc_tour', 0)) { $('#helpBtn').classList.add('new'); $('#moreBtn').classList.add('new'); setTimeout(showHelpTip, 1400); }
}

init();
