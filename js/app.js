/* ============================================================
   app.js – User-facing map application
   ============================================================ */

const App = (() => {
  /* State */
  let map, userMarker, accCircle;
  let watchId = null;
  let userLat = null, userLng = null, userAcc = Infinity;
  let _nfcLock = false;  // ป้องกัน GPS override ตำแหน่ง NFC pin
  let pins = [];
  const pinMarkers = new Map();
  const triggered = new Set();   // pins already triggered this visit
  const PROX_M  = 50;            // trigger radius (metres)
  const AWAY_M  = 120;           // reset radius (metres)
  let activePin = null;
  let placeLat = null, placeLng = null;
  let selectedLocMarker = null;
  let streetLayer = null, satLayer = null, satLabelLayer = null, isSatellite = true;
  let currentPage = 'home';
  let _searchTimer = null;
  let _searchAbort = null;
  const _searchCache = new Map();

  /* ── Boot ────────────────────────────────────────────────── */
  async function init() {
    I18n.apply();   // apply saved language before anything renders
    await VoiceMapDB.init();
    await SeedData.run();

    // จำกัดแผนที่เฉพาะจังหวัดขอนแก่น
    const KKN_BOUNDS = L.latLngBounds([15.45, 101.55], [17.10, 103.25]);

    map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      maxBounds: KKN_BOUNDS,
      maxBoundsViscosity: 1.0,
      minZoom: 9,
    }).setView([16.4322, 102.8236], 11);

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

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: '© OSM' }).addTo(map);

    NavManager.init(map);
    MenuManager.init();

    loadPins();
    startTracking();
    bindUI();
    map.on('click', onMapClick);

    /* Re-apply translations whenever language changes */
    document.addEventListener('langchange', () => {
      I18n.apply();
      _refreshDynamicText();
    });

    switchPage('map');

    // NFC deep link: ?pin=pin_seed_XXX
    const _nfcId = new URLSearchParams(window.location.search).get('pin');
    if (_nfcId) {
      const _nfcPin = PinStorage.getAll().find(p => p.id === _nfcId);
      if (_nfcPin) {
        _nfcLock = true;
        map.setView([_nfcPin.lat, _nfcPin.lng], 17);
        setTimeout(() => showPinSheet(_nfcPin), 600);
        setTimeout(() => { _nfcLock = false; }, 6000);
      }
    }
  }

  function _refreshDynamicText() {
    /* GPS status */
    if (userLat === null) setText('statusText', I18n.t('gps.searching'));
    /* Play button state (if sheet is open) */
    const playBtn = document.getElementById('sheetPlayBtn');
    if (playBtn.dataset.playing === '1') {
      playBtn.textContent = I18n.t('sheet.playing');
    } else if (playBtn.style.display !== 'none') {
      playBtn.textContent = I18n.t('sheet.play');
    }
    /* Home stats if visible */
    if (currentPage === 'home') updateHomeStats();
  }

  /* ── Pins ────────────────────────────────────────────────── */
  function loadPins() {
    pins = PinStorage.getAll();
    pins.forEach(addMarker);
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

    if (currentPage !== 'home') m.addTo(map);
    pinMarkers.set(pin.id, m);
  }

  /* ── GPS ─────────────────────────────────────────────────── */
  function startTracking() {
    if (!navigator.geolocation) {
      setText('statusText', I18n.t('gps.no_support'));
      return;
    }
    setText('statusText', I18n.t('gps.searching'));
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
    const msgs = { 1: I18n.t('gps.no_permission'), 2: I18n.t('gps.no_signal'), 3: I18n.t('gps.timeout') };
    setText('statusText', msgs[err?.code] || I18n.t('gps.error'));
    if (err?.code === 1) toast(I18n.t('toast.gps_perm'));
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
      if (currentPage !== 'home' && !_nfcLock) map.setView(ll, 17);
    } else {
      userMarker.setLatLng(ll);
      accCircle.setLatLng(ll).setRadius(acc);
    }
  }

  /* ── Proximity detection ─────────────────────────────────── */
  function checkProximity(lat, lng) {
    if (currentPage === 'home' || currentPage === 'settings') return;
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

    const poemEl = document.getElementById('sheetPoem');
    if (pin.poem) {
      document.getElementById('sheetPoemText').textContent = pin.poem;
      poemEl.classList.remove('hidden');
    } else {
      poemEl.classList.add('hidden');
    }

    const distEl = document.getElementById('sheetDist');
    if (userLat !== null) {
      distEl.textContent = NavManager.fmtDist(NavManager.haversine(userLat, userLng, pin.lat, pin.lng));
    } else {
      distEl.textContent = '–';
    }

    // Reset play button to loading state while we check for audio
    const playBtn = document.getElementById('sheetPlayBtn');
    _resetPlayBtn(playBtn);
    playBtn.textContent = '⏳';
    playBtn.style.display = 'inline-flex';
    playBtn.disabled = true;

    VoiceMapDB.hasAudio(pin.id).then(has => {
      if (activePin?.id !== pin.id) return; // sheet was replaced before check finished
      if (has) {
        playBtn.textContent = '🔊 ฟังเสียง';
        playBtn.disabled = false;
      } else {
        playBtn.style.display = 'none';
      }
    });

    document.getElementById('pinSheet').classList.add('show');
    map.panTo([pin.lat, pin.lng]);
  }

  function _resetPlayBtn(btn) {
    AudioManager.stopPlayback();
    btn = btn || document.getElementById('sheetPlayBtn');
    btn.textContent = '🔊 ฟังเสียง';
    btn.disabled = false;
    btn.dataset.playing = '';
  }

  function closeSheet() {
    _resetPlayBtn();
    document.getElementById('pinSheet').classList.remove('show');
    activePin = null;
  }

  /* ── Navigation ──────────────────────────────────────────── */
  async function startNav(pin) {
    if (!userLat) { toast(I18n.t('toast.no_gps')); return; }
    if (userAcc > 150) { toast(I18n.t('toast.gps_acc', Math.round(userAcc))); return; }
    closeSheet();

    // Show nav panel + cancel button
    document.getElementById('bottomPanel').classList.remove('hidden');
    document.getElementById('cancelNavBtn').classList.remove('hidden');

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
    document.getElementById('bottomPanel').classList.add('hidden');
    document.getElementById('cancelNavBtn').classList.add('hidden');
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

  /* ── UI bindings ─────────────────────────────────────────── */
  function bindUI() {
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
        toast(I18n.t('toast.searching'));
        _startWatch();
      }
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
      const btn = document.getElementById('sheetPlayBtn');

      // Toggle: stop if already playing
      if (btn.dataset.playing === '1') {
        _resetPlayBtn(btn);
        return;
      }

      btn.textContent = '⏳ กำลังโหลด…';
      btn.disabled = true;

      const blob = await VoiceMapDB.getAudio(activePin.id);
      if (!blob) { btn.textContent = '🔊 ฟังเสียง'; btn.disabled = false; return; }

      btn.textContent = '⏸️ หยุดเล่น';
      btn.dataset.playing = '1';
      btn.disabled = false;

      try {
        const audio = await AudioManager.playBlob(blob);
        if (audio) {
          audio.addEventListener('ended', () => {
            if (btn.dataset.playing === '1') {
              btn.textContent = '🔊 ฟังเสียง';
              btn.dataset.playing = '';
            }
          });
        }
      } catch {
        btn.textContent = '🔊 ฟังเสียง';
        btn.dataset.playing = '';
        btn.disabled = false;
      }
    });

    // Stop nav
    document.getElementById('stopNavBtn').addEventListener('click', stopNav);
    document.getElementById('cancelNavBtn').addEventListener('click', stopNav);


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

    // Language buttons in settings
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => I18n.setLang(btn.dataset.lang));
    });

    bindSearch();
    initSurprise();
  }

  /* ── Page switching ──────────────────────────────────────── */
  function switchPage(page) {
    currentPage = page;
    const isHome     = page === 'home';
    const isSettings = page === 'settings';
    const isMapPage  = !isHome && !isSettings;

    // Page overlays
    document.getElementById('pageHome').classList.toggle('page-out', !isHome);
    document.getElementById('pageSettings').classList.toggle('page-out', !isSettings);

    // Map UI (visible only on map pages)
    document.getElementById('topBar').classList.toggle('hidden', isHome || isSettings);
    document.getElementById('locateBtn').classList.toggle('hidden', isHome || isSettings);
    document.getElementById('layerToggle').classList.toggle('hidden', isHome || isSettings);
    document.getElementById('mapSearchWrap').classList.toggle('hidden', isHome || isSettings);

    // Row1 (logo + GPS) — all map pages
    document.getElementById('topBarRow1').classList.toggle('hidden', !isMapPage);

    // Menu / left panel — all map pages
    document.getElementById('menuToggle').classList.toggle('hidden', !isMapPage);
    document.getElementById('leftOverlay').classList.toggle('hidden', !isMapPage);
    document.getElementById('leftPanel').classList.toggle('hidden', !isMapPage);

    // Pin markers visible on all map pages (map + voicemap), hidden on home
    pinMarkers.forEach(marker => {
      if (isMapPage) {
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });

    // Close panels when leaving map pages
    if (!isMapPage) {
    }

    // Close panels when leaving map pages
    if (!isMapPage) {
      closeSheet();
      MenuManager.close();
      if (NavManager.isNavigating) stopNav();
    }

    // Close place sheet when going home or settings
    if (isHome || isSettings) closePlaceSheet();

    if (isMapPage) {
      setTimeout(() => {
        map.invalidateSize();
        if (userLat !== null) map.setView([userLat, userLng], map.getZoom());
      }, 50);
    }

    // Nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    if (isHome) updateHomeStats();
    /* Mark active lang button on settings page */
    if (isSettings) I18n.apply();
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
      if (diff < 60_000)          when = I18n.t('home.just_visited');
      else if (diff < 3_600_000)  when = I18n.t('home.min_ago', Math.floor(diff/60_000));
      else if (diff < 86_400_000) when = I18n.t('home.hr_ago',  Math.floor(diff/3_600_000));
      else {
        const loc = I18n.getLang() === 'en' ? 'en-US' : 'th-TH';
        when = new Date(entry.visitedAt).toLocaleDateString(loc, { day:'numeric', month:'short' });
      }
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


  /* ── Map Search (Nominatim) ──────────────────────────────── */
  function bindSearch() {
    const wrap    = document.getElementById('mapSearchWrap');
    const input   = document.getElementById('mapSearchInput');
    const clearBtn = document.getElementById('mapSearchClear');
    const results = document.getElementById('mapSearchResults');
    let   _focusIdx = -1;

    function _hideResults() {
      results.classList.add('hidden');
      _focusIdx = -1;
    }

    function _setFocus(idx) {
      const items = [...results.querySelectorAll('.map-search-item')];
      items.forEach((el, i) => el.classList.toggle('focused', i === idx));
      if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
      _focusIdx = idx;
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn.classList.toggle('hidden', !q);
      clearTimeout(_searchTimer);
      if (_searchAbort) { _searchAbort.abort(); _searchAbort = null; }
      _focusIdx = -1;

      if (q.length < 2) { _hideResults(); return; }

      if (_searchCache.has(q)) {
        _renderResults(_searchCache.get(q));
        return;
      }

      results.innerHTML = '<div class="map-search-msg"><span class="search-spin"></span>กำลังค้นหา…</div>';
      results.classList.remove('hidden');
      _searchTimer = setTimeout(() => _doSearch(q), 420);
    });

    input.addEventListener('keydown', e => {
      const items = [...results.querySelectorAll('.map-search-item')];
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault(); _setFocus(Math.min(_focusIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); _setFocus(Math.max(_focusIdx - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault(); if (_focusIdx >= 0) items[_focusIdx].click();
      } else if (e.key === 'Escape') {
        _hideResults(); input.blur();
      }
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2 && !results.classList.contains('hidden'))
        results.classList.remove('hidden');
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.add('hidden');
      _hideResults();
      input.focus();
    });

    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) _hideResults();
    });
  }

  async function _doSearch(q) {
    if (_searchAbort) _searchAbort.abort();
    _searchAbort = new AbortController();
    const signal  = _searchAbort.signal;
    const results = document.getElementById('mapSearchResults');
    const center  = _searchCenter();

    try {
      const variants = _queryVariants(q);

      // Phase 1 – ค้นหาเฉพาะรอบตำแหน่งปัจจุบัน (bounded, ~45 km)
      const nearbySettled = await Promise.allSettled(
        variants.map(v => _fetchNominatim(v, signal, center, 0.4, true))
      );
      if (signal.aborted) return;

      const seenIds = new Set();
      const nearby  = [];
      nearbySettled.forEach(r => {
        if (r.status !== 'fulfilled') return;
        r.value.forEach(item => {
          if (!seenIds.has(item.place_id)) { seenIds.add(item.place_id); nearby.push(item); }
        });
      });
      nearby.sort((a, b) => _textScore(b, q) - _textScore(a, q));

      // Phase 2 – ถ้าผลใกล้เคียงน้อยกว่า 4 → เพิ่มผลจากทั่วประเทศมาเติม
      let extra = [];
      if (nearby.length < 4) {
        const broadSettled = await Promise.allSettled(
          variants.map(v => _fetchNominatim(v, signal, center, 1.5, false))
        );
        if (signal.aborted) return;
        broadSettled.forEach(r => {
          if (r.status !== 'fulfilled') return;
          r.value.forEach(item => {
            if (!seenIds.has(item.place_id)) { seenIds.add(item.place_id); extra.push(item); }
          });
        });
        extra.sort((a, b) => _relevanceScore(b, q) - _relevanceScore(a, q));
      }

      // รวม: ใกล้เคียงก่อนเสมอ ตามด้วยไกล
      const merged = [...nearby, ...extra].slice(0, 8);

      if (!merged.length) {
        results.innerHTML = `<div class="map-search-msg">ไม่พบ "<b>${_esc(q)}</b>"<br><span class="search-hint">ลองพิมพ์ชื่อย่อ หรือเป็นภาษาอังกฤษ</span></div>`;
        return;
      }

      if (_searchCache.size >= 40) _searchCache.delete(_searchCache.keys().next().value);
      _searchCache.set(q, merged);
      _renderResults(merged);
    } catch (err) {
      if (err.name === 'AbortError') return;
      results.innerHTML = '<div class="map-search-msg">⚠️ เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง</div>';
    }
  }

  async function _fetchNominatim(q, signal, center, delta, bounded) {
    const vb = (center && delta)
      ? `&viewbox=${center.lng-delta},${center.lat+delta},${center.lng+delta},${center.lat-delta}`
        + `&bounded=${bounded ? 1 : 0}`
      : '';
    const lim = bounded ? 8 : 12;
    const url = `https://nominatim.openstreetmap.org/search`
              + `?q=${encodeURIComponent(q)}&format=json&limit=${lim}`
              + `&countrycodes=th&addressdetails=1&namedetails=1&accept-language=th`
              + vb;
    const res = await fetch(url, { signal });
    return res.json();
  }

  function _searchCenter() {
    if (userLat !== null) return { lat: userLat, lng: userLng };
    try { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }
    catch { return null; }
  }

  function _textScore(item, q) {
    const name = (item.name || '').toLowerCase();
    const qLow = q.toLowerCase();
    if (name === qLow)           return 100;
    if (name.startsWith(qLow))   return  90;
    if (name.includes(qLow))     return  75;
    const disp = item.display_name.toLowerCase();
    if (disp.includes(qLow))     return  55;
    let matched = 0, ni = 0;
    for (const ch of qLow) { const f = name.indexOf(ch, ni); if (f !== -1) { matched++; ni = f + 1; } }
    return matched > 0 ? Math.floor((matched / qLow.length) * 35) : 0;
  }

  function _queryVariants(q) {
    const variants = [q];
    const prefixes = [
      'โรงเรียน','โรงพยาบาล','มหาวิทยาลัย','วิทยาลัย',
      'วัด','พระธาตุ','ถนน','ซอย','สวน','ห้าง','ตลาด',
    ];

    // If query starts with a prefix → add stripped version
    for (const p of prefixes) {
      if (q.startsWith(p) && q.length > p.length + 1) {
        variants.push(q.slice(p.length).trim());
        break;
      }
    }

    // If query has no known prefix & is short → try with common prefixes
    const hasPrefix = prefixes.some(p => q.startsWith(p));
    if (!hasPrefix && q.length <= 12) {
      // Guess most likely prefix from common clues
      if (/วัด|ธาตุ|พระ|เจ/.test(q))    variants.push('วัด' + q);
      if (/โรง|รพ/.test(q))              variants.push('โรงพยาบาล' + q);
      if (/รร|เรียน/.test(q))            variants.push('โรงเรียน' + q);
    }

    return [...new Set(variants)].slice(0, 3);
  }

  function _relevanceScore(item, q) {
    const name  = (item.name || '').toLowerCase();
    const disp  = (item.display_name || '').toLowerCase();
    const alt   = Object.values(item.namedetails || {}).join(' ').toLowerCase();
    const qLow  = q.toLowerCase();

    let score = 0;
    if (name === qLow)           score = 100;
    else if (name.startsWith(qLow))  score =  90;
    else if (name.includes(qLow))    score =  75;
    else if (disp.includes(qLow))    score =  55;
    else if (alt.includes(qLow))     score =  40;
    else {
      // Sequential character match — how many chars of q appear in order in name
      let matched = 0, ni = 0;
      for (const ch of qLow) { const f = name.indexOf(ch, ni); if (f !== -1) { matched++; ni = f + 1; } }
      score = matched > 0 ? Math.floor((matched / qLow.length) * 35) : 0;
    }

    // Distance bonus — boost nearby results
    const iLat = parseFloat(item.lat), iLng = parseFloat(item.lon);
    if (!isNaN(iLat) && userLat !== null) {
      const dist = NavManager.haversine(userLat, userLng, iLat, iLng);
      if      (dist <  1_000) score += 35;
      else if (dist <  5_000) score += 25;
      else if (dist < 20_000) score += 15;
      else if (dist < 50_000) score +=  5;
    }

    return score;
  }

  function _renderResults(data) {
    const results = document.getElementById('mapSearchResults');
    results.innerHTML = data.map((item, i) => {
      const addr  = item.address || {};
      const name  = item.name
                 || addr.road || addr.suburb
                 || item.display_name.split(',')[0];
      const parts = [];
      if (addr.road    && addr.road    !== name) parts.push(addr.road);
      if (addr.suburb  && addr.suburb  !== name) parts.push(addr.suburb);
      const city = addr.city || addr.town || addr.village || addr.municipality;
      if (city)                                  parts.push(city);
      if (addr.province && addr.province !== city) parts.push(addr.province);
      const sub = parts.slice(0, 3).join(' · ');
      return `<div class="map-search-item" data-idx="${i}" role="option">
        <span class="map-search-item-icon">${_searchIcon(item.type, item.class)}</span>
        <div class="map-search-item-body">
          <div class="map-search-item-name">${_esc(name)}</div>
          ${sub ? `<div class="map-search-item-addr">${_esc(sub)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    results.classList.remove('hidden');

    results.querySelectorAll('.map-search-item').forEach(el => {
      el.addEventListener('click', () => {
        const item = data[+el.dataset.idx];
        map.flyTo([parseFloat(item.lat), parseFloat(item.lon)], 17, { duration: 1.2 });
        _placeSelectedPin(parseFloat(item.lat), parseFloat(item.lon));
        results.classList.add('hidden');
        document.getElementById('mapSearchInput').blur();
      });
    });
  }

  function _searchIcon(type, cls) {
    const amenity = {
      restaurant:'🍽️', cafe:'☕', food_court:'🍽️',
      school:'🏫', university:'🎓', kindergarten:'🏫',
      hospital:'🏥', clinic:'🏥', pharmacy:'💊',
      bank:'🏦', atm:'🏧', fuel:'⛽',
      place_of_worship:'🛕', temple:'🛕',
      hotel:'🏨', guest_house:'🏨',
      parking:'🅿️', police:'👮', fire_station:'🚒',
      supermarket:'🛒', marketplace:'🏪', convenience:'🏪',
      post_office:'📮', library:'📚', cinema:'🎬',
      bus_station:'🚌', ferry_terminal:'⛴️',
    };
    if (cls === 'amenity' && amenity[type]) return amenity[type];
    const clsMap = {
      highway:'🛣️', natural:'🌿', tourism:'🏛️',
      shop:'🛍️', leisure:'🌳', historic:'🏯',
      waterway:'💧', railway:'🚉', aeroway:'✈️',
      boundary:'📍', place:'🏙️',
    };
    return clsMap[cls] || '📍';
  }

  /* ── Utilities ───────────────────────────────────────────── */
  /* ── Surprise Me ─────────────────────────────────────────── */
  function initSurprise() {
    const overlay   = document.getElementById('surpriseOverlay');
    const card      = overlay.querySelector('.surprise-card');
    const closeBtn  = document.getElementById('surpriseClose');
    const rerollBtn = document.getElementById('surpriseRerollBtn');
    const goBtn     = document.getElementById('surpriseGoBtn');
    let currentPin  = null;

    document.getElementById('surpriseBtn').addEventListener('click', roll);
    closeBtn.addEventListener('click', hide);
    rerollBtn.addEventListener('click', roll);
    overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });

    goBtn.addEventListener('click', () => {
      hide();
      if (!currentPin) return;
      switchPage('map');
      map.flyTo([currentPin.lat, currentPin.lng], 16, { duration: 1.2 });
      setTimeout(() => showPinSheet(currentPin), 1300);
    });

    function roll() {
      const pins = PinStorage.getAll().filter(p => p.id.startsWith('pin_seed_'));
      if (!pins.length) return;
      // avoid repeating the same pin twice in a row if possible
      const pool = pins.length > 1 && currentPin
        ? pins.filter(p => p.id !== currentPin.id)
        : pins;
      currentPin = pool[Math.floor(Math.random() * pool.length)];

      document.getElementById('surpriseName').textContent = currentPin.name;
      document.getElementById('surpriseDesc').textContent = currentPin.description || '';

      const distEl     = document.getElementById('surpriseDist');
      const distTextEl = document.getElementById('surpriseDistText');
      if (userLat !== null) {
        const m = NavManager.haversine(userLat, userLng, currentPin.lat, currentPin.lng);
        distTextEl.textContent = `ห่างจากคุณ ${NavManager.fmtDist(m)}`;
        distEl.classList.remove('hidden');
      } else {
        distEl.classList.add('hidden');
      }

      overlay.classList.remove('hidden');
      // double-rAF ensures transition fires after display change
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
    }

    function hide() {
      card.classList.remove('show');
      setTimeout(() => overlay.classList.add('hidden'), 320);
    }
  }

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
