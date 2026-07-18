/* ============================================================
   menu.js – Left-panel: Travel History + Wanderer tabs
   ============================================================ */

const MenuManager = (() => {
  let isOpen    = false;
  let activeTab = 'wanderer';

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
          <div class="lp-empty-icon"><svg class="icon" aria-hidden="true"><use href="#ic-map"/></svg></div>
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
            <div class="history-pin-dot"><svg class="icon" aria-hidden="true"><use href="#ic-pin"/></svg></div>
            <div class="history-body">
              <div class="history-name">${esc(entry.pinName)}</div>
              <div class="history-time">${timeLabel(entry.visitedAt)}</div>
            </div>
            <button class="history-play" data-pin-id="${entry.pinId}" title="ฟังเสียงซ้ำ"><svg class="icon" aria-hidden="true"><use href="#ic-speaker"/></svg></button>
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
    const _spk = `<svg class="icon" aria-hidden="true"><use href="#ic-speaker"/></svg>`;
    const _ply = `<svg class="icon" aria-hidden="true"><use href="#ic-play"/></svg>`;
    btn.disabled = true;
    btn.innerHTML = '…';

    try {
      const blob = await VoiceMapDB.getAudio(pinId);
      if (!blob) {
        btn.innerHTML = '✕';
        setTimeout(() => { btn.innerHTML = _spk; btn.disabled = false; }, 2000);
        return;
      }
      btn.innerHTML = _ply;
      await AudioManager.playBlob(blob);
    } catch {
      btn.innerHTML = '✕';
      setTimeout(() => { btn.innerHTML = _spk; }, 2000);
    } finally {
      setTimeout(() => { btn.innerHTML = _spk; btn.disabled = false; }, 500);
    }
  }

  /* ── Level definitions (based on unique pins visited, max 9) ─────── */
  const LEVELS = [
    { lv: 1, icon: 'I',   key: 'level.1', min: 0, next: 3 },
    { lv: 2, icon: 'II',  key: 'level.2', min: 3, next: 6 },
    { lv: 3, icon: 'III', key: 'level.3', min: 6, next: 9 },
    { lv: 4, icon: 'IV',  key: 'level.4', min: 9, next: null },
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
          <div class="lv-visits-badge">${totalVisits} จุด</div>
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
    const levelHtml = renderLevelCard(doneCount);

    if (total === 0) {
      container.innerHTML = `
        ${levelHtml}
        <div class="lp-empty">
          <div class="lp-empty-icon"><svg class="icon" aria-hidden="true"><use href="#ic-map"/></svg></div>
          <div class="lp-empty-text">${I18n.t('lp.no_pins')}</div>
        </div>`;
      return;
    }

    const checklist = allPins.map(p => {
      const done = visited.has(p.id);
      return `
        <div class="checklist-item ${done ? 'done' : 'todo'}">
          <span class="check-icon">${done
            ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>`
            : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>`}</span>
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

  /* ── Medal rank icons ─────────────────────────────────────────── */
  const _S = (i) =>
    `<div class="chick-wrap"><svg viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg">${i}</svg></div>`;

  /* 5-pointed star: center (20,32), outer R=6, inner R=2.4 */
  const _STAR_PTS = '20,26 21.4,30.1 25.7,30.1 22.3,32.7 23.5,36.9 20,34.4 16.5,36.9 17.7,32.7 14.3,30.1 18.6,30.1';

  const _medal = (idx, rd, rl, mb, ms, rc) => {
    const g = `vmrg${idx}`;
    return _S(`
      <defs><radialGradient id="${g}" cx="38%" cy="28%" r="65%">
        <stop offset="0%" stop-color="${ms}"/>
        <stop offset="100%" stop-color="${mb}"/>
      </radialGradient></defs>
      <ellipse cx="20" cy="47" rx="10" ry="1.5" fill="rgba(0,0,0,0.15)"/>
      <polygon points="13,0 27,0 24,13 16,13" fill="${rl}"/>
      <polygon points="13,0 20,0 20,13 16,13" fill="${rd}"/>
      <line x1="20" y1="0" x2="20" y2="13" stroke="rgba(255,255,255,0.18)" stroke-width="1.2"/>
      <circle cx="20" cy="13" r="3.2" fill="none" stroke="${rc}" stroke-width="2.2"/>
      <circle cx="21" cy="33" r="13" fill="rgba(0,0,0,0.13)"/>
      <circle cx="20" cy="32" r="13" fill="url(#${g})"/>
      <circle cx="20" cy="32" r="13" fill="none" stroke="${rc}" stroke-width="1.5"/>
      <ellipse cx="15" cy="26.5" rx="4.5" ry="3" fill="rgba(255,255,255,0.22)" transform="rotate(-30 15 26.5)"/>
      <circle cx="20" cy="32" r="9.5" fill="none" stroke="${rc}" stroke-width="0.6" opacity="0.4"/>
      <polygon points="${_STAR_PTS}" fill="${ms}" stroke="${rc}" stroke-width="0.5" stroke-linejoin="round"/>
    `);
  };

  const _medalCrown = (rd, rl, mb, ms, rc) => {
    const g = 'vmrg5';
    return _S(`
      <defs><radialGradient id="${g}" cx="38%" cy="28%" r="65%">
        <stop offset="0%" stop-color="${ms}"/>
        <stop offset="100%" stop-color="${mb}"/>
      </radialGradient></defs>
      <ellipse cx="20" cy="47" rx="10" ry="1.5" fill="rgba(0,0,0,0.15)"/>
      <polygon points="13,0 27,0 24,13 16,13" fill="${rl}"/>
      <polygon points="13,0 20,0 20,13 16,13" fill="${rd}"/>
      <line x1="20" y1="0" x2="20" y2="13" stroke="rgba(255,255,255,0.18)" stroke-width="1.2"/>
      <circle cx="20" cy="13" r="3.2" fill="none" stroke="${rc}" stroke-width="2.2"/>
      <circle cx="21" cy="33" r="13" fill="rgba(0,0,0,0.13)"/>
      <circle cx="20" cy="32" r="13" fill="url(#${g})"/>
      <circle cx="20" cy="32" r="13" fill="none" stroke="${rc}" stroke-width="1.5"/>
      <ellipse cx="15" cy="26.5" rx="4.5" ry="3" fill="rgba(255,255,255,0.22)" transform="rotate(-30 15 26.5)"/>
      <circle cx="20" cy="32" r="9.5" fill="none" stroke="${rc}" stroke-width="0.6" opacity="0.4"/>
      <path d="M15.5,39.5 L15.5,34.5 L18,37 L20,31 L22,37 L24.5,34.5 L24.5,39.5 Z"
            fill="${mb}" stroke="${rc}" stroke-width="0.9" stroke-linejoin="round"/>
      <rect x="15" y="37" width="10" height="2.5" rx="1.2" fill="${mb}" stroke="${rc}" stroke-width="0.6"/>
      <circle cx="17.5" cy="34.5" r="1.3" fill="${ms}"/>
      <circle cx="20"   cy="31.5" r="1.3" fill="${ms}"/>
      <circle cx="22.5" cy="34.5" r="1.3" fill="${ms}"/>
    `);
  };

  const CHICK_ICONS = [
    /* 0 – Bronze    (ผู้เริ่มต้น) */
    _medal(0, '#6B3A0E', '#9B5A2A', '#8B4513', '#D29060', '#7B5020'),
    /* 1 – Copper    (นักเดินทาง) */
    _medal(1, '#7B5500', '#B87820', '#B87333', '#E8B060', '#9B7030'),
    /* 2 – Silver    (ผู้สำรวจ) */
    _medal(2, '#5A6878', '#8898A8', '#8898B0', '#D0D8E0', '#7890A8'),
    /* 3 – Blue      (นักผจญภัย) */
    _medal(3, '#1A3070', '#2858B0', '#2858A8', '#7AAAE0', '#3868C0'),
    /* 4 – Gold      (ผู้พเนจร) */
    _medal(4, '#7B5800', '#C09000', '#B89000', '#FFD700', '#C09800'),
    /* 5 – Platinum  (ผู้พเนจรผู้ยิ่งใหญ่) */
    _medalCrown('#501070', '#8030B8', '#7020A8', '#C870FF', '#9030D0'),
  ];

  /* All rank definitions — based on unique pins visited (d), not percentage */
  const ALL_RANKS = [
    { id: 'beginner',   icon: CHICK_ICONS[0], key: 'rank.beginner',  sub: { th: 'ผู้เริ่มต้น',        en: 'Beginner'   }, check: d => d === 0 },
    { id: 'traveler',   icon: CHICK_ICONS[1], key: 'rank.traveler',   sub: { th: 'นักเดินทาง',          en: 'Traveler'   }, check: d => d >= 1 && d <= 2 },
    { id: 'explorer',   icon: CHICK_ICONS[2], key: 'rank.explorer',   sub: { th: 'นักสำรวจ',            en: 'Explorer'   }, check: d => d >= 3 && d <= 4 },
    { id: 'adventurer', icon: CHICK_ICONS[3], key: 'rank.adventurer', sub: { th: 'นักผจญภัย',           en: 'Adventurer' }, check: d => d >= 5 && d <= 6 },
    { id: 'wanderer',   icon: CHICK_ICONS[4], key: 'rank.wanderer',   sub: { th: 'ผู้พเนจร',            en: 'Wanderer'   }, check: d => d >= 7 },
    { id: 'legend',     icon: CHICK_ICONS[5], key: 'rank.legend',     sub: { th: 'ผู้พเนจรผู้ยิ่งใหญ่', en: 'Legend'    }, check: d => d >= 12 },
  ];

  function renderRankScroll(doneCount, pct) {
    const cards = ALL_RANKS.map(r => {
      const isActive = r.check(doneCount);
      return `
        <div class="rank-card${isActive ? ' rank-card-active' : ''}" data-rank-id="${r.id}">
          <div class="rank-card-icon${isActive ? ' rank-icon-anim' : ''}">${r.icon}</div>
          <div class="rank-card-name">${r.sub.th}</div>
        </div>`;
    }).join('');
    return `<div class="rank-scroll" id="rankScroll">${cards}</div>`;
  }

  /* Rank definitions (based on % of unique pins visited) */
  function getWandererRank(done, pct) {
    const r = ALL_RANKS.find(r => r.check(done)) ?? ALL_RANKS[ALL_RANKS.length - 1];
    return { icon: r.icon, title: r.sub.th };
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
    const locale = 'th-TH';
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function timeLabel(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000)       return I18n.t('time.just_now');
    if (diff < 3_600_000)    return I18n.t('time.minutes_ago', Math.floor(diff / 60_000));
    if (diff < 86_400_000)   return I18n.t('time.hours_ago',   Math.floor(diff / 3_600_000));
    const locale = 'th-TH';
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
