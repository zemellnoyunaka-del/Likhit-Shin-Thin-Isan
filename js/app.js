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
  let activePin = null;
  let placeLat = null, placeLng = null;
  let selectedLocMarker = null;
  let streetLayer = null, satLayer = null, satLabelLayer = null, isSatellite = true;
  let currentPage = 'home';

  /* ── Boot ────────────────────────────────────────────────── */
  async function init() {
    I18n.apply();   // apply saved language before anything renders
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
      if (currentPage !== 'home') map.setView(ll, 17);
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
