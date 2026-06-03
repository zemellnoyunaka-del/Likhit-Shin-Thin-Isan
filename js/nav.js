/* ============================================================
   nav.js – Route drawing with arrow decorators (OSRM + fallback)
   ============================================================ */

const NavManager = (() => {
  let _map = null;
  let routeLayer = null;
  let arrowLayer = null;
  let bgLayer = null;
  let isNavigating = false;
  let destination = null;

  function init(map) { _map = map; }

  async function startNavigation(fromLat, fromLng, pin) {
    stopNavigation();
    isNavigating = true;
    destination = pin;

    let routeInfo;
    try {
      routeInfo = await _fetchOSRM(fromLat, fromLng, pin.lat, pin.lng);
      _drawRoute(routeInfo.coords);
    } catch {
      // Fallback: straight dashed arrow line
      routeInfo = { coords: [[fromLat, fromLng], [pin.lat, pin.lng]], distance: null, duration: null };
      _drawRoute(routeInfo.coords, true);
    }

    if (routeInfo.coords.length >= 2) {
      _map.fitBounds(L.latLngBounds(routeInfo.coords), { padding: [70, 70] });
    }

    return { distance: routeInfo.distance, duration: routeInfo.duration };
  }

  async function _fetchOSRM(lat1, lng1, lat2, lng2) {
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const data = await res.json();
      clearTimeout(timer);
      if (!data.routes?.length) throw new Error('no route');
      const r = data.routes[0];
      return {
        coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: r.distance,
        duration: r.duration
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function _drawRoute(coords, dashed = false) {
    // Glow under-layer
    bgLayer = L.polyline(coords, {
      color: '#818cf8', weight: 12, opacity: .18,
      lineCap: 'round', lineJoin: 'round'
    }).addTo(_map);

    // Main route line
    routeLayer = L.polyline(coords, {
      color: '#4f46e5', weight: 5, opacity: .9,
      dashArray: dashed ? '10 8' : null,
      lineCap: 'round', lineJoin: 'round'
    }).addTo(_map);

    // Arrow decorators
    if (typeof L.polylineDecorator !== 'undefined') {
      arrowLayer = L.polylineDecorator(routeLayer, {
        patterns: [{
          offset: '8%', repeat: '70px',
          symbol: L.Symbol.arrowHead({
            pixelSize: 13, polygon: false,
            pathOptions: { color: '#c7d2fe', weight: 2.5, opacity: .95 }
          })
        }]
      }).addTo(_map);
    }
  }

  function stopNavigation() {
    [routeLayer, arrowLayer, bgLayer].forEach(l => { if (l) _map.removeLayer(l); });
    routeLayer = arrowLayer = bgLayer = null;
    isNavigating = false;
    destination = null;
  }

  /* Haversine distance in metres */
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6_371_000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function fmtDist(m) {
    if (m == null) return '–';
    return m < 1000 ? `${Math.round(m)} ม.` : `${(m / 1000).toFixed(1)} กม.`;
  }

  function fmtTime(s) {
    if (s == null) return '–';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} นาที`;
    return `${Math.floor(m / 60)} ชม. ${m % 60} นาที`;
  }

  return {
    get isNavigating() { return isNavigating; },
    get destination()  { return destination; },
    init, startNavigation, stopNavigation, haversine, fmtDist, fmtTime
  };
})();
