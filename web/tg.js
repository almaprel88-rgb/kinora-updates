'use strict';
// Kinora внутри Telegram (Mini App). Везде, кроме Telegram (Kinora.exe, APK, обычный браузер), файл ничего не делает.
// В Telegram:
//  • оценки, свои фильмы, коллекции и игры хранятся ещё и в облаке Telegram (CloudStorage) — у каждого
//    пользователя своё, и они одинаковые на всех его устройствах, где есть Telegram;
//  • «Назад» — телеграмовская кнопка, ссылки открываются через Telegram, тема — как в Telegram.
// Облако: значение ключа — до 4096 символов, поэтому данные режутся на куски c_<имя>_<поколение>_<n>,
// а m_<имя> = { g, n, t } говорит, какое поколение целое. Сначала пишутся куски, потом m_ — оборванная
// запись не портит прошлую копию.
(function () {
  const inTg = /tgWebAppData=/.test(location.hash + location.search);
  if (!inTg) return;

  const SYNC = { kc_ratings: 'r', kc_custom: 'my', kc_colls: 'col', kc_ach: 'ach', kc_games: 'gm', kc_tourn: 'tr', kc_rec_hide: 'rh', kc_play: 'pl' };
  // сервер оплаты звёздами (tools/server/kinora_pay.py) есть только на своём сервере; с GitHub Pages игры без лимита
  const API = location.hostname === 'kinora.murcon.pw' ? '/api/' : '';
  const CHUNK = 3800;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { } },
  };
  const mt = (() => { try { return JSON.parse(ls.get('kc_tg_mt')) || {}; } catch { return {}; } })();
  const saveMt = () => ls.set('kc_tg_mt', JSON.stringify(mt));

  let wa = null, cs = null, settled = false;
  const P = (fn, ...a) => new Promise((res, rej) => fn.call(cs, ...a, (e, v) => e ? rej(e) : res(v)));
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej('timeout'), ms))]);

  /* ---------- загрузка SDK Telegram ---------- */
  const sdk = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = () => res(window.Telegram && window.Telegram.WebApp);
    s.onerror = () => res(null);
    document.head.appendChild(s);
    setTimeout(() => res(window.Telegram && window.Telegram.WebApp), 6000);
  });

  /* ---------- облако → устройство ---------- */
  async function pull() {
    const user = wa.initDataUnsafe && wa.initDataUnsafe.user;
    const uid = user ? String(user.id) : '';
    // на одном телефоне может быть несколько аккаунтов Telegram — чужие оценки не показываем и не отправляем
    const was = ls.get('kc_tg_uid');
    if (was && uid && was !== uid) {
      for (const k in SYNC) { ls.del(k); delete mt[k]; }
      ls.del('kc_snaps');
      saveMt();
    }
    if (uid) ls.set('kc_tg_uid', uid);

    const keys = await P(cs.getKeys);
    const metaKeys = Object.values(SYNC).map(a => 'm_' + a).filter(k => keys.includes(k));
    const metas = metaKeys.length ? await P(cs.getItems, metaKeys) : {};
    const live = new Set(metaKeys);
    for (const [k, a] of Object.entries(SYNC)) {
      let m = null;
      try { m = metas['m_' + a] ? JSON.parse(metas['m_' + a]) : null; } catch { }
      if (m && m.n >= 0) {
        for (let i = 0; i < m.n; i++) live.add(`c_${a}_${m.g}_${i}`);
        if (!mt[k] || m.t > mt[k] || ls.get(k) == null) {
          const ck = Array.from({ length: m.n }, (_, i) => `c_${a}_${m.g}_${i}`);
          const parts = ck.length ? await P(cs.getItems, ck) : {};
          const s = ck.map(c => parts[c] || '').join('');
          try { JSON.parse(s); } catch { continue; }   // повреждённая копия — оставляем то, что на устройстве
          // облако ответило, когда приложение уже открылось с данными устройства — не подменяем их на ходу
          if (settled) return;
          if (ls.set(k, s)) { mt[k] = m.t; saveMt(); }
          continue;
        }
        if (mt[k] > m.t) schedule(k);
      } else if (ls.get(k) != null) {
        // в облаке ещё ничего нет — отправляем то, что уже есть на устройстве
        mt[k] = mt[k] || Date.now(); saveMt(); schedule(k);
      }
    }
    // мусор от оборванных записей
    const junk = keys.filter(k => /^c_/.test(k) && !live.has(k));
    if (junk.length) P(cs.removeItems, junk).catch(() => { });
  }

  /* ---------- устройство → облако ---------- */
  const timers = {}, busy = {};
  function schedule(k, ms = 1200) {
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => push(k), ms);
  }
  async function push(k) {
    if (!cs) return;
    if (busy[k]) { schedule(k, 800); return; }
    busy[k] = true;
    const a = SYNC[k];
    try {
      let old = null;
      try { old = JSON.parse((await P(cs.getItem, 'm_' + a)) || 'null'); } catch { }
      const s = ls.get(k);
      if (s == null) { await P(cs.removeItem, 'm_' + a); }
      else {
        const g = Date.now().toString(36), n = Math.ceil(s.length / CHUNK);
        for (let i = 0; i < n; i++) await P(cs.setItem, `c_${a}_${g}_${i}`, s.slice(i * CHUNK, (i + 1) * CHUNK));
        await P(cs.setItem, 'm_' + a, JSON.stringify({ g, n, t: mt[k] || Date.now() }));
      }
      if (old && old.n) P(cs.removeItems, Array.from({ length: old.n }, (_, i) => `c_${a}_${old.g}_${i}`)).catch(() => { });
      failed = false;
    } catch (e) {
      if (!failed && window.toast) { failed = true; toast('⚠ Не удалось сохранить оценки в облако Telegram — они остались на этом устройстве', 'warn'); }
      schedule(k, 15000);
    } finally { busy[k] = false; }
  }
  let failed = false;
  // Telegram закрывают — отправляем всё, что ждёт
  const flush = () => { for (const k in timers) { clearTimeout(timers[k]); delete timers[k]; push(k); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  /* ---------- оформление и кнопки Telegram ---------- */
  function setupUi() {
    wa.ready();
    try { wa.expand(); } catch { }
    if (wa.isVersionAtLeast && wa.isVersionAtLeast('7.7')) try { wa.disableVerticalSwipes(); } catch { }
    // тема: пока её не выбрали в Kinora — как в Telegram
    if (ls.get('kc_theme') == null && wa.colorScheme) document.documentElement.dataset.theme = wa.colorScheme === 'light' ? 'light' : 'dark';
    const paint = () => {
      const c = document.documentElement.dataset.theme === 'light' ? '#f4f5fb' : '#09090f';
      try { wa.setHeaderColor(c); wa.setBackgroundColor(c); if (wa.setBottomBarColor) wa.setBottomBarColor(c); } catch { }
    };
    paint();
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // «Назад»: история страницы та же, что и в браузере, кнопка Telegram просто её листает
    if (wa.BackButton) wa.BackButton.onClick(() => history.back());
    // внешние ссылки (Кинопоиск, трейлеры) — через Telegram, иначе в некоторых клиентах они не открываются
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href^="http"]');
      if (!a || a.hasAttribute('download')) return;
      e.preventDefault();
      if (/^https:\/\/t\.me\//.test(a.href)) wa.openTelegramLink(a.href); else wa.openLink(a.href);
    }, true);
  }

  window.KinoraTG = {
    // init() в app.js ждёт этого, прежде чем читать оценки
    ready: (async () => {
      wa = await sdk;
      if (!wa) return;
      try { setupUi(); } catch { }
      cs = wa.isVersionAtLeast && wa.isVersionAtLeast('6.9') ? wa.CloudStorage : null;
      if (cs) try { await timeout(pull(), 7000); } catch { }
      settled = true;
    })(),
    // keep() в app.js сообщает о каждом сохранении
    changed(k) {
      if (!(k in SYNC)) return;
      mt[k] = Date.now(); saveMt();
      schedule(k);
    },
    // окна поверх каталога открыты — показываем «Назад»
    back(show) {
      if (!wa || !wa.BackButton) return;
      show ? wa.BackButton.show() : wa.BackButton.hide();
    },
    get user() { return wa && wa.initDataUnsafe && wa.initDataUnsafe.user; },
    // оплата: лимит игр включается, только когда сервер оплаты доступен
    get payOn() { return !!(API && wa && wa.initData && wa.openInvoice && wa.isVersionAtLeast && wa.isVersionAtLeast('6.1')); },
    async api(path, extra = {}) {
      const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: wa.initData, ...extra }) });
      const j = await r.json();
      if (!r.ok && !('cr' in j)) throw new Error(j.error || r.status);
      return j;
    },
    // открывает окно оплаты Telegram; результат — 'paid', 'cancelled', 'failed' или 'pending'
    async buy(product) {
      const { link } = await this.api('invoice', { product });
      if (!link) return 'failed';
      return new Promise(res => wa.openInvoice(link, st => res(st)));
    },
  };
})();
