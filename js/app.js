/* ============================================================
   app.js – User-facing map application
   ============================================================ */

const App = (() => {
  /* State */
  let map, userMarker, accCircle;
  let watchId = null;
  let userLat = null, userLng = null, userAcc = Infinity;
  let pins = [];
  const pinMarkers = new Map();
  const triggered = new Set();   // pins already triggered this visit
  const PROX_M  = 50;            // trigger radius (metres)
  const AWAY_M  = 120;           // reset radius (metres)
  let panelOpen = false;
  let activePin = null;
  let placeLat = null, placeLng = null;
  let selectedLocMarker = null;
  let streetLayer = null, satLayer = null, satLabelLayer = null, isSatellite = true;
  let currentPage = 'home';

  /* ── Boot ────────────────────────────────────────────────── */
  async function init() {
    await VoiceMapDB.init();
    await SeedData.run();

    map = L.map('map', { zoomControl: false, attributionControl: false })
           .setView([13.7563, 100.5018], 15);

    streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>'
    });

    satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '© <a href="https://www.esri.com/">Esri</a>'
    });

    satLabelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '© <a href="https://www.esri.com/">Esri</a>'
    });

    // Default: satellite + labels
    satLayer.addTo(map);
    satLabelLayer.addTo(map);

    const layerBtn = document.getElementById('layerToggle');
    layerBtn.textContent = '🗺️';
    layerBtn.classList.add('satellite');

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: '© OSM' }).addTo(map);

    NavManager.init(map);
    MenuManager.init();

    loadPins();
    startTracking();
    bindUI();
    map.on('click', onMapClick);

    switchPage('home');
  }

  /* ── Pins ────────────────────────────────────────────────── */
  function loadPins() {
    pins = PinStorage.getAll();
    pins.forEach(addMarker);
    const el = document.getElementById('pinCountText');
    if (el) el.textContent = pins.length
      ? `${pins.length} จุดพิเศษบนแผนที่`
      : 'ยังไม่มีจุดพิเศษ';
  }

  function addMarker(pin) {
    if (pinMarkers.has(pin.id)) map.removeLayer(pinMarkers.get(pin.id));

    const icon = L.divIcon({
      className: '',
      html: `<div class="voice-pin">
               <div class="voice-pin-pulse"></div>
               <div class="voice-pin-icon"><span>🔊</span></div>
             </div>`,
      iconSize: [44, 55], iconAnchor: [22, 55]
    });

    const m = L.marker([pin.lat, pin.lng], { icon })
               .on('click', () => showPinSheet(pin));

    if (currentPage === 'voicemap') m.addTo(map);
    pinMarkers.set(pin.id, m);
  }

  /* ── GPS ─────────────────────────────────────────────────── */
  function startTracking() {
    if (!navigator.geolocation) {
      setText('statusText', 'ไม่รองรับ GPS');
      return;
    }
    setText('statusText', 'กำลังค้นหา GPS…');
    _startWatch();
  }

  function _startWatch() {
    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      onPosition, onGeoErr,
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }

  function onPosition(pos) {
    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
    userLat = lat; userLng = lng; userAcc = acc;

    updateUserMarker(lat, lng, acc);
    checkProximity(lat, lng);
    updateNavPanel(lat, lng);
    NavManager.updateRoute(lat, lng);
    setText('statusText', `±${Math.round(acc)} ม.`);
    document.getElementById('statusDot').classList.add('active');
    document.getElementById('locateBtn').classList.add('active');
  }

  function onGeoErr(err) {
    const msgs = { 1: 'ไม่ได้รับสิทธิ์ GPS', 2: 'ไม่พบสัญญาณ GPS', 3: 'GPS หมดเวลา' };
    const msg = msgs[err?.code] || 'GPS ผิดพลาด';
    setText('statusText', msg);
    if (err?.code === 1) toast('กรุณาเปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์');
  }

  function updateUserMarker(lat, lng, acc) {
    const ll = [lat, lng];
    if (!userMarker) {
      const icon = L.divIcon({
        className: '',
        html: `<div class="user-dot-wrap"><div class="user-ring"></div><div class="user-dot"></div></div>`,
        iconSize: [22, 22], iconAnchor: [11, 11]
      });
      userMarker = L.marker(ll, { icon, zIndexOffset: 1000 }).addTo(map);
      accCircle  = L.circle(ll, { radius: acc, color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: .05, weight: 1, opacity: .25 }).addTo(map);
      if (currentPage !== 'home') map.setView(ll, 17);
    } else {
      userMarker.setLatLng(ll);
      accCircle.setLatLng(ll).setRadius(acc);
    }
  }

  /* ── Proximity detection ─────────────────────────────────── */
  function checkProximity(lat, lng) {
    if (currentPage !== 'voicemap') return;
    pins.forEach(pin => {
      const d      = NavManager.haversine(lat, lng, pin.lat, pin.lng);
      const trigR  = pin.radius  || PROX_M;
      const resetR = trigR * (AWAY_M / PROX_M);   // keeps same ratio as global default

      if (d <= trigR && !triggered.has(pin.id)) {
        triggered.add(pin.id);
        triggerAudio(pin, d);
      } else if (d > resetR && triggered.has(pin.id)) {
        triggered.delete(pin.id);   // allow re-trigger when user returns
      }
    });
  }

  async function triggerAudio(pin, dist) {
    VisitHistory.record(pin);
    MenuManager.onVisit();

    const blob = await VoiceMapDB.getAudio(pin.id);
    if (!blob) return;

    try {
      await AudioManager.playBlob(blob);
    } catch {
      // Autoplay blocked silently
    }
  }

  /* ── Pin info bottom-sheet ───────────────────────────────── */
  function showPinSheet(pin) {
    activePin = pin;
    setText('sheetTitle', pin.name);
    setText('sheetDesc',  pin.description || '');

    const distEl = document.getElementById('sheetDist');
    if (userLat !== null) {
      distEl.textContent = NavManager.fmtDist(NavManager.haversine(userLat, userLng, pin.lat, pin.lng));
    } else {
      distEl.textContent = '–';
    }

    // Show/hide play button based on audio
    VoiceMapDB.hasAudio(pin.id).then(has => {
      document.getElementById('sheetPlayBtn').style.display = has ? 'inline-flex' : 'none';
    });

    document.getElementById('pinSheet').classList.add('show');
    map.panTo([pin.lat, pin.lng]);
  }

  function closeSheet() { document.getElementById('pinSheet').classList.remove('show'); activePin = null; }

  /* ── Navigation ──────────────────────────────────────────── */
  async function startNav(pin) {
    if (!userLat) { toast('ยังไม่ได้รับสัญญาณ GPS'); return; }
    if (userAcc > 150) { toast(`สัญญาณ GPS ยังไม่แม่นยำ (±${Math.round(userAcc)} ม.) รอสักครู่`); return; }
    closeSheet();

    // Show nav panel
    setEl('panelDefault', 'none');
    setEl('panelNav', 'block');
    expandPanel();

    setText('navDest', pin.name);
    setText('navDist', '…');
    setText('navTime', '…');

    const result = await NavManager.startNavigation(userLat, userLng, pin);
    setText('navDist', NavManager.fmtDist(result.distance));
    setText('navTime', NavManager.fmtTime(result.duration));
  }

  function stopNav() {
    NavManager.stopNavigation();
    document.getElementById('navInstruction').classList.add('hidden');
    setEl('panelDefault', 'block');
    setEl('panelNav', 'none');
    collapsePanel();
  }

  function updateNavPanel(lat, lng) {
    if (!NavManager.isNavigating) return;
    const info = NavManager.checkAndUpdate(lat, lng);
    if (!info) return;

    if (info.remainDist !== null) setText('navDist', NavManager.fmtDist(info.remainDist));

    const instrEl   = document.getElementById('navInstruction');
    const instrText = document.getElementById('navInstrText');
    const instrArrow = document.getElementById('navInstrArrow');

    if (info.instruction) {
      instrEl.classList.remove('hidden');
      instrArrow.textContent = info.arrow || '↑';
      instrText.textContent  = info.instruction;
    } else {
      instrEl.classList.add('hidden');
    }

    if (info.arrived) setTimeout(stopNav, 3000);
  }

  /* ── Panel helpers ───────────────────────────────────────── */
  function expandPanel()  { document.getElementById('bottomPanel').classList.add('expanded');    panelOpen = true;  }
  function collapsePanel(){ document.getElementById('bottomPanel').classList.remove('expanded'); panelOpen = false; }

  /* ── UI bindings ─────────────────────────────────────────── */
  function bindUI() {
    // Panel handle toggle
    document.getElementById('panelHandle').addEventListener('click', () =>
      panelOpen ? collapsePanel() : expandPanel());

    // Layer toggle
    document.getElementById('layerToggle').addEventListener('click', () => {
      isSatellite = !isSatellite;
      if (isSatellite) {
        map.removeLayer(streetLayer);
        satLayer.addTo(map);
        satLayer.bringToBack();
        satLabelLayer.addTo(map);
      } else {
        map.removeLayer(satLayer);
        map.removeLayer(satLabelLayer);
        streetLayer.addTo(map);
        streetLayer.bringToBack();
      }
      const btn = document.getElementById('layerToggle');
      btn.textContent = isSatellite ? '🗺️' : '🛰️';
      btn.classList.toggle('satellite', isSatellite);
    });

    // Locate button
    document.getElementById('locateBtn').addEventListener('click', () => {
      if (userLat !== null) {
        map.flyTo([userLat, userLng], 17, { duration: 1.2 });
      } else {
        toast('กำลังค้นหาตำแหน่ง GPS…');
        _startWatch();
      }
    });

    // Center button
    document.getElementById('centerBtn').addEventListener('click', () => {
      if (userLat) map.setView([userLat, userLng], 17);
      else toast('กำลังค้นหาตำแหน่ง…');
    });

    // Pin sheet
    document.getElementById('sheetClose').addEventListener('click', closeSheet);
    document.getElementById('pinSheet').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeSheet();
    });
    document.getElementById('sheetNavBtn').addEventListener('click', () => {
      if (activePin) startNav(activePin);
    });
    document.getElementById('sheetPlayBtn').addEventListener('click', async () => {
      if (!activePin) return;
      const blob = await VoiceMapDB.getAudio(activePin.id);
      if (blob) AudioManager.playBlob(blob).catch(() => {});
    });

    // Stop nav
    document.getElementById('stopNavBtn').addEventListener('click', stopNav);

    // Search
    bindSearch();

    // Place info sheet
    document.getElementById('placeClose').addEventListener('click', closePlaceSheet);
    document.getElementById('placeSheet').addEventListener('click', e => {
      if (e.target === e.currentTarget) closePlaceSheet();
    });
    document.getElementById('placeNavBtn').addEventListener('click', () => {
      if (placeLat === null) return;
      const name = document.getElementById('placeTitle').textContent;
      closePlaceSheet();
      startNav({ lat: placeLat, lng: placeLng, name });
    });

    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => switchPage(item.dataset.page));
    });

    // Home page action buttons
    document.getElementById('homeGoMap').addEventListener('click',   () => switchPage('map'));
    document.getElementById('homeGoVoice').addEventListener('click', () => switchPage('voicemap'));
  }

  /* ── Page switching ──────────────────────────────────────── */
  function switchPage(page) {
    currentPage = page;
    const isHome    = page === 'home';
    const isVoice   = page === 'voicemap';
    const isMapPage = !isHome;

    // Home overlay
    document.getElementById('pageHome').classList.toggle('page-out', !isHome);

    // Map UI (both map pages)
    document.getElementById('topBar').classList.toggle('hidden', isHome);
    document.getElementById('locateBtn').classList.toggle('hidden', isHome);
    document.getElementById('layerToggle').classList.toggle('hidden', isHome);
    document.querySelector('.fab').classList.toggle('hidden', isHome);

    // Row1 (logo + GPS) — voice map only
    document.getElementById('topBarRow1').classList.toggle('hidden', !isVoice);

    // Voice-map-only elements
    document.getElementById('menuToggle').classList.toggle('hidden', !isVoice);
    document.getElementById('leftOverlay').classList.toggle('hidden', !isVoice);
    document.getElementById('leftPanel').classList.toggle('hidden', !isVoice);
    document.getElementById('bottomPanel').classList.toggle('hidden', !isVoice);

    // Voice pin markers on map
    pinMarkers.forEach(marker => {
      if (isVoice) {
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });

    // Close panels when leaving voice map
    if (!isVoice) {
      closeSheet();
      MenuManager.close();
      if (NavManager.isNavigating) stopNav();
    }

    // Close place sheet when going home
    if (isHome) closePlaceSheet();

    // Update search results position after layout changes
    if (isMapPage) {
      setTimeout(() => {
        const tb = document.getElementById('topBar');
        const sr = document.getElementById('searchResults');
        sr.style.top = (tb.getBoundingClientRect().bottom + 4) + 'px';
        map.invalidateSize();
        if (userLat !== null) map.setView([userLat, userLng], map.getZoom());
      }, 50);
    }

    // Nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    if (isHome) updateHomeStats();
  }

  /* ── Home page stats ─────────────────────────────────────── */
  function updateHomeStats() {
    document.getElementById('homePinCount').textContent  = pins.length;
    const history = VisitHistory.getAll();
    document.getElementById('homeVisitCount').textContent = history.length;

    const list = document.getElementById('homeRecentList');
    if (!history.length) {
      list.innerHTML = '<div class="home-recent-empty">ยังไม่มีประวัติการเดินทาง<br>ออกเดินทางแล้วบันทึกอัตโนมัติ</div>';
      return;
    }
    list.innerHTML = history.slice(0, 5).map(entry => {
      const diff = Date.now() - entry.visitedAt;
      let when;
      if (diff < 60_000)       when = 'เพิ่งเยี่ยมชม';
      else if (diff < 3_600_000) when = `${Math.floor(diff/60_000)} นาทีที่แล้ว`;
      else if (diff < 86_400_000) when = `${Math.floor(diff/3_600_000)} ชั่วโมงที่แล้ว`;
      else when = new Date(entry.visitedAt).toLocaleDateString('th-TH', { day:'numeric', month:'short' });
      return `<div class="home-recent-item">
        <span class="home-recent-icon">📍</span>
        <div class="home-recent-body">
          <div class="home-recent-name">${_esc(entry.pinName)}</div>
          <div class="home-recent-time">${when}</div>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Place Info Sheet (OSM POI) ─────────────────────────── */
  async function onMapClick(e) {
    closeSheet();
    _placeSheetLoading();

    const { lat, lng } = e.latlng;
    const elements = await PlaceInfo.fetchNearby(lat, lng, 30);
    const el = PlaceInfo.closest(elements, lat, lng);

    if (!el) {
      closePlaceSheet();
      return;
    }
    _populatePlaceSheet(el);
  }

  function _placeSheetLoading() {
    document.getElementById('gmapsFrame').src = '';
    document.getElementById('placePhotoPanel').classList.add('hidden');
    document.getElementById('placePhoto').src = '';
    document.getElementById('placeCategoryBadge').textContent = '';
    document.getElementById('placeTitle').textContent = '';
    document.getElementById('placeInfoList').innerHTML =
      '<div class="place-loading"><div class="place-spinner"></div>กำลังค้นหาข้อมูล…</div>';
    document.getElementById('placeNavBtn').style.display = 'none';
    document.getElementById('placeMapsLink').style.display = 'none';
    document.getElementById('placeSheet').classList.add('show');
  }

  function _populatePlaceSheet(el) {
    const tags = el.tags || {};
    const pos  = PlaceInfo.getLatLng(el);
    placeLat = pos?.lat ?? null;
    placeLng = pos?.lng ?? null;

    /* Place pin on map */
    if (placeLat !== null) _placeSelectedPin(placeLat, placeLng);

    document.getElementById('placeCategoryBadge').textContent = PlaceInfo.categoryLabel(tags);
    const name = tags['name:th'] || tags.name || '(ไม่ระบุชื่อ)';
    document.getElementById('placeTitle').textContent = name;

    /* Google Maps iframe */
    if (placeLat !== null) {
      const q = name !== '(ไม่ระบุชื่อ)'
        ? `${encodeURIComponent(name)}+${placeLat},${placeLng}`
        : `${placeLat},${placeLng}`;
      document.getElementById('gmapsFrame').src =
        `https://maps.google.com/maps?q=${q}&z=17&output=embed&hl=th`;
    }

    /* Info rows */
    const rows = [];
    const addr = PlaceInfo.formatAddress(tags);
    if (addr) rows.push({ icon: '📍', text: addr });
    if (tags.phone) rows.push({ icon: '📞', text: tags.phone, href: `tel:${tags.phone.replace(/\s/g,'')}` });
    if (tags['opening_hours']) rows.push({ icon: '🕐', text: tags['opening_hours'] });
    if (tags.website) rows.push({ icon: '🌐', text: 'เว็บไซต์', href: tags.website });

    document.getElementById('placeInfoList').innerHTML = rows.map(r =>
      `<div class="place-info-row">
         <span class="place-info-icon">${r.icon}</span>
         <span class="place-info-text">${r.href
           ? `<a href="${_esc(r.href)}" target="_blank" rel="noopener">${_esc(r.text)}</a>`
           : _esc(r.text)}</span>
       </div>`
    ).join('');

    /* Buttons */
    const navBtn   = document.getElementById('placeNavBtn');
    const mapsLink = document.getElementById('placeMapsLink');
    navBtn.style.display   = 'inline-flex';
    mapsLink.style.display = 'inline-flex';
    if (placeLat !== null) {
      mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${placeLat},${placeLng}`;
    }

    /* Photo (async) */
    const photoPanel = document.getElementById('placePhotoPanel');
    const photoImg   = document.getElementById('placePhoto');
    photoPanel.classList.add('hidden');
    photoImg.src = '';
    PlaceInfo.getPlacePhoto(tags).then(url => {
      if (!url) return;
      photoImg.onload  = () => photoPanel.classList.remove('hidden');
      photoImg.onerror = () => {};
      photoImg.src = url;
    });

    document.getElementById('placeSheet').classList.add('show');
  }

  function _placeSelectedPin(lat, lng) {
    const ll = [lat, lng];
    if (selectedLocMarker) {
      selectedLocMarker.setLatLng(ll);
    } else {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40" class="sel-pin-svg">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#e53e3e" stroke="#fff" stroke-width="1.5"/>
        <circle cx="14" cy="14" r="6" fill="#fff"/>
      </svg>`;
      const icon = L.divIcon({ className: '', html: svg, iconSize: [28, 40], iconAnchor: [14, 40] });
      selectedLocMarker = L.marker(ll, { icon, zIndexOffset: 800 }).addTo(map);
    }
  }

  function closePlaceSheet() {
    document.getElementById('placeSheet').classList.remove('show');
    document.getElementById('gmapsFrame').src = '';
    document.getElementById('placePhotoPanel').classList.add('hidden');
    document.getElementById('placePhoto').src = '';
    if (selectedLocMarker) { map.removeLayer(selectedLocMarker); selectedLocMarker = null; }
    placeLat = null; placeLng = null;
  }

  /* ── Place Search (Nominatim) ───────────────────────────── */
  let _searchTimer = null;

  function bindSearch() {
    const input   = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    const results  = document.getElementById('searchResults');

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn.classList.toggle('hidden', !q);
      clearTimeout(_searchTimer);
      if (!q) { results.classList.add('hidden'); return; }
      _searchTimer = setTimeout(() => _doSearch(q), 420);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.add('hidden');
      results.classList.add('hidden');
      input.focus();
    });

    document.addEventListener('click', e => {
      const bar = document.getElementById('topBar');
      const res = document.getElementById('searchResults');
      if (!bar.contains(e.target) && !res.contains(e.target))
        results.classList.add('hidden');
    });
  }

  async function _doSearch(query) {
    const results = document.getElementById('searchResults');
    results.innerHTML = '<div class="search-result-empty">กำลังค้นหา…</div>';
    results.classList.remove('hidden');

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=th`;
      const res  = await fetch(url, { headers: { 'User-Agent': 'VoiceMap/1.0' } });
      const data = await res.json();

      if (!data.length) {
        results.innerHTML = '<div class="search-result-empty">ไม่พบสถานที่</div>';
        return;
      }

      results.innerHTML = data.map((r, i) => {
        const parts = r.display_name.split(',');
        const name  = parts[0].trim();
        const addr  = parts.slice(1, 3).join(',').trim();
        return `<div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}">
          <span class="search-result-icon">${_searchIcon(r.class)}</span>
          <div class="search-result-body">
            <div class="search-result-name">${_esc(name)}</div>
            ${addr ? `<div class="search-result-addr">${_esc(addr)}</div>` : ''}
          </div>
        </div>`;
      }).join('');

      results.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const lat = parseFloat(item.dataset.lat);
          const lon = parseFloat(item.dataset.lon);
          map.flyTo([lat, lon], 17, { duration: 1.2 });
          document.getElementById('searchInput').value =
            item.querySelector('.search-result-name').textContent;
          document.getElementById('searchClear').classList.remove('hidden');
          results.classList.add('hidden');
        });
      });
    } catch {
      results.innerHTML = '<div class="search-result-empty">เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</div>';
    }
  }

  function _searchIcon(cls) {
    const icons = { amenity:'🏪', tourism:'🏛️', shop:'🛒', natural:'🌿', highway:'🛣️', place:'📍', building:'🏢' };
    return icons[cls] || '📌';
  }

  /* ── Utilities ───────────────────────────────────────────── */
  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
  function setEl(id, display) { const el = document.getElementById(id); if (el) el.style.display = display; }
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  return { init };
})();

/* ── Entry point ─────────────────────────────────────────── */
(async () => { try { await App.init(); } catch(e) { console.error(e); } })();
