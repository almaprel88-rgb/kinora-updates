'use strict';
// Вход через Telegram и синхронизация оценок между Kinora.exe, APK, сайтом и Telegram-версией.
// Пока пользователь не вошёл, файл ничего не делает — всё хранится только на устройстве, как раньше.
// В Telegram вход не нужен: аккаунт — это сам Telegram.
//
// Как не потерять оценки при входе: на сервер уходит только то, что изменилось на устройстве с прошлой
// синхронизации (при первом входе — всё), сервер объединяет это со своей копией (по одному фильму —
// более свежая оценка) и возвращает общий результат. Удалённое на устройстве удаляется и на сервере.
// kc_sync_base — «отпечатки» записей на момент прошлой синхронизации, по ним видно, что изменилось.
(function () {
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
    del(k) { try { localStorage.removeItem(k); } catch { } },
  };
  // kc_api — только для проверки на своём компьютере
  const API = ls.get('kc_api') || 'https://kinora.murcon.pw:8443/api/';
  const tgOn = () => !!(window.KinoraTG && KinoraTG.initData && KinoraTG.syncOn);
  const auth = () => tgOn() ? { initData: KinoraTG.initData } : (ls.get('kc_auth') || {}).token ? { token: ls.get('kc_auth').token } : null;
  const account = () => tgOn() ? { uid: String((KinoraTG.user || {}).id || ''), name: (KinoraTG.user || {}).first_name || 'Telegram' } : ls.get('kc_auth');

  // короткий отпечаток записи: изменилась ли она с прошлой синхронизации
  const fp = v => { const s = JSON.stringify(v); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length.toString(36); };
  const mapFp = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fp(v)]));
  const customList = () => S.movies.filter(m => m.custom).map(({ custom, _hay, ...m }) => m);
  const byId = list => Object.fromEntries(list.map(x => [String(x.id), x]));

  let busy = false, again = false, applying = false, timer = null, lastAt = 0, state = '', loginPoll = null;
  const post = async (path, body) => {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw Object.assign(new Error('auth'), { auth: true });
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  };

  async function sync(quiet = true) {
    const a = auth(), acc = account();
    if (!a || !acc || typeof S === 'undefined' || !S.movies) return;
    if (busy) { again = true; return; }
    busy = true; again = false; setState('busy');
    try {
      let base = ls.get('kc_sync_base');
      if (!base || base.uid !== String(acc.uid)) base = null;   // впервые для этого аккаунта — отправляем всё
      const cur = { r: S.ratings, my: byId(customList()), col: byId(S.colls) };
      const sent = { r: mapFp(cur.r), my: mapFp(cur.my), col: mapFp(cur.col) };
      const now = new Date().toISOString();
      const changed = k => Object.fromEntries(Object.entries(cur[k]).filter(([id]) => !base || (base[k] || {})[id] !== sent[k][id]));
      const gone = k => base ? Object.keys(base[k] || {}).filter(id => !(id in cur[k])) : [];
      const body = {
        ...a,
        ratings: changed('r'), del: Object.fromEntries(gone('r').map(id => [id, now])),
        custom: Object.values(changed('my')), customDel: gone('my'),
        colls: Object.values(changed('col')), collDel: gone('col'),
      };
      const res = await post('sync', body);

      // что поменялось на устройстве, пока шёл запрос, — не трогаем, отправим следующим разом
      const keepLocal = (k, obj) => Object.keys(obj).filter(id => fp(obj[id]) !== sent[k][id]);
      const newR = {};
      for (const [id, r] of Object.entries(res.ratings || {})) { const c = cleanRating(r); if (c) newR[id] = c; }
      const kr = keepLocal('r', S.ratings);
      kr.forEach(id => newR[id] = S.ratings[id]);
      Object.keys(sent.r).forEach(id => { if (!(id in S.ratings) && !kr.includes(id)) delete newR[id]; });   // удалено во время запроса
      if (kr.length || keepLocal('my', byId(customList())).length) again = true;

      const newMy = (res.custom || []).map(fixOwnMovie).filter(Boolean);
      const newCol = (res.colls || []).filter(c => c && c.id && Array.isArray(c.ids))
        .map(c => ({ desc: '', ...c, id: String(c.id), name: String(c.name || 'Коллекция'), ids: c.ids.filter(x => typeof x === 'string') }));

      const diff = JSON.stringify(mapFp(newR)) !== JSON.stringify(sent.r)
        || JSON.stringify(mapFp(byId(newMy))) !== JSON.stringify(sent.my)
        || JSON.stringify(mapFp(byId(newCol))) !== JSON.stringify(sent.col);
      if (diff) apply(newR, newMy, newCol);
      ls.set('kc_sync_base', { uid: String(acc.uid), r: mapFp(res.ratings || {}), my: mapFp(byId(res.custom || [])), col: mapFp(byId(res.colls || [])) });
      lastAt = Date.now(); ls.set('kc_sync_at', lastAt);
      setState('ok');
      if (!quiet) toast(diff ? '🔄 Оценки синхронизированы' : '✅ Всё уже синхронизировано');
    } catch (e) {
      if (e.auth && !tgOn()) { ls.del('kc_auth'); ls.del('kc_sync_base'); toast('⚠ Вход в Kinora истёк — войдите через Telegram ещё раз', 'warn'); }
      else if (!quiet) toast('⚠ Не удалось синхронизировать: нет связи с сервером', 'warn');
      setState('err');
    } finally {
      busy = false;
      if (again) schedule(1500);
    }
  }

  function apply(newR, newMy, newCol) {
    applying = true;
    try {
      S.ratings = newR;
      const baseIds = new Set(S.movies.filter(m => !m.custom).map(m => m.id));
      S.movies = S.movies.filter(m => !m.custom).concat(newMy.filter(m => !baseIds.has(m.id))
        .map(m => ({ ...m, title: m.title || m.orig || m.id, genres: m.genres || [], actors: m.actors || [], custom: true })));
      S.colls = newCol;
      saveRatings(); saveCustom(); saveColls();
      if (typeof kinoraRefresh === 'function') kinoraRefresh();
    } finally { setTimeout(() => applying = false, 400); }   // saveRatings отложен на 200 мс
  }

  function schedule(ms = 4000) {
    if (!auth()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync(); }, ms);
  }

  function setState(s) {
    state = s;
    const el = document.querySelector('[data-sync-state]');
    if (el) el.innerHTML = stateText();
  }
  function stateText() {
    if (state === 'busy') return '🔄 Синхронизация…';
    if (state === 'err') return '⚠ Нет связи с сервером — изменения сохранены на устройстве и уйдут позже';
    const at = lastAt || ls.get('kc_sync_at');
    if (!at) return 'Ещё не синхронизировано';
    const min = Math.round((Date.now() - at) / 60000);
    return '✅ Синхронизировано ' + (min < 1 ? 'только что' : min < 60 ? `${min} мин назад` : new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }));
  }

  /* ---------- вход вне Telegram: через бота ---------- */
  function openOut(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
  }
  // незавершённый вход храним на устройстве: на iPhone страница часто перезагружается, пока вы в Telegram,
  // и без этого подтверждённый в боте вход терялся — приходилось входить снова и снова
  const PEND = 'kc_login_pending', PEND_MS = 14 * 60000;
  const pending = () => { const p = ls.get(PEND); return p && p.code && Date.now() - p.at < PEND_MS ? p : null; };
  let pollBusy = false;
  async function pollOnce() {
    const p = pending();
    if (!p) { stopPoll(); return; }
    if (pollBusy) return;
    pollBusy = true;
    let r;
    try { r = await post('login/poll', { code: p.code }); } catch { pollBusy = false; return; }
    pollBusy = false;
    if (r.gone) { ls.del(PEND); stopPoll(); refreshPanel(); return; }
    if (!r.ok) return;
    ls.del(PEND); stopPoll();
    ls.set('kc_auth', { token: r.token, name: r.name, uid: String(r.uid) });
    ls.del('kc_sync_base');   // первая синхронизация: оценки с устройства добавятся в аккаунт
    toast(`👋 Вы вошли как ${r.name}. Объединяю оценки…`);
    await sync();
    refreshPanel();
    if (state === 'ok') toast('✅ Готово: оценки с этого устройства сохранены в аккаунте');
  }
  function stopPoll() { clearInterval(loginPoll); loginPoll = null; }
  function startPoll() {
    if (loginPoll || !pending()) return;
    loginPoll = setInterval(pollOnce, 2000);
    pollOnce();
  }
  async function login(root) {
    let st;
    try { st = await post('login/start', {}); } catch { toast('⚠ Нет связи с сервером Kinora. Проверьте интернет', 'warn'); return; }
    ls.set(PEND, { code: st.code, link: st.link, at: Date.now() });
    openOut(st.link);
    const box = root.querySelector('.acc-box');
    if (box) box.innerHTML = waitHtml(st.link);
    wireWait(root);
    stopPoll(); startPoll();
  }
  function waitHtml(link) {
    return `<p class="s-note">Откроется Telegram — нажмите там <b>«Запустить»</b>, а потом <b>«Да, войти»</b> и вернитесь сюда. Если Telegram не открылся, откройте ссылку на телефоне или компьютере, где он есть:<br><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a></p>
      <p class="s-note">⏳ Жду подтверждения…</p><button class="btn" data-acc-cancel>Отмена</button>`;
  }
  function wireWait(root) {
    const cancel = root.querySelector('[data-acc-cancel]');
    if (cancel) cancel.onclick = () => { ls.del(PEND); stopPoll(); refreshPanel(); };
  }
  async function logout() {
    if (!confirm('Выйти из аккаунта?\nОценки останутся на этом устройстве, но перестанут синхронизироваться.')) return;
    const a = ls.get('kc_auth');
    try { if (a) await post('logout', { token: a.token }); } catch { }
    ls.del('kc_auth'); ls.del('kc_sync_base'); ls.del('kc_sync_at');
    refreshPanel();
  }

  let panelRoot = null;
  function refreshPanel() { if (panelRoot && panelRoot.isConnected) { const s = panelRoot.querySelector('.acc-sec'); if (s) { s.outerHTML = html(); wire(panelRoot); } } }
  function html() {
    const acc = account();
    let body;
    if (tgOn()) {
      body = `<p class="s-note">Вы в Kinora через Telegram как <b>${esc(acc.name)}</b>. Чтобы оценки были такими же в Kinora на компьютере и телефоне, нажмите там в настройках <b>«Войти через Telegram»</b>.</p>
        <p class="s-note" data-sync-state>${stateText()}</p><button class="btn" data-acc-sync>Синхронизировать сейчас</button>`;
    } else if (acc && acc.token) {
      body = `<p class="s-note">Вы вошли через Telegram как <b>${esc(acc.name)}</b>. Оценки, списки и коллекции одинаковы в Kinora на всех устройствах, где вы вошли, и в Telegram.</p>
        <p class="s-note" data-sync-state>${stateText()}</p>
        <div class="bk-acts"><button class="btn" data-acc-sync>Синхронизировать сейчас</button><button class="btn ghost" data-acc-out>Выйти</button></div>`;
    } else if (pending()) {
      body = waitHtml(pending().link || '');
    } else {
      body = `<p class="s-note">Войдите через Telegram — оценки, списки и коллекции станут одинаковыми в Kinora на компьютере, телефоне и в Telegram. <b>Оценки, которые уже есть на этом устройстве, сохранятся</b> и добавятся в аккаунт.</p>
        <button class="btn accent" data-acc-in>✈ Войти через Telegram</button>`;
    }
    return `<section class="s-sec acc-sec"><h4>Аккаунт</h4><div class="acc-box">${body}</div></section>`;
  }
  function wire(root) {
    panelRoot = root;
    const q = s => root.querySelector(s);
    if (q('[data-acc-in]')) q('[data-acc-in]').onclick = () => login(root);
    if (q('[data-acc-out]')) q('[data-acc-out]').onclick = logout;
    if (q('[data-acc-sync]')) q('[data-acc-sync]').onclick = () => sync(false);
    wireWait(root);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !tgOn() && pending()) { stopPoll(); startPoll(); }
    if (!auth()) return;
    if (document.visibilityState === 'hidden') { if (timer) { clearTimeout(timer); timer = null; sync(); } }
    else if (Date.now() - lastAt > 60000) schedule(500);
  });

  // вернулись из Telegram (на iPhone страница могла восстановиться из кэша или получить фокус без перезагрузки)
  ['pageshow', 'focus'].forEach(ev => window.addEventListener(ev, () => { if (!tgOn() && !auth() && pending()) { stopPoll(); startPoll(); } }));

  window.KinoraSync = {
    html, wire,
    // app.js вызывает после каждого сохранения оценок, своих фильмов и коллекций
    dirty() { if (!applying) schedule(); },
    // после загрузки данных при запуске
    start() { lastAt = ls.get('kc_sync_at') || 0; if (auth()) sync(); else if (!tgOn() && pending()) startPoll(); },
    get on() { return !!auth(); },
  };
})();
