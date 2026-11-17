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
  // kc_api_tg — только для проверки на своём компьютере
  const API = location.hostname === 'kinora.murcon.pw' || (() => { try { return localStorage.getItem('kc_api_tg'); } catch { } })() ? '/api/' : '';
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

  /* ---------- кто открыл приложение: Telegram передаёт подписанные данные в адресе при запуске ----------
     Запоминаем их сразу — даже если SDK загрузится медленно или не загрузится, вход по Telegram не теряется */
  const hashInit = (() => {
    try {
      const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      const q = new URLSearchParams(location.search || '');
      const raw = h.get('tgWebAppData') || q.get('tgWebAppData') || '';
      if (raw) { try { sessionStorage.setItem('kc_tg_init', raw); } catch { } return raw; }
      try { return sessionStorage.getItem('kc_tg_init') || ''; } catch { return ''; }
    } catch { return ''; }
  })();
  const hashUser = (() => { try { return JSON.parse(new URLSearchParams(hashInit).get('user') || 'null'); } catch { return null; } })();

  /* ---------- загрузка SDK Telegram ----------
     Сначала своя копия с нашего сервера (telegram.org бывает медленным или недоступным), потом — с telegram.org */
  const sdk = new Promise(res => {
    const done = () => res(window.Telegram && window.Telegram.WebApp);
    const load = (src, next) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = done;
      s.onerror = next;
      document.head.appendChild(s);
    };
    load('telegram-web-app.js', () => load('https://telegram.org/js/telegram-web-app.js', () => res(null)));
    setTimeout(done, 8000);
  });

  /* ---------- облако → устройство ---------- */
  async function pull() {
    const user = (wa.initDataUnsafe && wa.initDataUnsafe.user) || hashUser;
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
    document.documentElement.classList.add('tg');
    // нижняя панель: при прокрутке вниз сжимается, при прокрутке вверх — раскрывается
    let lastY = scrollY;
    const root = document.documentElement;
    addEventListener('scroll', () => {
      const y = scrollY, dy = y - lastY;
      if (Math.abs(dy) < 8) return;
      lastY = y;
      const want = dy > 0 && y > 140;
      if (root.classList.contains('tg-compact') !== want) root.classList.toggle('tg-compact', want);
    }, { passive: true });
    try { wa.expand(); } catch { }
    if (wa.isVersionAtLeast && wa.isVersionAtLeast('7.7')) try { wa.disableVerticalSwipes(); } catch { }
    // тема: пока её не выбрали в Kinora — как в Telegram
    if (ls.get('kc_theme') == null && wa.colorScheme) document.documentElement.dataset.theme = wa.colorScheme === 'light' ? 'light' : 'dark';
    const paint = () => {
      const c = document.documentElement.dataset.theme === 'light' ? '#f4f5fb' : '#09090f';
      try { wa.setHeaderColor(c); wa.setBackgroundColor(c); if (wa.setBottomBarColor) wa.setBottomBarColor(c); } catch { }
    };
    paint();
    // во весь экран сверху кнопки Telegram («Закрыть», «⋯») и вырез экрана — приложение отступает на их высоту
    const insets = () => {
      const a = wa.safeAreaInset, c = wa.contentSafeAreaInset;
      if (!a && !c) return;
      const st = document.documentElement.style;
      st.setProperty('--sat', ((a && a.top) || 0) + ((c && c.top) || 0) + 'px');
      st.setProperty('--sab', ((a && a.bottom) || 0) + ((c && c.bottom) || 0) + 'px');
    };
    insets();
    ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'].forEach(ev => { try { wa.onEvent(ev, insets); } catch { } });
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

  /* =====================================================================
     Возможности только для Telegram. app.js вызывает их, лишь когда есть window.KinoraTG,
     поэтому Kinora.exe, APK и обычный сайт они не затрагивают. Функции app.js (S, openDetail,
     openGames, gBody, posterHTML, toast…) берутся по имени в момент вызова.
     ===================================================================== */
  let st = null;   // ответ сервера: { sub, cr, bot, notify, inbox }
  const hap = (t = 'light') => { try { wa.HapticFeedback.impactOccurred(t); } catch { } };
  const hapOk = () => { try { wa.HapticFeedback.notificationOccurred('success'); } catch { } };
  const e$ = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const subOn = () => !!(st && st.sub > Date.now());
  const botLink = p => st && st.bot ? `https://t.me/${st.bot}${p ? '?' + p : ''}` : '';
  async function status() {
    if (!API || !KinoraTG.initData) return null;
    try { st = await KinoraTG.api('status'); } catch { }
    return st;
  }

  /* ---------- Kinora+: эксклюзивные цвета ---------- */
  const PREM_ACC = [
    ['aurora', 'Аврора ⭐', { a: '#5eead4', a2: '#a7f3d0', g: ['#22d3ee', '#a78bfa', '#34d399'], rgb: '94, 234, 212', la: '#0f9488', la2: '#0b766d' }],
    ['neon', 'Неон ⭐', { a: '#e879f9', a2: '#f5b0fc', g: ['#f0abfc', '#e879f9', '#22d3ee'], rgb: '232, 121, 249', la: '#b92fc9', la2: '#9418a3' }],
    ['platinum', 'Платина ⭐', { a: '#c7d2fe', a2: '#e0e7ff', g: ['#e2e8f0', '#94a3b8', '#c7d2fe'], rgb: '199, 210, 254', la: '#4f5d86', la2: '#3a4566' }],
  ];
  function premAccents() {
    try {
      PREM_ACC.forEach(p => { if (!ACCENTS.some(a => a[0] === p[0])) ACCENTS.push(p); });
      const cur = load('kc_accent', 'violet');
      if (PREM_ACC.some(p => p[0] === cur)) applyAccent(subOn() ? cur : 'violet');
    } catch { }
  }

  /* ---------- открытие по ссылке из бота: ?open=<фильм>, ?room=<код>|new, ?inbox=1 ---------- */
  const qp = new URLSearchParams(location.search);
  async function started() {
    await status();
    premAccents();
    const sp = (wa && wa.initDataUnsafe && wa.initDataUnsafe.start_param) || '';
    const openId = qp.get('open') || (sp.startsWith('m_') ? sp.slice(2) : '');
    const room = qp.get('room') || (sp.startsWith('r_') ? sp.slice(2) : '');
    if (openId) { const m = S.movies.find(x => x.id === openId); if (m) { S.list = [m]; openDetail(m); } }
    else if (room && API) { openGames(); together(room); }
    if (st && st.inbox) inboxImport();
    if (st && st.notify && (st.notify.daily || st.notify.remind)) notifyLists();
  }

  /* ---------- файл копии, присланный боту → в приложение ---------- */
  async function inboxImport() {
    let r;
    try { r = await KinoraTG.api('inbox'); } catch { return; }
    if (!r || !r.data) return;
    let d;
    try { d = JSON.parse(r.data); } catch { d = null; }
    const done = await importBackupData(d);
    if (done !== null) KinoraTG.api('inbox', { done: 1 }).catch(() => { });
  }

  /* ---------- уведомления от бота: фильм дня и «Смотреть позже» ---------- */
  let notifyT = null;
  function notifyLists() {
    clearTimeout(notifyT);
    notifyT = setTimeout(() => {
      const watch = [], seen = [];
      for (const [id, r] of Object.entries(S.ratings || {})) {
        if (r.watch) watch.push(id);
        if (overall(r) >= 0 || r.done || (r.views || []).length) seen.push(id);
      }
      KinoraTG.api('notify', { watch, seen }).catch(() => { });
    }, 3000);
  }
  async function setNotify(k, on) {
    if (on && wa.requestWriteAccess && wa.isVersionAtLeast('6.9')) {
      const ok = await new Promise(res => { try { wa.requestWriteAccess(res); } catch { res(true); } });
      if (!ok) { toast('Без разрешения бот не сможет писать вам'); return false; }
    }
    try { const r = await KinoraTG.api('notify', { [k]: on }); st = { ...(st || {}), notify: r.notify }; } catch { toast('⚠ Нет связи с сервером', 'warn'); return false; }
    if (on) notifyLists();
    return true;
  }

  /* ---------- раздел «Telegram» в настройках ---------- */
  function settingsHTML() {
    if (!API) return '';
    const n = (st && st.notify) || {};
    const sw = (k, on, t, d) => `<label class="tg-sw"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" data-tg-n="${k}" ${on ? 'checked' : ''}><i></i></label>`;
    return `<section class="s-sec tg-sec"><h4>Kinora+</h4>
      ${subOn() ? `<p class="s-note">⭐ Подписка активна до <b>${new Date(st.sub).toLocaleDateString('ru-RU')}</b>: викторины без лимита, сколько угодно комнат «Смотрим вместе» и цвета Аврора, Неон и Платина.</p>`
        : `<p class="s-note">Викторины без дневного лимита, сколько угодно комнат «Смотрим вместе» и эксклюзивные цвета оформления.</p><button class="btn accent" data-tg="plus">⭐ Подключить Kinora+</button>`}
    </section>
    <section class="s-sec tg-sec"><h4>Сообщения от бота</h4>
      ${sw('daily', n.daily, '☀️ Фильм дня', 'Каждое утро в 10:00 — хороший фильм, который вы ещё не оценили')}
      ${sw('remind', n.remind, '🍿 Напоминания', 'По пятницам — фильмы из вашего списка «Смотреть позже»')}
    </section>
    <section class="s-sec tg-sec"><h4>Чат с ботом</h4>
      <div class="bk-acts"><button class="btn" data-tg="backup">💾 Прислать копию оценок в чат</button>${st && st.bot ? '<button class="btn" data-tg="group">❓ Викторина в группе с друзьями</button>' : ''}</div>
      <p class="s-note">Файл копии из чата открывается в Kinora на компьютере и телефоне («Загрузить из файла»). Чтобы загрузить файл сюда — просто перешлите его боту.</p>
    </section>`;
  }
  function wireSettings(root) {
    root.querySelectorAll('[data-tg-n]').forEach(i => i.onchange = async () => {
      const ok = await setNotify(i.dataset.tgN, i.checked);
      if (!ok) i.checked = !i.checked;
      else toast(i.checked ? (i.dataset.tgN === 'daily' ? '☀️ Фильм дня будет приходить в чат с ботом' : '🍿 Напомню по пятницам') : 'Выключено');
    });
    const q = s => root.querySelector(s);
    if (q('[data-tg="plus"]')) q('[data-tg="plus"]').onclick = () => { closeSettings(); openGames(); paywall(null); };
    if (q('[data-tg="group"]')) q('[data-tg="group"]').onclick = () => wa.openTelegramLink(botLink('startgroup=quiz'));
    if (q('[data-tg="backup"]')) q('[data-tg="backup"]').onclick = async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try { await KinoraTG.api('backup', { data: backupData() }); toast('💾 Копия отправлена в чат с ботом'); backupDone(); }
      catch { toast('⚠ Не удалось отправить. Напишите боту /start и попробуйте ещё раз', 'warn'); }
      b.disabled = false;
    };
    // эксклюзивные цвета без подписки — предложить Kinora+
    root.querySelectorAll('[data-acc]').forEach(b => {
      if (!PREM_ACC.some(p => p[0] === b.dataset.acc) || subOn()) return;
      b.classList.add('tg-lock');
      b.addEventListener('click', ev => {
        ev.stopImmediatePropagation(); ev.preventDefault();
        toast('⭐ Этот цвет — для Kinora+');
      }, true);
    });
  }

  /* ---------- «Отправить в чат» в окне карточки ---------- */
  function onShare(root, m, canvas) {
    if (!API || !wa || !wa.isVersionAtLeast) return;
    const foot = root.querySelector('.r-foot');
    if (!foot) return;
    const b = document.createElement('button');
    b.className = 'btn grad'; b.textContent = '✈ Отправить в чат';
    foot.prepend(b);
    b.onclick = async () => {
      b.disabled = true;
      try {
        if (wa.isVersionAtLeast('8.0') && wa.shareMessage) {
          const r = S.ratings[m.id], score = r ? overall(r) : -1;
          const img = canvas.toDataURL('image/jpeg', .86);
          const { msg } = await KinoraTG.api('share', { id: m.id, img, score: score >= 0 ? score : undefined });
          wa.shareMessage(msg, ok => { if (ok) { hapOk(); toast('✈ Отправлено'); } });
        } else wa.switchInlineQuery(m.title, ['users', 'groups', 'channels']);
      } catch {
        try { wa.switchInlineQuery(m.title, ['users', 'groups', 'channels']); } catch { toast('⚠ Не получилось — обновите Telegram', 'warn'); }
      }
      b.disabled = false;
    };
  }

  /* ---------- плитки в окне игр ---------- */
  function hubCards() {
    if (!API) return '';
    return `<button class="g-card" data-g="together" style="--c1:#ff7eb3;--c2:#ff758c"><span class="g-e">💞</span><b>Смотрим вместе</b>
        <span>Позовите друзей и свайпайте фильмы — когда всем понравится один, бот пришлёт совпадение</span>
        <small>${subOn() ? 'Kinora+ — без ограничений' : `Бесплатно — ${(st && st.freeRooms) || 3} комнаты в день`}</small></button>
      ${st && st.bot ? `<button class="g-card" data-g="tggroup" style="--c1:#3ec7ff;--c2:#2a8cff"><span class="g-e">👥</span><b>Викторина в группе</b>
        <span>Добавьте бота в чат с друзьями и напишите /quiz — вопросы про кино, очки и таблица лидеров</span><small>Бесплатно</small></button>` : ''}`;
  }
  function hubClick(g) {
    if (g === 'together') { together(); return true; }
    if (g === 'tggroup') { wa.openTelegramLink(botLink('startgroup=quiz')); return true; }
    return false;
  }

  /* ---------- «Смотрим вместе» ---------- */
  let room = null, roomT = null;
  const GENRES = ['', 'Комедия', 'Драма', 'Фантастика', 'Триллер', 'Боевик', 'Мелодрама', 'Ужасы', 'Мультфильм', 'Детектив'];
  const live = () => gamesM.classList.contains('open') && document.querySelector('.tg-room');
  function stopRoom() { clearInterval(roomT); roomT = null; }

  async function together(code) {
    stopRoom();
    const body = gBody();
    if (!body) return;
    if (code && code !== 'new') return joinRoom(code);
    const last = load('kc_room', null);
    let genre = '';
    body.innerHTML = `<div class="tg-room tg-intro"><div class="t-crown">💞</div><h2>Смотрим вместе</h2>
      <div class="r-sub">Создайте комнату и позовите друзей. Каждый свайпает фильмы: ❤ — хочу, ✕ — нет. Когда фильм нравится всем, бот присылает совпадение.</div>
      <h4>Жанр</h4><div class="tg-chips">${GENRES.map(g => `<button data-gen="${e$(g)}" class="${g ? '' : 'on'}">${g || 'Любой'}</button>`).join('')}</div>
      <div class="r-foot"><button class="btn ghost" data-back>← Все игры</button>${last ? '<button class="btn" data-last>Вернуться в комнату</button>' : ''}<button class="btn grad" data-new>Создать комнату</button></div></div>`;
    body.querySelectorAll('[data-gen]').forEach(b => b.onclick = () => { genre = b.dataset.gen; body.querySelectorAll('[data-gen]').forEach(x => x.classList.toggle('on', x === b)); });
    body.querySelector('[data-back]').onclick = gamesHub;
    if (last) body.querySelector('[data-last]').onclick = () => joinRoom(last);
    body.querySelector('[data-new]').onclick = async e => {
      const b = e.currentTarget;
      b.disabled = true;
      let r;
      try { r = await KinoraTG.api('room/new', { genre }); } catch { toast('⚠ Нет связи с сервером', 'warn'); b.disabled = false; return; }
      if (r.limit) { paywall(null); toast(`Бесплатно — ${(st && st.freeRooms) || 3} комнаты в день. С Kinora+ без ограничений`); return; }
      if (!r.ok) { b.disabled = false; return; }
      keep('kc_room', r.code);
      showRoom(r, true);
    };
  }
  async function joinRoom(code) {
    let r;
    try { r = await KinoraTG.api('room/join', { code }); } catch { toast('⚠ Нет связи с сервером', 'warn'); return; }
    if (!r.ok) {
      toast(r.full ? 'В комнате уже 10 человек' : 'Эта комната уже закрыта — создайте новую');
      if (load('kc_room', null) === code) keep('kc_room', null);
      together(); return;
    }
    keep('kc_room', code);
    showRoom(r, false);
  }
  function invite() {
    const t = 'Давай выберем фильм вместе в Kinora! Свайпай фильмы — совпадения пришлёт бот 🍿';
    wa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(room.link)}&text=${encodeURIComponent(t)}`);
  }
  function showRoom(r, fresh) {
    room = { ...r, seen: new Set(r.done), known: new Set(r.matches) };
    const body = gBody();
    body.innerHTML = `<div class="tg-room"><div class="tg-top"><div class="tg-mem"></div><button class="btn sm grad" data-inv>＋ Позвать</button></div>
      <div class="tg-stage"></div>
      <div class="tg-acts"><button class="tg-no" data-v="0" title="Не хочу">✕</button><button class="tg-yes" data-v="1" title="Хочу посмотреть">❤</button></div>
      <button class="tg-mt" data-mt></button>
      <div class="r-foot"><button class="btn ghost" data-back>← Все игры</button></div></div>`;
    body.querySelector('[data-inv]').onclick = invite;
    body.querySelector('[data-back]').onclick = () => { stopRoom(); gamesHub(); };
    body.querySelector('[data-mt]').onclick = showMatches;
    body.querySelectorAll('[data-v]').forEach(b => b.onclick = () => vote(b.dataset.v === '1'));
    roomHead(); nextCard();
    if (fresh && r.members.length < 2) setTimeout(invite, 400);
    roomT = setInterval(async () => {
      if (!live()) { stopRoom(); return; }
      try { const s = await KinoraTG.api('room/state', { code: room.code }); if (s.ok) { room.members = s.members; newMatches(s.matches); roomHead(); } } catch { }
    }, 4000);
  }
  function roomHead() {
    const body = gBody(); if (!body || !room) return;
    const mem = body.querySelector('.tg-mem');
    if (mem) mem.innerHTML = room.members.map(x => `<span class="${x.me ? 'me' : ''}" title="Проголосовано: ${x.n}">${e$(x.me ? 'Вы' : x.name)}<small>${x.n}</small></span>`).join('')
      + (room.members.length < 2 ? '<em>Ждём друзей — позовите их</em>' : '');
    const mt = body.querySelector('[data-mt]');
    if (mt) { const n = room.known.size; mt.textContent = n ? `🎉 Совпадения: ${n} — посмотреть` : 'Совпадений пока нет'; mt.disabled = !n; }
  }
  function newMatches(list) {
    let fresh = 0, last = null;
    list.forEach(id => { if (!room.known.has(id)) { room.known.add(id); fresh++; last = id; } });
    if (fresh) { hapOk(); const m = S.movies.find(x => x.id === last); toast(`🎉 Совпадение: ${m ? m.title : 'фильм'}!`); }
  }
  function cur() { return room && room.deck.find(id => !room.seen.has(id) && S.movies.some(m => m.id === id)); }
  function nextCard() {
    const stage = gBody() && gBody().querySelector('.tg-stage');
    if (!stage) return;
    const id = cur();
    gBody().querySelectorAll('[data-v]').forEach(b => b.disabled = !id);
    if (!id) {
      stage.innerHTML = `<div class="tg-end"><b>Фильмы закончились 🎬</b><span>Совпадения появятся, когда друзья тоже проголосуют.</span><button class="btn grad" data-again>Новая комната</button></div>`;
      stage.querySelector('[data-again]').onclick = () => together('new');
      return;
    }
    const m = S.movies.find(x => x.id === id);
    stage.innerHTML = `<div class="tg-card"><div class="tg-p">${posterHTML(m, false)}</div><div class="tg-i"><b>${e$(m.title)}</b>
      <span>${[m.year, (m.genres || []).slice(0, 2).join(', '), m.imdb ? 'IMDb ' + m.imdb : ''].filter(Boolean).join(' · ')}</span><p>${e$(m.desc || '')}</p></div>
      <i class="tg-stamp yes">ХОЧУ</i><i class="tg-stamp no">НЕТ</i></div>`;
    drag(stage.querySelector('.tg-card'));
  }
  function drag(card) {
    let x0 = null, dx = 0;
    card.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
    card.addEventListener('pointermove', e => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      card.style.setProperty('--y', Math.max(0, Math.min(1, dx / 90)));
      card.style.setProperty('--n', Math.max(0, Math.min(1, -dx / 90)));
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null; card.style.transition = '';
      if (Math.abs(dx) > 90) vote(dx > 0);
      else { card.style.transform = ''; card.style.setProperty('--y', 0); card.style.setProperty('--n', 0); }
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  }
  async function vote(love) {
    const id = cur();
    if (!id) return;
    hap(love ? 'medium' : 'light');
    room.seen.add(id);
    const card = gBody().querySelector('.tg-card');
    if (card) { card.style.transition = 'transform .35s, opacity .35s'; card.style.transform = `translateX(${love ? 120 : -120}%) rotate(${love ? 18 : -18}deg)`; card.style.opacity = 0; }
    const me = room.members.find(x => x.me); if (me) me.n++;
    setTimeout(() => { nextCard(); roomHead(); }, 260);
    try {
      const r = await KinoraTG.api('room/swipe', { code: room.code, id, love });
      if (r.match) newMatches([...room.known, id]);
      roomHead();
    } catch { }
  }
  function showMatches() {
    const ms = [...room.known].map(id => S.movies.find(m => m.id === id)).filter(Boolean);
    const stage = gBody().querySelector('.tg-stage');
    stage.innerHTML = `<div class="tg-ml"><h4>Понравилось всем</h4><div class="g-ch-row">${ms.map(m => `<button data-id="${e$(m.id)}" title="${e$(m.title)}">${posterHTML(m, false)}</button>`).join('')}</div>
      <button class="btn" data-goon>Свайпать дальше</button></div>`;
    stage.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { stopRoom(); gameOpenFilm(S.movies.find(m => m.id === b.dataset.id)); });
    stage.querySelector('[data-goon]').onclick = nextCard;
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
      if (k === 'kc_ratings' && st && st.notify && (st.notify.daily || st.notify.remind)) notifyLists();
      if (!(k in SYNC)) return;
      mt[k] = Date.now(); saveMt();
      schedule(k);
    },
    // окна поверх каталога открыты — показываем «Назад»
    back(show) {
      if (!wa || !wa.BackButton) return;
      show ? wa.BackButton.show() : wa.BackButton.hide();
    },
    get user() { return (wa && wa.initDataUnsafe && wa.initDataUnsafe.user) || hashUser; },
    // оплата: лимит игр включается, только когда сервер оплаты доступен
    get payOn() { return !!(API && wa && wa.initData && wa.openInvoice && wa.isVersionAtLeast && wa.isVersionAtLeast('6.1')); },
    async api(path, extra = {}) {
      const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: KinoraTG.initData, ...extra }) });
      const j = await r.json();
      if (!r.ok && !('cr' in j)) throw new Error(j.error || r.status);
      return j;
    },
    get initData() { return (wa && wa.initData) || hashInit; },
    // синхронизация оценок с Kinora на компьютере и телефоне (sync.js) — через свой сервер
    get syncOn() { return !!(API && KinoraTG.initData); },
    get sub() { return subOn(); },
    started, settingsHTML, wireSettings, onShare, hubCards, hubClick, together,
    // открывает окно оплаты Telegram; результат — 'paid', 'cancelled', 'failed' или 'pending'
    async buy(product) {
      const { link } = await this.api('invoice', { product });
      if (!link) return 'failed';
      return new Promise(res => wa.openInvoice(link, st => res(st)));
    },
  };
})();
