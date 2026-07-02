/* ============================================================
   poi.js – Category POI markers from Overpass API
   แสดงเมื่อ zoom >= ZOOM_SHOW, ซ่อนเมื่อ zoom out
   ============================================================ */

const POI = (() => {

  const ZOOM_SHOW = 14;   // ระดับซูมที่เริ่มแสดง POI

  /* ── Category config (สี + ไอคอน + ป้ายชื่อ) ────────────── */
  const CATS = {
    restaurant: {
      color: '#e53e3e', label: 'ร้านอาหาร',
      paths: '<line x1="8" y1="2" x2="8" y2="22"/><line x1="6" y1="2" x2="6" y2="7"/><line x1="10" y1="2" x2="10" y2="7"/><path d="M6 7q2 1 4 0"/><line x1="16" y1="2" x2="16" y2="22"/><path d="M13 2 16 8"/>',
    },
    cafe: {
      color: '#7B5737', label: 'คาเฟ่',
      paths: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="5"/><line x1="10" y1="2" x2="10" y2="5"/><line x1="14" y1="2" x2="14" y2="5"/>',
    },
    hotel: {
      color: '#805AD5', label: 'โรงแรม',
      paths: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 20h20"/><path d="M8 10V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    },
    museum: {
      color: '#2B6CB0', label: 'พิพิธภัณฑ์',
      paths: '<path d="M3 21h18"/><path d="M3 10h18"/><line x1="5" y1="10" x2="5" y2="21"/><line x1="19" y1="10" x2="19" y2="21"/><path d="M3 10 12 4l9 6"/>',
    },
    pharmacy: {
      color: '#38A169', label: 'ร้านขายยา',
      paths: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    },
    hospital: {
      color: '#C53030', label: 'โรงพยาบาล',
      paths: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/>',
    },
    school: {
      color: '#2C5282', label: 'โรงเรียน / มหาวิทยาลัย',
      paths: '<path d="M22 10v6"/><path d="M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    },
    mall: {
      color: '#3182CE', label: 'ห้างสรรพสินค้า',
      paths: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    },
    fuel: {
      color: '#D97706', label: 'ปั๊มน้ำมัน',
      paths: '<rect x="3" y="4" width="12" height="18" rx="1"/><line x1="3" y1="10" x2="15" y2="10"/><path d="M15 8h2a2 2 0 0 1 2 2v5a2 2 0 0 0 4 0V9l-4-4"/>',
    },
    bank: {
      color: '#4299E1', label: 'ธนาคาร / ATM',
      paths: '<line x1="3" y1="21" x2="21" y2="21"/><line x1="6" y1="21" x2="6" y2="11"/><line x1="10" y1="21" x2="10" y2="11"/><line x1="14" y1="21" x2="14" y2="11"/><line x1="18" y1="21" x2="18" y2="11"/><path d="M3 11h18L12 3z"/>',
    },
    park: {
      color: '#276749', label: 'สวนสาธารณะ',
      paths: '<path d="M12 22v-7"/><path d="M6 15h12l-6-8-6 8z"/><path d="M4 11h16L12 2z"/>',
    },
    market: {
      color: '#F6AD55', label: 'ตลาด',
      paths: '<path d="M4 7h16l-2 10H6z"/><path d="M1 3h3l2 4M23 3h-3l-2 4"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/>',
    },
  };

  /* ── OSM tag → category ────────────────────────────────── */
  function _classify(tags) {
    if (!tags) return null;
    const a = tags.amenity, t = tags.tourism, s = tags.shop, l = tags.leisure;
    if (a === 'restaurant' || a === 'food_court')       return 'restaurant';
    if (a === 'cafe' || a === 'bar' || a === 'pub')     return 'cafe';
    if (a === 'hotel' || t === 'hotel' || t === 'guest_house' || t === 'hostel') return 'hotel';
    if (t === 'museum' || a === 'arts_centre')          return 'museum';
    if (a === 'pharmacy' || a === 'chemist')            return 'pharmacy';
    if (a === 'hospital' || a === 'clinic')             return 'hospital';
    if (a === 'school' || a === 'university' || a === 'college') return 'school';
    if (s === 'mall' || s === 'supermarket' || s === 'department_store') return 'mall';
    if (a === 'marketplace' || s === 'market')          return 'market';
    if (a === 'fuel')                                   return 'fuel';
    if (a === 'bank' || a === 'atm')                    return 'bank';
    if (l === 'park' || l === 'garden' || t === 'park') return 'park';
    return null;
  }

  /* ── State ───────────────────────────────────────────────── */
  let _layer  = null;
  let _map    = null;
  let _timer  = null;
  let _abort  = null;
  let _active = false;
  const _cache = new Map();   // bbox key → nodes[]

  /* ── Public ──────────────────────────────────────────────── */
  function init(map) {
    _map   = map;
    _layer = L.layerGroup();
    map.on('zoomend moveend', _schedule);
  }

  /* ── Internal ────────────────────────────────────────────── */
  function _schedule() {
    clearTimeout(_timer);
    _timer = setTimeout(_check, 400);
  }

  function _check() {
    const zoom = _map.getZoom();
    if (zoom < ZOOM_SHOW) {
      if (_active) { _layer.remove(); _active = false; }
      return;
    }
    if (!_active) { _layer.addTo(_map); _active = true; }
    _load();
  }

  async function _load() {
    const b   = _map.getBounds();
    const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
                  .map(v => v.toFixed(3)).join(',');

    if (_cache.has(key)) { _render(_cache.get(key)); return; }

    if (_abort) _abort.abort();
    _abort = new AbortController();

    try {
      const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',');
      const q = `[out:json][timeout:12];(
        node["amenity"="restaurant"](${bbox});
        node["amenity"="food_court"](${bbox});
        node["amenity"="cafe"](${bbox});
        node["amenity"="bar"](${bbox});
        node["amenity"="pub"](${bbox});
        node["amenity"="hotel"](${bbox});
        node["amenity"="pharmacy"](${bbox});
        node["amenity"="chemist"](${bbox});
        node["amenity"="hospital"](${bbox});
        node["amenity"="clinic"](${bbox});
        node["amenity"="school"](${bbox});
        node["amenity"="university"](${bbox});
        node["amenity"="college"](${bbox});
        node["amenity"="fuel"](${bbox});
        node["amenity"="bank"](${bbox});
        node["amenity"="atm"](${bbox});
        node["amenity"="marketplace"](${bbox});
        node["tourism"="hotel"](${bbox});
        node["tourism"="guest_house"](${bbox});
        node["tourism"="hostel"](${bbox});
        node["tourism"="museum"](${bbox});
        node["shop"="mall"](${bbox});
        node["shop"="supermarket"](${bbox});
        node["shop"="department_store"](${bbox});
        node["shop"="market"](${bbox});
        node["leisure"="park"](${bbox});
        node["leisure"="garden"](${bbox});
      );out body 300;`;

      const res  = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
        { signal: _abort.signal }
      );
      const data  = await res.json();
      const nodes = data.elements || [];

      if (_cache.size >= 30) _cache.delete(_cache.keys().next().value);
      _cache.set(key, nodes);
      _render(nodes);
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[POI] โหลดไม่ได้:', err.message);
    }
  }

  function _render(nodes) {
    _layer.clearLayers();
    nodes.forEach(node => {
      const cat = _classify(node.tags);
      if (!cat) return;
      const cfg  = CATS[cat];
      const name = node.tags?.['name:th'] || node.tags?.name || cfg.label;

      const html =
        `<div class="poi-dot" style="background:${cfg.color}" title="${_esc(name)}">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" ` +
        `stroke-linecap="round" stroke-linejoin="round" width="14" height="14">${cfg.paths}</svg>` +
        `</div>`;

      L.marker([node.lat, node.lon], {
        icon: L.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: -200,
      })
      .bindTooltip(_esc(name), {
        direction: 'top',
        offset: [0, -15],
        className: 'poi-tip',
      })
      .addTo(_layer);
    });
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init };
})();
