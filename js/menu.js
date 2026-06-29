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

  /* ── SVG chick models ─────────────────────────────────────────── */
  const _S = (i) =>
    `<div class="chick-wrap"><svg viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${i}</svg></div>`;

  const OL = '#2D2314'; /* warm dark outline */

  /* head */
  const _H = `
    <circle cx="20" cy="12" r="10.5" fill="#FFE234" stroke="${OL}" stroke-width="1.3"/>
    <ellipse cx="17" cy="9" rx="5" ry="3" fill="#fff" opacity=".22"/>
    <ellipse cx="13.5" cy="16" rx="3.8" ry="2.4" fill="#FFB7C5" opacity=".85"/>
    <ellipse cx="26.5" cy="16" rx="3.8" ry="2.4" fill="#FFB7C5" opacity=".85"/>
    <circle cx="15.5" cy="11"   r="3.2" fill="#fff" stroke="${OL}" stroke-width=".7"/>
    <circle cx="24.5" cy="11"   r="3.2" fill="#fff" stroke="${OL}" stroke-width=".7"/>
    <circle cx="16"   cy="11.6" r="2.1" fill="#2D2D2D"/>
    <circle cx="25"   cy="11.6" r="2.1" fill="#2D2D2D"/>
    <circle cx="17"   cy="10.6" r=".85" fill="#fff"/>
    <circle cx="26"   cy="10.6" r=".85" fill="#fff"/>
    <circle cx="15.3" cy="13"   r=".45" fill="#fff" opacity=".65"/>
    <circle cx="24.3" cy="13"   r=".45" fill="#fff" opacity=".65"/>
    <path d="M17.5,16 L22.5,16 L20,20" fill="#FF8C00" stroke="${OL}" stroke-width=".8" stroke-linejoin="round"/>`;

  /* tuft */
  const _T = `
    <path d="M20,2 Q18.5,-1.5 20,-2.5 Q21.5,-1.5 20,2"   fill="#FFE234" stroke="${OL}" stroke-width=".9"/>
    <path d="M16.5,3 Q13,-1.5 15.5,-2.5 Q18.5,1.5 16.5,3" fill="#FFC200" stroke="${OL}" stroke-width=".9"/>
    <path d="M23.5,3 Q27,-1.5 24.5,-2.5 Q21.5,1.5 23.5,3" fill="#FFC200" stroke="${OL}" stroke-width=".9"/>`;

  /* body + wings */
  const _B  = `
    <ellipse cx="20" cy="31" rx="12" ry="9.5" fill="#FFE234" stroke="${OL}" stroke-width="1.3"/>
    <ellipse cx="17" cy="28" rx="6" ry="3.5" fill="#fff" opacity=".18"/>`;
  const _LW = `<path d="M8,25 Q1,32 4,40 Q10,37 11,30 Z" fill="#FFC200" stroke="${OL}" stroke-width="1" stroke-linejoin="round"/>`;
  const _RW = `<path d="M32,25 Q39,32 36,40 Q30,37 29,30 Z" fill="#FFC200" stroke="${OL}" stroke-width="1" stroke-linejoin="round"/>`;

  /* legs */
  const _L = `
    <rect x="13.5" y="39" width="3" height="6" rx="1.5" fill="#FF9500" stroke="${OL}" stroke-width=".8"/>
    <rect x="23.5" y="39" width="3" height="6" rx="1.5" fill="#FF9500" stroke="${OL}" stroke-width=".8"/>`;

  /* ── accessories ─── */

  /* 👟 cherry-red sneakers with white sole stripe */
  const _shoes = `
    <rect x="8"  y="42.5" width="11" height="5.5" rx="2.8" fill="#FF4757" stroke="${OL}" stroke-width="1"/>
    <rect x="21" y="42.5" width="11" height="5.5" rx="2.8" fill="#FF4757" stroke="${OL}" stroke-width="1"/>
    <rect x="9"  y="41.2" width="9"  height="2.8" rx="1.4" fill="#CC0022" stroke="${OL}" stroke-width=".7"/>
    <rect x="22" y="41.2" width="9"  height="2.8" rx="1.4" fill="#CC0022" stroke="${OL}" stroke-width=".7"/>
    <rect x="10" y="44"   width="7"  height="1.2" rx=".6" fill="#fff" opacity=".55"/>
    <rect x="23" y="44"   width="7"  height="1.2" rx=".6" fill="#fff" opacity=".55"/>`;

  /* 🎒 bright-green backpack body — drawn BEFORE body (behind chick) */
  const _packBody = `
    <rect x="29.5" y="21" width="11" height="17" rx="3"   fill="#2ECC71" stroke="${OL}" stroke-width="1"/>
    <rect x="30.5" y="19" width="9"  height="4"  rx="2"   fill="#A8EDCC" stroke="${OL}" stroke-width=".8"/>
    <rect x="31.5" y="26.5" width="7" height="3" rx="1.5" fill="#27AE60" stroke="${OL}" stroke-width=".7"/>
    <rect x="31"   y="35"   width="8" height="2" rx="1"   fill="#27AE60" stroke="${OL}" stroke-width=".6"/>
    <rect x="33" y="21.5" width="5" height="8" rx="1" fill="#27AE60" opacity=".35"/>`;

  /* backpack straps — drawn AFTER body (cross chest visibly) */
  const _packStraps = `
    <path d="M32,23 Q27,26 25.5,32 Q24,37.5 22,40"
          fill="none" stroke="#2ECC71" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M32,23 Q27,26 25.5,32 Q24,37.5 22,40"
          fill="none" stroke="${OL}" stroke-width="1" stroke-linecap="round" opacity=".55"/>
    <rect x="18" y="28" width="6" height="2.2" rx="1.1" fill="#27AE60" stroke="${OL}" stroke-width=".7"/>`;

  /* 🗺️ parchment map held in left wing */
  const _map = `
    <g transform="rotate(12 7 33)">
      <rect x="0"   y="25" width="13"  height="17" rx="2"   fill="#FFD07A" stroke="${OL}" stroke-width="1"/>
      <rect x="0"   y="25" width="3.5" height="17" rx="1.7" fill="#C47C1E" stroke="${OL}" stroke-width=".8"/>
      <rect x="9.5" y="25" width="3.5" height="17" rx="1.7" fill="#C47C1E" stroke="${OL}" stroke-width=".8"/>
      <line x1="4.5" y1="30" x2="10.5" y2="30" stroke="#9A6010" stroke-width="1.1"/>
      <line x1="4.5" y1="34" x2="10.5" y2="34" stroke="#9A6010" stroke-width="1.1"/>
      <line x1="4.5" y1="38" x2="10.5" y2="38" stroke="#9A6010" stroke-width="1.1"/>
      <circle cx="7.5" cy="30.5" r="1.8" fill="#FF4757" stroke="${OL}" stroke-width=".6"/>
    </g>`;

  /* 🔭 bright-blue telescope at right eye */
  const _scope = `
    <g transform="rotate(-38 20 9)">
      <rect x="18" y="7"   width="22"  height="5.5" rx="2.75" fill="#3A86FF" stroke="${OL}" stroke-width="1"/>
      <rect x="18" y="7.5" width="7"   height="4.5" rx="2.25" fill="#74B0FF" stroke="${OL}" stroke-width=".8"/>
      <ellipse cx="40" cy="9.25" rx="3.5" ry="4.2" fill="#EAF4FF" stroke="${OL}" stroke-width="1"/>
      <ellipse cx="40" cy="9.25" rx="1.8" ry="2.2" fill="#74B0FF" opacity=".6"/>
      <circle  cx="39" cy="8.2"  r=".9" fill="#fff" opacity=".9"/>
    </g>`;

  /* 👑 gold crown — base band grips the head */
  const _crown = `
    <path d="M10,8 L14,1 L17,6 L20,-0.5 L23,6 L26,1 L30,8 Z" fill="#FFD700" stroke="${OL}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M10,8 L30,8 L29,12 L11,12 Z" fill="#FFA500" stroke="${OL}" stroke-width=".9" stroke-linejoin="round"/>
    <ellipse cx="20" cy="7.5" rx="9" ry="1.5" fill="#fff" opacity=".2"/>
    <circle cx="20"   cy="0"   r="2"   fill="#FF4757" stroke="${OL}" stroke-width=".7"/>
    <circle cx="14"   cy="2.5" r="1.4" fill="#74B0FF" stroke="${OL}" stroke-width=".6"/>
    <circle cx="26"   cy="2.5" r="1.4" fill="#74B0FF" stroke="${OL}" stroke-width=".6"/>`;

  const CHICK_ICONS = [
    /* 0 – hatchling in egg */
    _S(`
      <path d="M3,26 Q2,48 20,48 Q38,48 37,26 Z" fill="#FFFBF0" stroke="#D4B896" stroke-width="1.5"/>
      <ellipse cx="20" cy="39" rx="8" ry="4" fill="#fff" opacity=".3"/>
      <polyline points="3,26 8,21 13,25 18,18 20,23 22,18 27,22 32,20 37,26"
        fill="none" stroke="#C8A87A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="20" cy="38" rx="14" ry="9" fill="#FFE234" stroke="${OL}" stroke-width="1.3"/>
      <ellipse cx="8"  cy="33" rx="4.5" ry="7" fill="#FFC200" stroke="${OL}" stroke-width="1" transform="rotate(-20 8 33)"/>
      <ellipse cx="32" cy="33" rx="4.5" ry="7" fill="#FFC200" stroke="${OL}" stroke-width="1" transform="rotate(20 32 33)"/>
      ${_H}${_T}`),

    /* 1 – standing + shoes */
    _S(`${_B}${_LW}${_RW}${_L}${_shoes}${_H}${_T}`),

    /* 2 – + backpack */
    _S(`${_packBody}${_B}${_LW}${_RW}${_packStraps}${_L}${_shoes}${_H}${_T}`),

    /* 3 – + map */
    _S(`${_packBody}${_B}${_LW}${_map}${_RW}${_packStraps}${_L}${_shoes}${_H}${_T}`),

    /* 4 – + telescope */
    _S(`${_packBody}${_B}${_LW}${_map}${_RW}${_packStraps}${_L}${_shoes}${_scope}${_H}${_T}`),

    /* 5 – + crown */
    _S(`${_packBody}${_B}${_LW}${_map}${_RW}${_packStraps}${_L}${_shoes}${_scope}${_H}${_T}${_crown}`),
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
