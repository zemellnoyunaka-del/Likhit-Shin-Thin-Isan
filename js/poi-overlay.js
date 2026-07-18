/* ============================================================
   poi-overlay.js – POI category overlay (Overpass API)
   ============================================================ */

const PoiOverlay = (() => {

  const CATEGORIES = [
    { id: 'restaurant',  icon: '🍽️', color: '#ef4444',
      label: { th: 'ร้านอาหาร',    en: 'Food'      },
      osm: ['"amenity"~"restaurant|cafe|food_court|fast_food"'] },
    { id: 'hospital',    icon: '🏥', color: '#10b981',
      label: { th: 'โรงพยาบาล',    en: 'Hospital'  },
      osm: ['"amenity"~"hospital|clinic"'] },
    { id: 'police',      icon: '👮', color: '#3b82f6',
      label: { th: 'สถานีตำรวจ',   en: 'Police'    },
      osm: ['"amenity"="police"'] },
    { id: 'fuel',        icon: '⛽', color: '#f59e0b',
      label: { th: 'ปั๊มน้ำมัน',   en: 'Gas'       },
      osm: ['"amenity"="fuel"'] },
    { id: 'school',      icon: '🏫', color: '#8b5cf6',
      label: { th: 'โรงเรียน',     en: 'School'    },
      osm: ['"amenity"~"school|university|college"'] },
    { id: 'bank',        icon: '🏦', color: '#0ea5e9',
      label: { th: 'ธนาคาร/ATM',   en: 'Bank'      },
      osm: ['"amenity"~"bank|atm"'] },
    { id: 'convenience', icon: '🛒', color: '#ec4899',
      label: { th: 'ร้านสะดวกซื้อ', en: 'Shop'     },
      osm: ['"shop"~"convenience|supermarket"'] },
    { id: 'pharmacy',    icon: '💊', color: '#14b8a6',
      label: { th: 'ร้านยา',       en: 'Pharmacy'  },
      osm: ['"amenity"="pharmacy"'] },
  ];

  const ZOOM_MIN = 15;   // ต้องซูมถึงระดับนี้ถึงจะเห็นหมุด (เหมือน Google Maps)

  let _map     = null;
  const active  = new Map();   // catId → Leaflet marker[]
  const loading = new Set();   // catIds currently fetching

  /* ── Init ────────────────────────────────────────────────── */
  function init(mapInstance) {
    _map = mapInstance;
    buildGrid();

    _map.on('zoom', () => {
      const z = _map.getZoom();
      active.forEach((markers, catId) => {
        markers.forEach(m => {
          if (z < ZOOM_MIN) {
            if (_map.hasLayer(m)) _map.removeLayer(m);
          } else {
            if (!_map.hasLayer(m)) m.addTo(_map);
          }
        });
      });
      _updateZoomHint();
    });
  }

  /* ── Build category grid ─────────────────────────────────── */
  function buildGrid() {
    const grid = document.getElementById('poiGrid');
    if (!grid) return;
    grid.innerHTML = CATEGORIES.map(cat => {
      const isOn = active.has(cat.id);
      const cnt  = isOn ? active.get(cat.id).length : '';
      return `
        <button type="button" class="poi-cat-btn${isOn ? ' active' : ''}"
                data-poi-cat="${cat.id}" style="--c:${cat.color}">
          <span class="poi-cat-icon">${cat.icon}</span>
          <span class="poi-cat-label">${cat.label[lang] ?? cat.label.th}</span>
          ${cnt ? `<span class="poi-cat-count">${cnt}</span>` : '<span class="poi-cat-count"></span>'}
        </button>`;
    }).join('');

    grid.querySelectorAll('[data-poi-cat]').forEach(btn => {
      btn.addEventListener('click', () => toggle(btn.dataset.poiCat));
    });
  }

  /* ── Toggle category ─────────────────────────────────────── */
  function toggle(catId) {
    if (loading.has(catId)) return;
    if (active.has(catId)) {
      _clear(catId);
    } else {
      _fetch(catId);
    }
  }

  function _clear(catId) {
    (active.get(catId) || []).forEach(m => _map.removeLayer(m));
    active.delete(catId);
    _updateBtn(catId, false, null);
    _updateZoomHint();
  }

  /* ── Fetch from Overpass ─────────────────────────────────── */
  async function _fetch(catId) {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat || !_map) return;

    loading.add(catId);
    _updateBtn(catId, false, '⏳');

    const b = _map.getBounds();
    const bbox = `${b.getSouth().toFixed(5)},${b.getWest().toFixed(5)},${b.getNorth().toFixed(5)},${b.getEast().toFixed(5)}`;

    const parts = cat.osm.flatMap(f =>
      [`node[${f}](${bbox});`, `way[${f}](${bbox});`]
    ).join('');
    const query = `[out:json][timeout:15];(${parts});out center 80;`;

    try {
      const res  = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', body: query
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data    = await res.json();
      const markers = _buildMarkers(data.elements || [], cat);
      active.set(catId, markers);
      _updateBtn(catId, true, markers.length);
      _updateZoomHint();
    } catch (err) {
      console.warn('[POI]', catId, err.message);
      _updateBtn(catId, false, '!');
      setTimeout(() => _updateBtn(catId, false, null), 2500);
    } finally {
      loading.delete(catId);
    }
  }

  /* ── Build Leaflet markers ───────────────────────────────── */
  function _buildMarkers(elements, cat) {
    return elements.map(el => {
      const lat  = el.lat  ?? el.center?.lat;
      const lng  = el.lon  ?? el.center?.lon;
      if (lat == null) return null;

      const name = el.tags?.['name:th'] || el.tags?.name || cat.label.th;

      const icon = L.divIcon({
        className: '',
        html: `<div class="poi-map-pin" style="--c:${cat.color}">${cat.icon}</div>`,
        iconSize: [36, 36], iconAnchor: [18, 36]
      });

      const m = L.marker([lat, lng], { icon })
              .bindTooltip(name, { direction: 'top', offset: [0, -8] });
      if (_map.getZoom() >= ZOOM_MIN) m.addTo(_map);
      return m;
    }).filter(Boolean);
  }

  /* ── Update button state ─────────────────────────────────── */
  function _updateBtn(catId, isActive, count) {
    const btn = document.querySelector(`[data-poi-cat="${catId}"]`);
    if (!btn) return;
    btn.classList.toggle('active', isActive);
    const countEl = btn.querySelector('.poi-cat-count');
    if (countEl) countEl.textContent = count != null ? count : '';
  }

  /* ── Zoom hint ───────────────────────────────────────────── */
  function _updateZoomHint() {
    const hint = document.getElementById('poiZoomHint');
    if (!hint) return;
    const hasActive = active.size > 0;
    const tooFar = _map.getZoom() < ZOOM_MIN;
    hint.classList.toggle('hidden', !hasActive || !tooFar);
  }

  /* ── Clear all markers ───────────────────────────────────── */
  function clearAll() {
    active.forEach((_, id) => _clear(id));
  }

  /* ── Panel visibility ────────────────────────────────────── */
  function openPanel() {
    buildGrid();
    document.getElementById('poiPanel').classList.remove('hidden');
    document.getElementById('poiToggleBtn').classList.add('active');
  }

  function closePanel() {
    document.getElementById('poiPanel').classList.add('hidden');
    document.getElementById('poiToggleBtn').classList.remove('active');
  }

  function togglePanel() {
    const panel = document.getElementById('poiPanel');
    panel.classList.contains('hidden') ? openPanel() : closePanel();
  }

  return { init, toggle, clearAll, openPanel, closePanel, togglePanel, buildGrid };
})();
