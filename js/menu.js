/* ============================================================
   menu.js – Left-panel: Travel History + Wanderer tabs
   ============================================================ */

const MenuManager = (() => {
  let isOpen    = false;
  let activeTab = 'history';

  /* ── Open / Close / Toggle ───────────────────────────────── */
  function open() {
    isOpen = true;
    document.getElementById('leftPanel').classList.add('open');
    document.getElementById('leftOverlay').classList.add('show');
    document.getElementById('menuToggle').classList.add('open');
    renderActive();
  }

  function close() {
    isOpen = false;
    document.getElementById('leftPanel').classList.remove('open');
    document.getElementById('leftOverlay').classList.remove('show');
    document.getElementById('menuToggle').classList.remove('open');
  }

  function toggle() { isOpen ? close() : open(); }

  /* ── Tab switching ───────────────────────────────────────── */
  function switchTab(tab) {
    activeTab = tab;

    document.querySelectorAll('.lp-tab').forEach(el =>
      el.classList.toggle('active', el.dataset.tab === tab)
    );
    document.querySelectorAll('.lp-pane').forEach(el =>
      el.classList.toggle('active', el.id === 'pane' + cap(tab))
    );

    renderActive();
  }

  function renderActive() {
    if (activeTab === 'history') renderHistory();
    else renderWanderer();
  }

  /* ── History tab ─────────────────────────────────────────── */
  function renderHistory() {
    const container = document.getElementById('paneHistory');
    const history   = VisitHistory.getAll();

    if (!history.length) {
      container.innerHTML = `
        <div class="lp-empty">
          <div class="lp-empty-icon">🗺️</div>
          <div class="lp-empty-text">${I18n.t('lp.no_history')}</div>
        </div>`;
      return;
    }

    /* Group by date */
    const groups = {};
    history.forEach(entry => {
      const key = dateLabel(entry.visitedAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });

    let html = '';
    for (const [label, entries] of Object.entries(groups)) {
      html += `<div class="lp-section-title">${label}</div>`;
      entries.forEach(entry => {
        html += `
          <div class="history-item">
            <div class="history-pin-dot">📍</div>
            <div class="history-body">
              <div class="history-name">${esc(entry.pinName)}</div>
              <div class="history-time">${timeLabel(entry.visitedAt)}</div>
            </div>
            <button class="history-play" data-pin-id="${entry.pinId}" title="ฟังเสียงซ้ำ">🔊</button>
          </div>`;
      });
    }

    container.innerHTML = html;

    /* Bind play buttons */
    container.querySelectorAll('.history-play').forEach(btn => {
      btn.addEventListener('click', () => replayAudio(btn));
    });
  }

  async function replayAudio(btn) {
    const pinId = btn.dataset.pinId;
    btn.disabled = true;
    btn.textContent = '⏳';

    try {
      const blob = await VoiceMapDB.getAudio(pinId);
      if (!blob) {
        btn.textContent = '🚫';
        setTimeout(() => { btn.textContent = '🔊'; btn.disabled = false; }, 2000);
        return;
      }
      btn.textContent = '▶️';
      await AudioManager.playBlob(blob);
    } catch {
      btn.textContent = '🚫';
      setTimeout(() => { btn.textContent = '🔊'; }, 2000);
    } finally {
      setTimeout(() => { btn.textContent = '🔊'; btn.disabled = false; }, 500);
    }
  }

  /* ── Level definitions (based on total visit count) ─────── */
  const LEVELS = [
    { lv: 1, icon: '🥾', key: 'level.1', min: 0,  next: 5  },
    { lv: 2, icon: '🚶', key: 'level.2', min: 5,  next: 10 },
    { lv: 3, icon: '🧭', key: 'level.3', min: 10, next: 20 },
    { lv: 4, icon: '🏆', key: 'level.4', min: 20, next: null },
  ];

  function getLevelInfo(n) {
    let cur = LEVELS[0];
    for (const lv of LEVELS) {
      if (n >= lv.min) cur = lv;
      else break;
    }
    return cur;
  }

  function renderLevelCard(totalVisits) {
    const lv    = getLevelInfo(totalVisits);
    const isMax = lv.next === null;

    let progressBlock;
    if (!isMax) {
      const done      = totalVisits - lv.min;
      const need      = lv.next - lv.min;
      const pct       = Math.min(100, Math.round((done / need) * 100));
      const remaining = lv.next - totalVisits;
      progressBlock = `
        <div class="lv-progress-row">
          <div class="lv-progress-track">
            <div class="lv-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="lv-progress-label">${done}/${need}</span>
        </div>
        <div class="lv-next-hint">${I18n.t('lp.next_level', remaining)}</div>`;
    } else {
      progressBlock = `<div class="lv-max-badge">${I18n.t('lp.max_level')}</div>`;
    }

    return `
      <div class="level-card${isMax ? ' level-card-max' : ''}">
        <div class="lv-top">
          <div class="lv-icon">${lv.icon}</div>
          <div class="lv-info">
            <div class="lv-num">${I18n.t('lp.level', lv.lv)}</div>
            <div class="lv-title">${I18n.t(lv.key)}</div>
          </div>
          <div class="lv-visits-badge">${I18n.t('lp.visits_badge', totalVisits)}</div>
        </div>
        ${progressBlock}
      </div>`;
  }

  /* ── Wanderer tab ────────────────────────────────────────── */
  function renderWanderer() {
    const container   = document.getElementById('paneWanderer');
    const allPins     = PinStorage.getAll();
    const allHistory  = VisitHistory.getAll();
    const visited     = VisitHistory.visitedIds();
    const total       = allPins.length;
    const doneCount   = allPins.filter(p => visited.has(p.id)).length;
    const pct         = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    const rank        = getWandererRank(doneCount, pct);
    const totalVisits = allHistory.length;

    const levelHtml = renderLevelCard(totalVisits);

    if (total === 0) {
      container.innerHTML = `
        ${levelHtml}
        <div class="lp-empty">
          <div class="lp-empty-icon">🌍</div>
          <div class="lp-empty-text">${I18n.t('lp.no_pins')}</div>
        </div>`;
      return;
    }

    const checklist = allPins.map(p => {
      const done = visited.has(p.id);
      return `
        <div class="checklist-item ${done ? 'done' : 'todo'}">
          <span class="check-icon">${done ? '✅' : '⬜'}</span>
          <span class="check-name">${esc(p.name)}</span>
        </div>`;
    }).join('');

    container.innerHTML = `
      ${levelHtml}

      <div class="wanderer-hero">
        <div class="wanderer-medal">${rank.icon}</div>
        <div class="wanderer-rank">${rank.title}</div>
        <div class="wanderer-count">${I18n.t('lp.unique_pins', doneCount, total)}</div>
      </div>

      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="progress-pct">${pct}%</div>
      </div>

      ${renderRankScroll(doneCount, pct)}

      <div class="checklist-label">${I18n.t('lp.all_pins')}</div>
      ${checklist}`;

    /* Auto-scroll rank strip so active card is centered */
    requestAnimationFrame(() => {
      const strip  = document.getElementById('rankScroll');
      const active = strip?.querySelector('.rank-card-active');
      if (strip && active) {
        const offset = active.offsetLeft - strip.offsetWidth / 2 + active.offsetWidth / 2;
        strip.scrollTo({ left: offset, behavior: 'smooth' });
      }
    });
  }

  /* Chick icons – same baby chick, progressively more travel gear */
  const CHICK_ICONS = [
    /* 1 – หลุดจากไข่ ไม่มีอุปกรณ์ */
    `<div class="chick-wrap"><span class="chick-main">🐣</span></div>`,
    /* 2 – ยืนได้แล้ว มีรองเท้า */
    `<div class="chick-wrap">
       <span class="chick-main">🐥</span>
       <span class="chick-gear g-bot">👟</span>
     </div>`,
    /* 3 – มีเป้สะพายหลัง */
    `<div class="chick-wrap">
       <span class="chick-main">🐥</span>
       <span class="chick-gear g-right">🎒</span>
       <span class="chick-gear g-bot">👟</span>
     </div>`,
    /* 4 – มีแผนที่ */
    `<div class="chick-wrap">
       <span class="chick-main">🐥</span>
       <span class="chick-gear g-right">🎒</span>
       <span class="chick-gear g-left">🗺️</span>
       <span class="chick-gear g-bot">👟</span>
     </div>`,
    /* 5 – มีกล้องส่องทางไกล */
    `<div class="chick-wrap">
       <span class="chick-main">🐥</span>
       <span class="chick-gear g-top-right">🔭</span>
       <span class="chick-gear g-right">🎒</span>
       <span class="chick-gear g-left">🗺️</span>
       <span class="chick-gear g-bot">👟</span>
     </div>`,
    /* 6 – ครบชุด + มงกุฎ */
    `<div class="chick-wrap">
       <span class="chick-main">🐥</span>
       <span class="chick-gear g-crown">👑</span>
       <span class="chick-gear g-top-right">🔭</span>
       <span class="chick-gear g-right">🎒</span>
       <span class="chick-gear g-left">🗺️</span>
       <span class="chick-gear g-bot">👟</span>
     </div>`,
  ];

  /* All rank definitions for the scroll showcase */
  const ALL_RANKS = [
    { id: 'beginner',   icon: CHICK_ICONS[0], key: 'rank.beginner',  sub: { th: 'ผู้เริ่มต้น',        en: 'Beginner'   }, check: (d,p) => d === 0 },
    { id: 'traveler',   icon: CHICK_ICONS[1], key: 'rank.traveler',   sub: { th: 'นักเดินทาง',          en: 'Traveler'   }, check: (d,p) => d > 0 && p < 25 },
    { id: 'explorer',   icon: CHICK_ICONS[2], key: 'rank.explorer',   sub: { th: 'ผู้สำรวจ',            en: 'Explorer'   }, check: (d,p) => p >= 25 && p < 50 },
    { id: 'adventurer', icon: CHICK_ICONS[3], key: 'rank.adventurer', sub: { th: 'นักผจญภัย',           en: 'Adventurer' }, check: (d,p) => p >= 50 && p < 75 },
    { id: 'wanderer',   icon: CHICK_ICONS[4], key: 'rank.wanderer',   sub: { th: 'ผู้พเนจร',            en: 'Wanderer'   }, check: (d,p) => p >= 75 && p < 100 },
    { id: 'legend',     icon: CHICK_ICONS[5], key: 'rank.legend',     sub: { th: 'ผู้พเนจรผู้ยิ่งใหญ่', en: 'Legend'    }, check: (d,p) => p === 100 },
  ];

  function renderRankScroll(doneCount, pct) {
    const lang = I18n.getLang();
    const cards = ALL_RANKS.map(r => {
      const isActive = r.check(doneCount, pct);
      return `
        <div class="rank-card${isActive ? ' rank-card-active' : ''}" data-rank-id="${r.id}">
          <div class="rank-card-icon${isActive ? ' rank-icon-anim' : ''}">${r.icon}</div>
          <div class="rank-card-name">${r.sub[lang] ?? r.sub.th}</div>
        </div>`;
    }).join('');
    return `<div class="rank-scroll" id="rankScroll">${cards}</div>`;
  }

  /* Rank definitions (based on % of unique pins visited) */
  function getWandererRank(done, pct) {
    const r = ALL_RANKS.find(r => r.check(done, pct)) ?? ALL_RANKS[ALL_RANKS.length - 1];
    const lang = I18n.getLang();
    return { icon: r.icon, title: r.sub[lang] ?? r.sub.th };
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    document.getElementById('menuToggle').addEventListener('click', toggle);
    document.getElementById('leftPanelClose').addEventListener('click', close);
    document.getElementById('leftOverlay').addEventListener('click', close);

    document.querySelectorAll('.lp-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    /* Close panel when Escape is pressed */
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function dateLabel(ts) {
    const d   = new Date(ts);
    const now = new Date();
    if (isSameDay(d, now))          return I18n.t('time.today');
    if (isSameDay(d, yesterday()))  return I18n.t('time.yesterday');
    const locale = I18n.getLang() === 'en' ? 'en-US' : 'th-TH';
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function timeLabel(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000)       return I18n.t('time.just_now');
    if (diff < 3_600_000)    return I18n.t('time.minutes_ago', Math.floor(diff / 60_000));
    if (diff < 86_400_000)   return I18n.t('time.hours_ago',   Math.floor(diff / 3_600_000));
    const locale = I18n.getLang() === 'en' ? 'en-US' : 'th-TH';
    return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }

  /* Public API used by app.js after a pin is triggered */
  function onVisit() {
    if (isOpen) renderActive();
  }

  return { init, open, close, toggle, onVisit };
})();
