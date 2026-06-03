/* ============================================================
   app.js – User-facing map application
   ============================================================ */

const App = (() => {
  /* State */
  let map, userMarker, accCircle;
  let watchId = null;
  let userLat = null, userLng = null;
  let pins = [];
  const pinMarkers = new Map();
  const triggered = new Set();   // pins already triggered this visit
  const PROX_M  = 50;            // trigger radius (metres)
  const AWAY_M  = 120;           // reset radius (metres)
  let panelOpen = false;
  let activePin = null;
  let placeLat = null, placeLng = null;
  let poiLayer = null;
  let _poiTimer = null;
  let _poiLoading = false;

  /* ── Boot ────────────────────────────────────────────────── */
  async function init() {
    await VoiceMapDB.init();

    map = L.map('map', { zoomControl: false, attributionControl: false })
           .setView([13.7563, 100.5018], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: '© OSM' }).addTo(map);

    poiLayer = L.layerGroup().addTo(map);

    NavManager.init(map);
    MenuManager.init();

    loadPins();
    startTracking();
    bindUI();
    map.on('click', onMapClick);
    map.on('moveend', _schedulePOI);
    _schedulePOI();
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
               .addTo(map)
               .on('click', () => showPinSheet(pin));

    pinMarkers.set(pin.id, m);
  }

  /* ── GPS ─────────────────────────────────────────────────── */
  function startTracking() {
    if (!navigator.geolocation) {
      setText('statusText', 'ไม่รองรับ GPS');
      return;
    }
    setText('statusText', 'กำลังขอสิทธิ์ GPS…');

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(perm => {
        if (perm.state === 'denied') { _showGpsBanner(true); return; }
        _startWatch();
        perm.onchange = () => { if (perm.state === 'denied') _showGpsBanner(true); };
      }).catch(_startWatch);
    } else {
      _startWatch();
    }
  }

  function _startWatch() {
    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      onPosition, onGeoErr,
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }

  function onPosition(pos) {
    document.getElementById('gpsBanner').classList.remove('show');
    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
    userLat = lat; userLng = lng;

    updateUserMarker(lat, lng, acc);
    checkProximity(lat, lng);
    updateNavPanel(lat, lng);
    setText('statusText', `±${Math.round(acc)} ม.`);
    document.getElementById('statusDot').classList.add('active');
  }

  function onGeoErr(err) {
    const denied = err?.code === 1;
    const msgs = { 1: 'ไม่ได้รับสิทธิ์ GPS', 2: 'ไม่พบสัญญาณ GPS', 3: 'GPS หมดเวลา' };
    setText('statusText', msgs[err?.code] || 'GPS ผิดพลาด');
    if (denied) _showGpsBanner(true);
  }

  function _showGpsBanner(denied) {
    setText('gpsBannerTitle', denied ? 'ไม่ได้รับสิทธิ์ตำแหน่ง' : 'ต้องการตำแหน่งของคุณ');
    setText('gpsBannerSub', denied
      ? 'เปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์ แล้วกด "ลองใหม่"'
      : 'แตะ "อนุญาต" เพื่อดูตำแหน่งและสถานที่รอบคุณ');
    const btn = document.getElementById('gpsBannerBtn');
    btn.textContent = denied ? 'ลองใหม่' : 'อนุญาต';
    document.getElementById('gpsBanner').classList.add('show');
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
      map.setView(ll, 17);
    } else {
      userMarker.setLatLng(ll);
      accCircle.setLatLng(ll).setRadius(acc);
    }
  }

  /* ── Proximity detection ─────────────────────────────────── */
  function checkProximity(lat, lng) {
    pins.forEach(pin => {
      const d = NavManager.haversine(lat, lng, pin.lat, pin.lng);

      if (d <= PROX_M && !triggered.has(pin.id)) {
        triggered.add(pin.id);
        triggerAudio(pin, d);
      } else if (d > AWAY_M && triggered.has(pin.id)) {
        triggered.delete(pin.id);   // allow re-trigger when user returns
      }
    });
  }

  async function triggerAudio(pin, dist) {
    /* Record visit regardless of whether there is audio */
    VisitHistory.record(pin);
    MenuManager.onVisit();

    const blob = await VoiceMapDB.getAudio(pin.id);
    if (!blob) return;

    showNotif(pin, dist);

    try {
      await AudioManager.playBlob(blob);
    } catch {
      // Autoplay blocked – user can tap play in notification
      document.getElementById('notifPlayBtn').style.display = 'inline-block';
      document.getElementById('notifPlayBtn')._blob = blob;
    }
  }

  function showNotif(pin, dist) {
    setText('notifName', pin.name);
    setText('notifDist', NavManager.fmtDist(dist));
    document.getElementById('notifPlayBtn').style.display = 'none';

    const el = document.getElementById('audioNotif');
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 7000);
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
    setEl('panelDefault', 'block');
    setEl('panelNav', 'none');
    collapsePanel();
  }

  function updateNavPanel(lat, lng) {
    if (!NavManager.isNavigating) return;
    const d = NavManager.destination;
    if (!d) return;
    setText('navDist', NavManager.fmtDist(NavManager.haversine(lat, lng, d.lat, d.lng)));
  }

  /* ── Panel helpers ───────────────────────────────────────── */
  function expandPanel()  { document.getElementById('bottomPanel').classList.add('expanded');    panelOpen = true;  }
  function collapsePanel(){ document.getElementById('bottomPanel').classList.remove('expanded'); panelOpen = false; }

  /* ── UI bindings ─────────────────────────────────────────── */
  function bindUI() {
    // Panel handle toggle
    document.getElementById('panelHandle').addEventListener('click', () =>
      panelOpen ? collapsePanel() : expandPanel());

    // Center button
    document.getElementById('centerBtn').addEventListener('click', () => {
      if (userLat) map.setView([userLat, userLng], 17);
      else _showGpsBanner(false);
    });

    // GPS banner
    document.getElementById('gpsBannerBtn').addEventListener('click', () => {
      document.getElementById('gpsBanner').classList.remove('show');
      watchId = null;
      navigator.geolocation.getCurrentPosition(
        pos => { onPosition(pos); _startWatch(); },
        err => { onGeoErr(err); }
      );
    });
    document.getElementById('gpsBannerClose').addEventListener('click', () => {
      document.getElementById('gpsBanner').classList.remove('show');
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

    // Notification
    document.getElementById('notifClose').addEventListener('click', () => {
      document.getElementById('audioNotif').classList.remove('show');
      AudioManager.stopPlayback();
    });
    document.getElementById('notifPlayBtn').addEventListener('click', async function() {
      if (this._blob) {
        await AudioManager.playBlob(this._blob).catch(() => {});
        this.style.display = 'none';
      }
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
  }

  /* ── POI Markers ─────────────────────────────────────────── */
  function _schedulePOI() {
    clearTimeout(_poiTimer);
    _poiTimer = setTimeout(_loadPOI, 700);
  }

  async function _loadPOI() {
    if (map.getZoom() < 14 || _poiLoading) return;
    _poiLoading = true;
    const c = map.getCenter();

    /* Radius ≈ distance from center to corner of visible area, capped at 900 m */
    const bounds = map.getBounds();
    const cornerLat = bounds.getNorth(), cornerLng = bounds.getEast();
    const radius = Math.min(900, Math.round(NavManager.haversine(c.lat, c.lng, cornerLat, cornerLng) * 0.65));

    const elements = await PlaceInfo.fetchAround(c.lat, c.lng, radius);
    poiLayer.clearLayers();

    elements.forEach(el => {
      const pos = PlaceInfo.getLatLng(el);
      if (!pos) return;
      const tags  = el.tags || {};
      const emoji = PlaceInfo.poiIcon(tags);
      const color = PlaceInfo.poiColor(tags);
      const name  = (tags['name:th'] || tags.name || '').slice(0, 12);

      const icon = L.divIcon({
        className: '',
        html: `<div class="poi-pin">
                 <div class="poi-pin-dot" style="background:${color}">${emoji}</div>
                 ${name ? `<div class="poi-pin-label">${_esc(name)}</div>` : ''}
               </div>`,
        iconSize: [64, 52],
        iconAnchor: [32, 38]
      });

      L.marker([pos.lat, pos.lng], { icon, zIndexOffset: 100 })
       .on('click', e => { L.DomEvent.stopPropagation(e); closeSheet(); _populatePlaceSheet(el); })
       .addTo(poiLayer);
    });

    _poiLoading = false;
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
    document.getElementById('placePhotoWrap').classList.add('hidden');
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

    document.getElementById('placeCategoryBadge').textContent = PlaceInfo.categoryLabel(tags);
    document.getElementById('placeTitle').textContent =
      tags['name:th'] || tags.name || '(ไม่ระบุชื่อ)';

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

    /* Photo (async – non-blocking) */
    PlaceInfo.getWikiPhoto(tags).then(url => {
      if (!url) return;
      const wrap = document.getElementById('placePhotoWrap');
      document.getElementById('placePhoto').src = url;
      wrap.classList.remove('hidden');
    });
  }

  function closePlaceSheet() {
    document.getElementById('placeSheet').classList.remove('show');
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
