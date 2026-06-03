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
    const el = document.getElementById('pinList');

    if (!pins.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📍</div>
        <div class="empty-state-text">ยังไม่มีหมุดพิเศษ<br>กด "+ เพิ่มหมุด" แล้วคลิกบนแผนที่</div>
      </div>`;
      return;
    }

    el.innerHTML = pins.map(p => `
      <div class="pin-card" onclick="AdminApp.focusPin('${p.id}')">
        <div class="pin-card-row">
          <div>
            <div class="pin-card-name">📍 ${esc(p.name)}</div>
            <div class="pin-card-coords">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
            ${p.hasAudio ? '<div class="pin-card-audio">🔊 มีไฟล์เสียง</div>' : ''}
          </div>
          <div class="pin-card-btns">
            <button class="icon-btn" title="แก้ไข"
              onclick="event.stopPropagation(); AdminApp.openEdit('${p.id}')">✏️</button>
            <button class="icon-btn red" title="ลบ"
              onclick="event.stopPropagation(); AdminApp.delPin('${p.id}')">🗑️</button>
          </div>
        </div>
      </div>`).join('');
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

    document.getElementById('recTimer').style.display  = rec  ? 'block'  : 'none';
    document.getElementById('recWave').style.display   = rec  ? 'flex'   : 'none';
    document.getElementById('recPlayBtn').style.display  = (!rec && has) ? 'flex' : 'none';
    document.getElementById('recDelBtn').style.display   = (!rec && has) ? 'flex' : 'none';
    document.getElementById('recBtn').textContent = rec ? '⏹️' : '🎙️';
    document.getElementById('recBtn').title       = rec ? 'หยุดอัด' : 'เริ่มอัดเสียง';
    document.getElementById('recBtn').className  = 'rec-btn ' + (rec ? 'rec-stop' : 'rec-start');

    const status = rec ? '⏺ กำลังบันทึก…' : has ? (newBlob ? '✓ มีไฟล์เสียงใหม่' : '✓ มีไฟล์เสียง') : 'ยังไม่มีไฟล์เสียง';
    document.getElementById('recStatus').textContent = status;
  }

  /* ── Login ───────────────────────────────────────────────── */
  function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminLayout').style.display = 'none';
  }

  function getPassword() { return localStorage.getItem('vmAdminPass') || 'AdminNirat2569'; }

  function tryLogin(e) {
    e.preventDefault();
    const pw = document.getElementById('pwInput').value;
    if (pw === getPassword()) {
      sessionStorage.setItem('vmAuth', '1');
      boot();
    } else {
      document.getElementById('loginErr').textContent = 'รหัสผ่านไม่ถูกต้อง';
    }
  }

  /* ── Bind UI ─────────────────────────────────────────────── */
  function bindUI() {
    document.getElementById('addPinBtn').addEventListener('click', startAdd);
    document.getElementById('cancelAddBtn').addEventListener('click', cancelAdd);
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

  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function toast(msg) {
    const t = document.getElementById('adminToast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2600);
  }

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { init, focusPin, openEdit, delPin };
})();

/* ── Public wrappers for inline onclick ──────────────────── */
window.AdminApp = AdminApp;

(async () => { try { await AdminApp.init(); } catch(e) { console.error(e); } })();
