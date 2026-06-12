/* ============================================================
   nav.js – Navigation: OSRM routing, route-accurate distance,
            Thai voice guidance, turn-by-turn steps
   ============================================================ */

const NavManager = (() => {
  let _map = null;
  let routeLayer = null, arrowLayer = null, bgLayer = null, destMarker = null;

  let isNavigating    = false;
  let destination     = null;
  let _routeCoords    = null;   // [[lat,lng], …] full route geometry
  let _routeSegLens   = null;   // precomputed segment lengths (metres)
  let _totalRouteDist = 0;      // total route length from segment sums
  let _steps          = [];
  let _currentStepIdx = 0;
  let _routeUpdating  = false;
  let _lastRouteLat   = null;
  let _lastRouteLng   = null;
  let _lastSpeakTime  = 0;
  let _arrived        = false;

  function init(map) { _map = map; }

  /* ── Start navigation ──────────────────────────────────────── */
  async function startNavigation(fromLat, fromLng, pin) {
    stopNavigation();
    isNavigating  = true;
    destination   = pin;
    _lastRouteLat = fromLat;
    _lastRouteLng = fromLng;

    _addDestMarker(pin.lat, pin.lng);

    let routeInfo;
    try {
      routeInfo = await _fetchOSRM(fromLat, fromLng, pin.lat, pin.lng);
    } catch {
      routeInfo = {
        coords:   [[fromLat, fromLng], [pin.lat, pin.lng]],
        distance: haversine(fromLat, fromLng, pin.lat, pin.lng),
        duration: null,
        steps:    []
      };
    }

    _setRoute(routeInfo);
    _drawRoute(_routeCoords, _steps.length === 0);

    if (_routeCoords.length >= 2)
      _map.fitBounds(L.latLngBounds(_routeCoords), { padding: [70, 70] });

    setTimeout(() => {
      const txt = _steps.length > 0
        ? _stepText(_steps[0], null)
        : `เริ่มการนำทาง ระยะทาง ${fmtDist(routeInfo.distance)}`;
      _speak(txt);
    }, 900);

    return { distance: routeInfo.distance, duration: routeInfo.duration };
  }

  /* ── Refresh route every ≥ 20 m of movement ───────────────── */
  async function updateRoute(lat, lng) {
    if (!isNavigating || !destination || _routeUpdating || _arrived) return;

    const moved = _lastRouteLat !== null
      ? haversine(lat, lng, _lastRouteLat, _lastRouteLng) : Infinity;
    if (moved < 20) return;

    _routeUpdating = true;
    _lastRouteLat  = lat;
    _lastRouteLng  = lng;

    [routeLayer, arrowLayer, bgLayer].forEach(l => { if (l) _map.removeLayer(l); });
    routeLayer = arrowLayer = bgLayer = null;

    try {
      const info = await _fetchOSRM(lat, lng, destination.lat, destination.lng);
      _setRoute(info);
      _drawRoute(_routeCoords);
    } catch {
      /* Keep old coords if refetch fails */
    } finally {
      _routeUpdating = false;
    }
  }

  /* ── Store route + precompute segment lengths ──────────────── */
  function _setRoute(info) {
    _routeCoords    = info.coords;
    _steps          = info.steps;
    _currentStepIdx = 0;

    // Precompute each segment length once
    _routeSegLens = [];
    _totalRouteDist = 0;
    for (let i = 0; i < _routeCoords.length - 1; i++) {
      const d = haversine(
        _routeCoords[i][0],   _routeCoords[i][1],
        _routeCoords[i+1][0], _routeCoords[i+1][1]
      );
      _routeSegLens.push(d);
      _totalRouteDist += d;
    }
  }

  /* ── Called on every GPS fix → returns display data ───────── */
  function checkAndUpdate(userLat, userLng) {
    if (!isNavigating || !destination) return null;

    const distToDest = haversine(userLat, userLng, destination.lat, destination.lng);

    // Arrival
    if (distToDest < 15 && !_arrived) {
      _arrived = true;
      _speak('ถึงจุดหมายแล้ว');
      return { remainDist: 0, instruction: 'ถึงจุดหมายแล้ว', arrow: '🏁', arrived: true };
    }

    // Don't compute distance until route coords are ready
    if (!_routeCoords) return { remainDist: null, instruction: '', arrow: '↑', arrived: false };

    // Remaining distance: pure segment-projection (no GPS accumulation)
    const remainDist = _remainingDist(userLat, userLng);

    // Step tracking + voice
    let instruction = '', arrow = '↑';

    if (_steps.length > 0 && _currentStepIdx < _steps.length) {
      const step = _steps[_currentStepIdx];
      const [sLng, sLat] = step.location;
      const distToStep   = haversine(userLat, userLng, sLat, sLng);

      if (distToStep < 8) {
        _currentStepIdx = Math.min(_currentStepIdx + 1, _steps.length - 1);
      } else {
        arrow       = _stepArrow(step.modifier, step.maneuver);
        instruction = _stepText(step, distToStep);

        const now = Date.now();
        if (now - _lastSpeakTime > 9000) {
          if (distToStep < 55 || (distToStep < 210 && distToStep > 160)) {
            _lastSpeakTime = now;
            _speak(_stepText(step, distToStep));
          }
        }
      }
    }

    return { remainDist, instruction, arrow, arrived: false };
  }

  /* ── Remaining distance via segment projection ─────────────────
     Projects user position onto each segment (not just nearest
     vertex) → sums haversine from projected point to route end.
     Uses precomputed segment lengths for speed.                  */
  function _remainingDist(userLat, userLng) {
    if (!_routeCoords || _routeCoords.length < 2)
      return destination ? haversine(userLat, userLng, destination.lat, destination.lng) : null;

    let bestD = Infinity, bestSeg = 0, bestT = 0;

    for (let i = 0; i < _routeCoords.length - 1; i++) {
      const [aLat, aLng] = _routeCoords[i];
      const [bLat, bLng] = _routeCoords[i + 1];

      const dx = bLat - aLat, dy = bLng - aLng;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 1e-20) {
        t = ((userLat - aLat) * dx + (userLng - aLng) * dy) / lenSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }

      const projLat = aLat + t * dx;
      const projLng = aLng + t * dy;
      const d = haversine(userLat, userLng, projLat, projLng);

      if (d < bestD) { bestD = d; bestSeg = i; bestT = t; }
    }

    // Distance from projected point to end of its segment
    const [aLat, aLng] = _routeCoords[bestSeg];
    const [bLat, bLng] = _routeCoords[bestSeg + 1];
    const projLat = aLat + bestT * (bLat - aLat);
    const projLng = aLng + bestT * (bLng - aLng);

    let total = haversine(projLat, projLng, bLat, bLng);

    // Add precomputed lengths of all subsequent segments
    for (let i = bestSeg + 1; i < _routeSegLens.length; i++)
      total += _routeSegLens[i];

    return total;
  }

  /* ── TTS ─────────────────────────────────────────────────────── */
  function _speak(text) {
    if (!window.speechSynthesis || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'th-TH'; u.rate = 0.92; u.volume = 1;
    speechSynthesis.speak(u);
  }

  /* ── Thai turn instruction ───────────────────────────────────── */
  function _stepText(step, dist) {
    const dStr = dist != null
      ? (dist < 1000 ? `อีก ${Math.round(dist)} เมตร` : `อีก ${(dist/1000).toFixed(1)} กม.`)
      : '';
    const road = step.name ? ` เข้า${step.name}` : '';
    const mod  = step.modifier || '', type = step.maneuver;

    if (type === 'depart') return `เริ่มการนำทาง${road}`;
    if (type === 'arrive') return 'ถึงจุดหมายแล้ว';
    if (type === 'turn') {
      if (mod === 'right')        return `${dStr} เลี้ยวขวา${road}`;
      if (mod === 'left')         return `${dStr} เลี้ยวซ้าย${road}`;
      if (mod === 'sharp right')  return `${dStr} เลี้ยวขวาคม${road}`;
      if (mod === 'sharp left')   return `${dStr} เลี้ยวซ้ายคม${road}`;
      if (mod === 'slight right') return `${dStr} เฉียงขวา${road}`;
      if (mod === 'slight left')  return `${dStr} เฉียงซ้าย${road}`;
      if (mod === 'uturn')        return `${dStr} กลับรถ`;
    }
    if (type === 'new name' || type === 'continue')
      return dStr ? `${dStr} ตรงไป${road}` : `ตรงไป${road}`;
    if (type === 'merge')           return `${dStr} รวมช่องทาง${road}`;
    if (type === 'on ramp')         return `${dStr} ขึ้นทางด่วน`;
    if (type === 'off ramp')        return `${dStr} ลงทางด่วน`;
    if (type === 'fork')
      return mod.includes('right') ? `${dStr} แยกทางขวา` : `${dStr} แยกทางซ้าย`;
    if (type === 'end of road')
      return mod.includes('right') ? `${dStr} สิ้นสุดถนน เลี้ยวขวา` : `${dStr} สิ้นสุดถนน เลี้ยวซ้าย`;
    if (type === 'roundabout' || type === 'rotary') return `${dStr} เข้าวงเวียน`;
    if (type === 'exit roundabout' || type === 'exit rotary') return `${dStr} ออกจากวงเวียน`;
    return dStr ? `${dStr} ตรงไป` : 'ตรงไป';
  }

  /* ── Direction arrow ────────────────────────────────────────── */
  function _stepArrow(modifier, type) {
    if (type === 'arrive') return '🏁';
    if (type === 'roundabout' || type === 'rotary') return '↻';
    const m = { 'uturn':'↩','sharp left':'↰','left':'←','slight left':'↖',
                'straight':'↑','slight right':'↗','right':'→','sharp right':'↱' };
    return m[modifier || 'straight'] || '↑';
  }

  /* ── Destination flag ───────────────────────────────────────── */
  function _addDestMarker(lat, lng) {
    if (destMarker) { _map.removeLayer(destMarker); destMarker = null; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40" width="28" height="46"
      style="filter:drop-shadow(0 2px 5px rgba(0,0,0,.55))">
      <line x1="5" y1="1" x2="5" y2="40" stroke="#e53e3e" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M5 2 L23 9 L5 22 Z" fill="#e53e3e"/>
      <circle cx="5" cy="40" r="3" fill="#e53e3e"/>
    </svg>`;
    const icon = L.divIcon({ className: '', html: svg, iconSize: [28, 46], iconAnchor: [5, 46] });
    destMarker = L.marker([lat, lng], { icon, zIndexOffset: 900 }).addTo(_map);
  }

  /* ── OSRM fetch with steps ──────────────────────────────────── */
  async function _fetchOSRM(lat1, lng1, lat2, lng2) {
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}`
              + `?overview=full&geometries=geojson&steps=true`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res  = await fetch(url, { signal: ctrl.signal });
      const data = await res.json();
      if (!data.routes?.length) throw new Error('no route');
      const r = data.routes[0];

      // Sanity check: OSRM distance must not exceed 10× straight-line distance
      // (handles routing failures / being snapped to a road far away)
      const straight = haversine(lat1, lng1, lat2, lng2);
      if (r.distance > Math.max(straight * 10, 5000) && r.distance > 50_000)
        throw new Error('route too long');

      const steps = (r.legs?.[0]?.steps || []).map(s => ({
        distance: s.distance,
        name:     s.name || '',
        maneuver: s.maneuver?.type     || 'continue',
        modifier: s.maneuver?.modifier || 'straight',
        location: s.maneuver?.location || [lng2, lat2]
      }));
      return {
        coords:   r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: r.distance,
        duration: r.duration,
        steps
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── Draw route + arrows ────────────────────────────────────── */
  function _drawRoute(coords, dashed = false) {
    bgLayer = L.polyline(coords, {
      color: '#818cf8', weight: 14, opacity: .2,
      lineCap: 'round', lineJoin: 'round'
    }).addTo(_map);

    routeLayer = L.polyline(coords, {
      color: '#4f46e5', weight: 6, opacity: .92,
      dashArray: dashed ? '12 8' : null,
      lineCap: 'round', lineJoin: 'round'
    }).addTo(_map);

    if (typeof L.polylineDecorator !== 'undefined') {
      arrowLayer = L.polylineDecorator(routeLayer, {
        patterns: [{ offset: '6%', repeat: '60px',
          symbol: L.Symbol.arrowHead({
            pixelSize: 14, polygon: true,
            pathOptions: { stroke: true, color: '#c7d2fe', weight: 1,
                           fillColor: '#4f46e5', fillOpacity: 1, opacity: 1 }
          })
        }]
      }).addTo(_map);
    }
  }

  /* ── Stop navigation ────────────────────────────────────────── */
  function stopNavigation() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    [routeLayer, arrowLayer, bgLayer, destMarker].forEach(l => { if (l) _map.removeLayer(l); });
    routeLayer = arrowLayer = bgLayer = destMarker = null;
    isNavigating    = false;
    destination     = null;
    _routeCoords    = null;
    _routeSegLens   = null;
    _totalRouteDist = 0;
    _steps          = [];
    _currentStepIdx = 0;
    _routeUpdating  = false;
    _lastRouteLat   = null;
    _lastRouteLng   = null;
    _arrived        = false;
  }

  /* ── Haversine ──────────────────────────────────────────────── */
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6_371_000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function fmtDist(m) {
    if (m == null) return '–';
    return m < 1000 ? `${Math.round(m)} ม.` : `${(m/1000).toFixed(1)} กม.`;
  }

  function fmtTime(s) {
    if (s == null) return '–';
    const m = Math.round(s / 60);
    return m < 60 ? `${m} นาที` : `${Math.floor(m/60)} ชม. ${m % 60} นาที`;
  }

  return {
    get isNavigating() { return isNavigating; },
    get destination()  { return destination; },
    init, startNavigation, stopNavigation, updateRoute, checkAndUpdate, haversine, fmtDist, fmtTime
  };
})();
