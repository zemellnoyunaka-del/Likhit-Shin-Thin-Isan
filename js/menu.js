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
          <div class="lp-empty-text">ยังไม่มีประวัติการเดินทาง<br>เดินทางไปถึงหมุดพิเศษเพื่อบันทึก</div>
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
    { lv: 1, icon: '🥾', title: 'นักเดินทางฝึกหัด',      min: 0,  next: 5  },
    { lv: 2, icon: '🚶', title: 'นักเดินมือใหม่',         min: 5,  next: 10 },
    { lv: 3, icon: '🧭', title: 'นักเดินถางผู้เชี่ยวชาญ', min: 10, next: 20 },
    { lv: 4, icon: '🏆', title: 'นักเดินทางในตำนาน',      min: 20, next: null },
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
        <div class="lv-next-hint">อีก <strong>${remaining}</strong> ครั้ง → ระดับถัดไป</div>`;
    } else {
      progressBlock = `<div class="lv-max-badge">✨ ระดับสูงสุด ✨</div>`;
    }

    return `
      <div class="level-card${isMax ? ' level-card-max' : ''}">
        <div class="lv-top">
          <div class="lv-icon">${lv.icon}</div>
          <div class="lv-info">
            <div class="lv-num">ระดับ ${lv.lv}</div>
            <div class="lv-title">${lv.title}</div>
          </div>
          <div class="lv-visits-badge">${totalVisits} ครั้ง</div>
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
          <div class="lp-empty-text">ยังไม่มีหมุดพิเศษบนแผนที่<br>ผู้ดูแลระบบสามารถเพิ่มหมุดได้</div>
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
        <div class="wanderer-count">${doneCount} / ${total} จุดพิเศษ</div>
      </div>

      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="progress-pct">${pct}%</div>
      </div>

      <div class="checklist-label">รายชื่อหมุดพิเศษทั้งหมด</div>
      ${checklist}`;
  }

  /* Rank definitions (based on % of unique pins visited) */
  function getWandererRank(done, pct) {
    if (done === 0) return { icon: '🐣', title: 'ผู้เริ่มต้น' };
    if (pct < 25)   return { icon: '🚶', title: 'นักเดินทาง' };
    if (pct < 50)   return { icon: '🧭', title: 'ผู้สำรวจ' };
    if (pct < 75)   return { icon: '⭐', title: 'นักผจญภัย' };
    if (pct < 100)  return { icon: '🌟', title: 'ผู้พเนจร' };
    return              { icon: '🏆', title: 'ผู้พเนจรผู้ยิ่งใหญ่' };
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
    if (isSameDay(d, now))          return 'วันนี้';
    if (isSameDay(d, yesterday()))  return 'เมื่อวาน';
    return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function timeLabel(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000)          return 'เพิ่งเดินทางถึง';
    if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)} นาทีที่แล้ว`;
    if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)} ชั่วโมงที่แล้ว`;
    return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
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
