/* ============================================================
   admin.js – Admin panel: pin management + audio recording
   ============================================================ */

const AdminApp = (() => {
  let map;
  let pins = [];
  const pinMarkers = new Map();
  let editPin   = null;    // pin being edited / created
  let isAdding  = false;
  let tempMark  = null;
  let newBlob   = null;    // freshly recorded blob
  let prevBlob  = null;    // blob already in DB for this pin
  let audioDeleted = false;
  let searchQuery = '';

  /* ── Boot ────────────────────────────────────────────────── */
  async function init() {
    // Login form must be bound before we know auth state
    document.getElementById('loginForm').addEventListener('submit', tryLogin);
    if (!sessionStorage.getItem('vmAuth')) { showLogin(); return; }
    await boot();
  }

  async function boot() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminLayout').style.display = 'flex';
    document.getElementById('adminUsername').textContent =
      localStorage.getItem('vmAdminUser') || 'admin';

    await VoiceMapDB.init();

    // Yield to the browser so flex layout is painted before Leaflet measures
    await new Promise(r => setTimeout(r, 80));

    map = L.map('adminMap', { zoomControl: true })
           .setView([13.7563, 100.5018], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
     .addTo(map);

    L.control.attribution({ position: 'bottomleft', prefix: '© OSM' }).addTo(map);

    // Force Leaflet to recalculate size after container is fully visible
    setTimeout(() => map.invalidateSize(), 100);

    reload();
    bindUI();
  }

  function reload() {
    pins = PinStorage.getAll();
    renderList();
    pinMarkers.forEach(m => map.removeLayer(m));
    pinMarkers.clear();
    pins.forEach(addMarker);
  }

  /* ── Pin list ────────────────────────────────────────────── */
  function renderList() {
    const el    = document.getElementById('pinList');
    const count = document.getElementById('pinSearchCount');

    if (!pins.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-text">ยังไม่มีหมุดพิเศษ<br>กด "+ เพิ่มหมุด" แล้วคลิกบนแผนที่</div>
      </div>`;
      count.textContent = '';
      return;
    }

    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? pins.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q))
      : pins;

    /* update count label */
    if (q) {
      count.textContent = filtered.length
        ? `พบ ${filtered.length} จาก ${pins.length} หมุด`
        : `ไม่พบหมุดที่ตรงกับ "${q}"`;
    } else {
      count.textContent = `${pins.length} หมุดทั้งหมด`;
    }

    if (!filtered.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon" style="opacity:.35">🔍</div>
        <div class="empty-state-text">ไม่พบหมุดที่ตรงกับ<br>"${esc(q)}"</div>
      </div>`;
      return;
    }

    el.innerHTML = filtered.map(p => `
      <div class="pin-card" onclick="AdminApp.focusPin('${p.id}')">
        <div class="pin-card-row">
          <div>
            <div class="pin-card-name">📍 ${highlight(p.name, q)}</div>
            <div class="pin-card-coords">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
            ${p.description ? `<div class="pin-card-coords">${highlight(p.description.slice(0,40), q)}${p.description.length>40?'…':''}</div>` : ''}
            ${p.hasAudio ? '<div class="pin-card-audio">🔊 มีไฟล์เสียง</div>' : ''}
          </div>
          <div class="pin-card-btns">
            <button type="button" class="icon-btn" title="แก้ไข"
              onclick="event.stopPropagation(); AdminApp.openEdit('${p.id}')">✏️</button>
            <button type="button" class="icon-btn red" title="ลบ"
              onclick="event.stopPropagation(); AdminApp.delPin('${p.id}')">🗑️</button>
          </div>
        </div>
      </div>`).join('');
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    const safe = esc(text);
    const safeQ = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(safeQ, 'gi'),
      m => `<span class="pin-card-highlight">${m}</span>`);
  }

  function addMarker(pin) {
    if (pinMarkers.has(pin.id)) map.removeLayer(pinMarkers.get(pin.id));
    const icon = L.divIcon({
      className: '',
      html: `<div class="voice-pin">
               <div class="voice-pin-icon" style="width:36px;height:36px;">
                 <span style="font-size:16px">🔊</span>
               </div>
             </div>`,
      iconSize: [36, 45], iconAnchor: [18, 45]
    });
    const m = L.marker([pin.lat, pin.lng], { icon })
               .addTo(map)
               .on('click', () => openEdit(pin.id));
    pinMarkers.set(pin.id, m);
  }

  function focusPin(id) {
    const pin = pins.find(p => p.id === id);
    if (pin) { map.setView([pin.lat, pin.lng], 16); openEdit(id); }
  }

  /* ── Add mode ────────────────────────────────────────────── */
  function startAdd() {
    isAdding = true;
    document.getElementById('addHint').style.display = 'flex';
    document.getElementById('addPinBtn').style.display = 'none';
  }

  function cancelAdd() {
    isAdding = false;
    document.getElementById('addHint').style.display = 'none';
    document.getElementById('addPinBtn').style.display = 'inline-flex';
    if (tempMark) { map.removeLayer(tempMark); tempMark = null; }
  }

  function onMapClick(e) {
    if (!isAdding) return;
    const { lat, lng } = e.latlng;

    if (tempMark) map.removeLayer(tempMark);
    tempMark = L.marker([lat, lng]).addTo(map);
    cancelAdd();

    editPin = {
      id: PinStorage.genId(), name: '', description: '',
      lat, lng, hasAudio: false, createdAt: Date.now()
    };
    newBlob = null; prevBlob = null; audioDeleted = false;
    openModal(true);
  }

  /* ── Edit modal ──────────────────────────────────────────── */
  async function openEdit(id) {
    const pin = pins.find(p => p.id === id);
    if (!pin) return;
    editPin = { ...pin };
    newBlob = null; audioDeleted = false;
    prevBlob = await VoiceMapDB.getAudio(id);
    openModal(false);
  }

  function openModal(isNew) {
    document.getElementById('modalTitle').textContent = isNew ? 'เพิ่มหมุดใหม่' : 'แก้ไขหมุด';
    document.getElementById('pinName').value  = editPin.name || '';
    document.getElementById('pinDesc').value  = editPin.description || '';
    document.getElementById('pinLat').value   = editPin.lat.toFixed(6);
    document.getElementById('pinLng').value   = editPin.lng.toFixed(6);
    AudioManager.stopPlayback();
    refreshRecorderUI();
    document.getElementById('editModal').classList.add('show');
  }

  function closeModal() {
    document.getElementById('editModal').classList.remove('show');
    AudioManager.stopPlayback();
    if (AudioManager.isRecording) AudioManager.stopRecording().catch(() => {});
    if (tempMark) { map.removeLayer(tempMark); tempMark = null; }
    editPin = null; newBlob = null; prevBlob = null; audioDeleted = false;
  }

  async function savePin() {
    const name = document.getElementById('pinName').value.trim();
    if (!name) { alert('กรุณากรอกชื่อหมุด'); return; }

    const pin = {
      ...editPin,
      name,
      description: document.getElementById('pinDesc').value.trim(),
      lat: parseFloat(document.getElementById('pinLat').value),
      lng: parseFloat(document.getElementById('pinLng').value),
      hasAudio: false
    };

    // Handle audio
    if (newBlob) {
      await VoiceMapDB.saveAudio(pin.id, newBlob);
      pin.hasAudio = true;
    } else if (audioDeleted) {
      await VoiceMapDB.deleteAudio(pin.id);
      pin.hasAudio = false;
    } else if (prevBlob) {
      pin.hasAudio = true;
    }

    const exists = pins.some(p => p.id === pin.id);
    if (exists) {
      PinStorage.update(pin.id, pin);
      pins = pins.map(p => p.id === pin.id ? pin : p);
    } else {
      PinStorage.add(pin);
      pins.push(pin);
    }

    addMarker(pin);
    renderList();
    closeModal();
    toast('บันทึกเรียบร้อย ✓');
  }

  function delPin(id) {
    if (!confirm('ลบหมุดนี้หรือไม่?')) return;
    PinStorage.del(id);
    pins = pins.filter(p => p.id !== id);
    if (pinMarkers.has(id)) { map.removeLayer(pinMarkers.get(id)); pinMarkers.delete(id); }
    renderList();
    toast('ลบหมุดเรียบร้อย');
  }

  /* ── Recorder ────────────────────────────────────────────── */
  async function toggleRecord() {
    if (AudioManager.isRecording) {
      const blob = await AudioManager.stopRecording();
      if (blob) newBlob = blob;
      refreshRecorderUI();
    } else {
      try {
        await AudioManager.startRecording(ms => {
          document.getElementById('recTimer').textContent = AudioManager.formatMs(ms);
        });
        refreshRecorderUI();
        document.getElementById('recTimer').textContent = '00:00';
      } catch (e) {
        alert('ไม่สามารถเข้าถึงไมโครโฟน: ' + e.message);
      }
    }
  }

  async function playRec() {
    const blob = newBlob || (audioDeleted ? null : prevBlob);
    if (blob) AudioManager.playBlob(blob).catch(e => alert('เล่นไม่ได้: ' + e.message));
  }

  function deleteRec() {
    AudioManager.stopPlayback();
    newBlob = null;
    if (prevBlob) audioDeleted = true;
    prevBlob = null;
    refreshRecorderUI();
  }

  function refreshRecorderUI() {
    const rec = AudioManager.isRecording;
    const has = !!(newBlob || (!audioDeleted && prevBlob));

    document.getElementById('recTimer').classList.toggle('rec-hidden', !rec);
    document.getElementById('recWave').classList.toggle('rec-hidden',  !rec);
    document.getElementById('recPlayBtn').classList.toggle('rec-hidden', !(!rec && has));
    document.getElementById('recDelBtn').classList.toggle('rec-hidden',  !(!rec && has));
    document.getElementById('recBtn').textContent = rec ? '⏹️' : '🎙️';
    document.getElementById('recBtn').title       = rec ? 'หยุดอัด' : 'เริ่มอัดเสียง';
    document.getElementById('recBtn').className  = 'rec-btn ' + (rec ? 'rec-stop' : 'rec-start');

    const status = rec ? '⏺ กำลังบันทึก…' : has ? (newBlob ? '✓ มีไฟล์เสียงใหม่' : '✓ มีไฟล์เสียง') : 'ยังไม่มีไฟล์เสียง';
    document.getElementById('recStatus').textContent = status;
  }

  /* ── Login ───────────────────────────────────────────────── */
  const SYSTEM_PASS = 'Admin2569Nirat';

  function hasAccount() {
    return !!localStorage.getItem('vmAdminUser');
  }

  function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminLayout').style.display = 'none';
    document.getElementById('loginErr').textContent = '';
    document.getElementById('unInput').value = '';
    document.getElementById('pwInput').value = '';

    const setup = !hasAccount();
    document.getElementById('loginIcon').textContent      = setup ? '🛡️' : '🔐';
    document.getElementById('loginTitle').textContent     = setup ? 'ตั้งค่าบัญชีผู้ดูแล' : 'แผงผู้ดูแลระบบ';
    document.getElementById('loginSub').textContent       = setup
      ? 'ตั้งชื่อผู้ใช้ของคุณและใส่รหัสผ่านระบบเพื่อยืนยัน'
      : 'Voice Map Administration';
    document.getElementById('loginSubmitBtn').textContent = setup ? 'สร้างบัญชี →' : 'เข้าสู่ระบบ →';
    setTimeout(() => document.getElementById('unInput').focus(), 80);
  }

  function tryLogin(e) {
    e.preventDefault();
    const un  = document.getElementById('unInput').value.trim();
    const pw  = document.getElementById('pwInput').value;
    const err = document.getElementById('loginErr');

    if (!un) { err.textContent = 'กรุณากรอกชื่อผู้ใช้'; return; }
    if (!pw) { err.textContent = 'กรุณากรอกรหัสผ่าน';  return; }

    if (pw !== SYSTEM_PASS) {
      err.textContent = 'รหัสผ่านไม่ถูกต้อง';
      document.getElementById('pwInput').value = '';
      document.getElementById('pwInput').focus();
      return;
    }

    if (!hasAccount()) {
      /* ── First-time setup: save username ── */
      localStorage.setItem('vmAdminUser', un);
    } else {
      /* ── Normal login: verify username ── */
      const savedUn = localStorage.getItem('vmAdminUser') || '';
      if (un !== savedUn) {
        err.textContent = 'ชื่อผู้ใช้ไม่ถูกต้อง';
        return;
      }
    }

    sessionStorage.setItem('vmAuth', '1');
    err.textContent = '';
    boot();
  }

  /* ── Bind UI ─────────────────────────────────────────────── */
  function bindUI() {
    document.getElementById('addPinBtn').addEventListener('click', startAdd);
    document.getElementById('cancelAddBtn').addEventListener('click', cancelAdd);

    /* Place search to add pin */
    bindPlaceSearch();

    /* Search existing pins */
    const pinSearch = document.getElementById('pinSearch');
    const pinSearchClear = document.getElementById('pinSearchClear');
    pinSearch.addEventListener('input', () => {
      searchQuery = pinSearch.value;
      pinSearchClear.classList.toggle('rec-hidden', !searchQuery);
      renderList();
    });
    pinSearchClear.addEventListener('click', () => {
      pinSearch.value = '';
      searchQuery = '';
      pinSearchClear.classList.add('rec-hidden');
      renderList();
      pinSearch.focus();
    });
    map.on('click', onMapClick);

    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('saveBtn').addEventListener('click', savePin);
    document.getElementById('editModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('recBtn').addEventListener('click', toggleRecord);
    document.getElementById('recPlayBtn').addEventListener('click', playRec);
    document.getElementById('recDelBtn').addEventListener('click', deleteRec);

    document.getElementById('logoutBtn').addEventListener('click', () => {
      sessionStorage.removeItem('vmAuth');
      showLogin();
    });
  }

  /* ── Place Search → Add Pin ─────────────────────────────── */
  let _psTimer = null;

  function bindPlaceSearch() {
    const input    = document.getElementById('placeSearchInput');
    const clearBtn = document.getElementById('placeSearchClear');
    const results  = document.getElementById('placeSearchResults');

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn.classList.toggle('rec-hidden', !q);
      clearTimeout(_psTimer);
      if (!q) { results.classList.add('rec-hidden'); return; }
      results.innerHTML = '<div class="place-search-msg">กำลังค้นหา…</div>';
      results.classList.remove('rec-hidden');
      _psTimer = setTimeout(() => _psSearch(q), 420);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.add('rec-hidden');
      results.classList.add('rec-hidden');
      input.focus();
    });

    document.addEventListener('click', e => {
      if (!document.querySelector('.place-search-section').contains(e.target))
        results.classList.add('rec-hidden');
    });
  }

  async function _psSearch(query) {
    const results = document.getElementById('placeSearchResults');
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=th`;
      const res  = await fetch(url, { headers: { 'User-Agent': 'VoiceMap/1.0' } });
      const data = await res.json();

      if (!data.length) {
        results.innerHTML = '<div class="place-search-msg">ไม่พบสถานที่</div>';
        return;
      }

      results.innerHTML = data.map(r => {
        const parts = r.display_name.split(',');
        const name  = parts[0].trim();
        const addr  = parts.slice(1, 3).join(',').trim();
        return `<div class="place-result-item"
                     data-lat="${r.lat}" data-lon="${r.lon}"
                     data-name="${escAttr(name)}">
          <div class="place-result-name">${esc(name)}</div>
          ${addr ? `<div class="place-result-addr">${esc(addr)}</div>` : ''}
          <div class="place-result-actions">
            <button type="button" class="place-result-fly">🗺️ ไปยังตำแหน่ง</button>
            <button type="button" class="place-result-add">📍 เพิ่มหมุดที่นี่</button>
          </div>
        </div>`;
      }).join('');

      results.querySelectorAll('.place-result-item').forEach(item => {
        const lat  = parseFloat(item.dataset.lat);
        const lng  = parseFloat(item.dataset.lon);
        const name = item.dataset.name;

        item.querySelector('.place-result-fly').addEventListener('click', () => {
          map.flyTo([lat, lng], 17, { duration: 1 });
          document.getElementById('placeSearchResults').classList.add('rec-hidden');
        });

        item.querySelector('.place-result-add').addEventListener('click', () => {
          document.getElementById('placeSearchInput').value = '';
          document.getElementById('placeSearchClear').classList.add('rec-hidden');
          results.classList.add('rec-hidden');
          map.flyTo([lat, lng], 17, { duration: 1 });
          editPin = {
            id: PinStorage.genId(), name,
            description: '', lat, lng,
            hasAudio: false, createdAt: Date.now()
          };
          newBlob = null; prevBlob = null; audioDeleted = false;
          openModal(true);
        });
      });
    } catch {
      results.innerHTML = '<div class="place-search-msg">เกิดข้อผิดพลาด ลองใหม่</div>';
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function toast(msg) {
    const t = document.getElementById('adminToast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2600);
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escAttr(s) {
    return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  return { init, focusPin, openEdit, delPin };
})();

/* ── Public wrappers for inline onclick ──────────────────── */
window.AdminApp = AdminApp;

(async () => { try { await AdminApp.init(); } catch(e) { console.error(e); } })();
