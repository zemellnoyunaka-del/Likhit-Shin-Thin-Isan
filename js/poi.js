/* ============================================================
   poi.js – Category POI markers from Overpass API
   แสดงเมื่อ zoom >= ZOOM_SHOW, ซ่อนเมื่อ zoom out
   ============================================================ */

const POI = (() => {

  const ZOOM_SHOW = 17;   // ระดับซูมที่เริ่มแสดง POI (ระดับเห็นรายละเอียดอาคาร เหมือน Google Maps)

  /* ── Category config (สี + ไอคอน + ป้ายชื่อ) ────────────── */
  const CATS = {
    restaurant: {
      color: '#e53e3e', label: 'ร้านอาหาร',
      paths: '<line x1="8" y1="2" x2="8" y2="22"/><line x1="6" y1="2" x2="6" y2="7"/><line x1="10" y1="2" x2="10" y2="7"/><path d="M6 7q2 1 4 0"/><line x1="16" y1="2" x2="16" y2="22"/><path d="M13 2 16 8"/>',
    },
    fastfood: {
      color: '#F97316', label: 'ร้านฟาสต์ฟู้ด',
      paths: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
    },
    cafe: {
      color: '#7B5737', label: 'คาเฟ่',
      paths: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="5"/><line x1="10" y1="2" x2="10" y2="5"/><line x1="14" y1="2" x2="14" y2="5"/>',
    },
    convenience: {
      color: '#0EA5E9', label: 'ร้านสะดวกซื้อ',
      paths: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    },
    hotel: {
      color: '#805AD5', label: 'โรงแรม',
      paths: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 20h20"/><path d="M8 10V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    },
    museum: {
      color: '#2B6CB0', label: 'พิพิธภัณฑ์',
      paths: '<path d="M3 21h18"/><path d="M3 10h18"/><line x1="5" y1="10" x2="5" y2="21"/><line x1="19" y1="10" x2="19" y2="21"/><path d="M3 10 12 4l9 6"/>',
    },
    temple: {
      color: '#D97706', label: 'วัด / ศาสนสถาน',
      paths: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
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
    cinema: {
      color: '#6B21A8', label: 'โรงภาพยนตร์',
      paths: '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/>',
    },
    fitness: {
      color: '#BE185D', label: 'ฟิตเนส / กีฬา',
      paths: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h1a4 4 0 0 1 0 8H2"/><line x1="6" y1="12" x2="18" y2="12"/>',
    },
    police: {
      color: '#1E3A5F', label: 'สถานีตำรวจ',
      paths: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    },
    post: {
      color: '#CA8A04', label: 'ไปรษณีย์',
      paths: '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,4 12,13 2,4"/>',
    },
    laundry: {
      color: '#0891B2', label: 'ร้านซักผ้า',
      paths: '<circle cx="12" cy="12" r="4"/><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>',
    },
    beauty: {
      color: '#DB2777', label: 'ร้านเสริมสวย / นวด',
      paths: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    },
  };

  /* ── OSM tag → category ────────────────────────────────── */
  function _classify(tags) {
    if (!tags) return null;
    const a = tags.amenity, t = tags.tourism, s = tags.shop, l = tags.leisure, r = tags.religion;

    /* อาหาร */
    if (a === 'restaurant' || a === 'food_court') return 'restaurant';
    if (a === 'fast_food')                        return 'fastfood';
    if (a === 'cafe' || a === 'bar' || a === 'pub' || a === 'ice_cream' || a === 'bubble_tea') return 'cafe';

    /* ร้านค้า */
    if (s === 'convenience' || a === 'vending_machine') return 'convenience';
    if (s === 'mall' || s === 'supermarket' || s === 'department_store') return 'mall';
    if (a === 'marketplace' || s === 'market')          return 'market';
    if (s === 'hairdresser' || s === 'beauty' || a === 'massage' || s === 'massage') return 'beauty';
    if (a === 'laundry' || s === 'laundry' || a === 'dry_cleaning') return 'laundry';

    /* ที่พัก */
    if (a === 'hotel' || t === 'hotel' || t === 'guest_house' || t === 'hostel' || t === 'motel') return 'hotel';

    /* ศาสนสถาน */
    if (a === 'place_of_worship') return 'temple';

    /* สุขภาพ */
    if (a === 'pharmacy' || a === 'chemist')            return 'pharmacy';
    if (a === 'hospital' || a === 'clinic' || a === 'doctors') return 'hospital';

    /* การศึกษา */
    if (a === 'school' || a === 'university' || a === 'college' || a === 'kindergarten') return 'school';

    /* ราชการ / บริการ */
    if (a === 'police')           return 'police';
    if (a === 'post_office')      return 'post';
    if (a === 'bank' || a === 'atm') return 'bank';
    if (a === 'fuel')             return 'fuel';

    /* วัฒนธรรม / สันทนาการ */
    if (t === 'museum' || a === 'arts_centre' || a === 'gallery') return 'museum';
    if (a === 'cinema' || a === 'theatre')               return 'cinema';
    if (l === 'fitness_centre' || l === 'sports_centre' || l === 'swimming_pool' || l === 'stadium') return 'fitness';
    if (l === 'park' || l === 'garden' || l === 'playground' || t === 'park') return 'park';

    return null;
  }

  /* ── State ───────────────────────────────────────────────── */
  let _layer      = null;
  let _map        = null;
  let _timer      = null;
  let _abort      = null;
  let _abortTimer = null;
  let _active     = false;
  let _gen        = 0;        // world-version; stale fetches compare before rendering
  let _fetchedBox = null;     // L.LatLngBounds of last successful fetch (padded)
  const _cache    = new Map();  // bbox key → nodes[]
  const _markers  = new Map();  // nodeId → L.marker  (diff-render — no clearLayers flash)

  /* ── Public ──────────────────────────────────────────────── */
  function init(map) {
    _map   = map;
    _layer = L.layerGroup();

    /* ซ่อนทันทีระหว่าง zoom animation — ไม่ต้องรอ zoomend */
    map.on('zoom', () => {
      if (_map.getZoom() < ZOOM_SHOW && _active) {
        _layer.remove();
        _active = false;
        _gen++;
        clearTimeout(_timer);
      }
    });

    map.on('zoomend moveend', _schedule);
    _initSheet();
  }

  /* ── Internal ────────────────────────────────────────────── */
  function _schedule() {
    clearTimeout(_timer);
    _timer = setTimeout(_check, 150);
  }

  function _check() {
    const zoom = _map.getZoom();
    if (zoom < ZOOM_SHOW) {
      if (_active) { _layer.remove(); _active = false; }
      _clearMarkers();
      return;
    }

    if (!_active) { _layer.addTo(_map); _active = true; }

    const view = _map.getBounds();
    if (_fetchedBox && _fetchedBox.contains(view)) return;

    _load();
  }

  async function _load() {
    const view = _map.getBounds();

    /* Fetch a padded area (1.6× wider/taller) so panning within it needs no new request */
    const latPad = (view.getNorth() - view.getSouth()) * 0.3;
    const lngPad = (view.getEast()  - view.getWest())  * 0.3;
    const s = view.getSouth() - latPad, n = view.getNorth() + latPad;
    const w = view.getWest()  - lngPad, e = view.getEast()  + lngPad;
    const bbox = [s, w, n, e].join(',');

    const key = [s, w, n, e].map(v => v.toFixed(3)).join(',');

    if (_cache.has(key)) {
      _fetchedBox = L.latLngBounds([s, w], [n, e]);
      _applyNodes(_cache.get(key));
      return;
    }

    /* Cancel previous in-flight request */
    if (_abort) { _abort.abort(); clearTimeout(_abortTimer); }
    _abort = new AbortController();
    /* Manual timeout fallback for browsers without AbortSignal.timeout */
    _abortTimer = setTimeout(() => _abort.abort(), 14000);

    const myGen = ++_gen;

    /* nwr = node + way + relation — ครอบคลุมสถานที่ที่ map เป็นอาคาร (way) ด้วย
       out center = ส่งพิกัดจุดกลางของ way/relation แทน polygon ทั้งหมด */
    const q = `[out:json][timeout:20];(
      nwr["amenity"~"^(restaurant|food_court|fast_food|cafe|bar|pub|ice_cream|bubble_tea|hotel|pharmacy|chemist|hospital|clinic|doctors|school|university|college|kindergarten|fuel|bank|atm|marketplace|arts_centre|gallery|cinema|theatre|police|post_office|laundry|dry_cleaning|massage|place_of_worship)$"](${bbox});
      nwr["tourism"~"^(hotel|guest_house|hostel|motel|museum)$"](${bbox});
      nwr["shop"~"^(mall|supermarket|department_store|market|convenience|hairdresser|beauty|laundry|massage)$"](${bbox});
      nwr["leisure"~"^(park|garden|playground|fitness_centre|sports_centre|swimming_pool|stadium)$"](${bbox});
    );out center 300;`;

    try {
      const res  = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
        { signal: _abort.signal }
      );
      clearTimeout(_abortTimer);

      if (myGen !== _gen) return;   // zoomed out or newer request started — discard

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data  = await res.json();
      /* nodes: lat/lon trực tiếp; ways/relations: ใช้ center.lat/center.lon */
      const nodes = (data.elements || []).filter(el => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        return lat != null && lon != null;
      }).map(el => ({
        ...el,
        lat: el.lat ?? el.center.lat,
        lon: el.lon ?? el.center.lon,
        uid: `${el.type}/${el.id}`,   // composite key — ป้องกัน id ชนกันระหว่าง type
      }));

      if (_cache.size >= 25) _cache.delete(_cache.keys().next().value);
      _cache.set(key, nodes);
      _fetchedBox = L.latLngBounds([s, w], [n, e]);

      if (myGen !== _gen) return;   // check again after await
      _applyNodes(nodes);
    } catch (err) {
      clearTimeout(_abortTimer);
      if (err.name !== 'AbortError') console.warn('[POI] โหลดไม่ได้:', err.message);
    }
  }

  /* Diff-render: add new markers, remove stale ones — no flash */
  function _applyNodes(nodes) {
    const incoming = new Map();
    nodes.forEach(node => {
      const cat = _classify(node.tags);
      if (!cat) return;
      const key = node.uid || `node/${node.id}`;
      incoming.set(key, { node, cat });
    });

    /* Remove markers that are no longer in the incoming set */
    for (const [key, m] of _markers) {
      if (!incoming.has(key)) { _layer.removeLayer(m); _markers.delete(key); }
    }

    /* Add markers that are new */
    for (const [key, { node, cat }] of incoming) {
      if (_markers.has(key)) continue;   // already on map
      const cfg  = CATS[cat];
      const name = node.tags?.['name:th'] || node.tags?.name || cfg.label;
      const html =
        `<div class="poi-dot" style="background:${cfg.color}">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" ` +
        `stroke-linecap="round" stroke-linejoin="round" width="12" height="12">${cfg.paths}</svg>` +
        `</div>`;

      const m = L.marker([node.lat, node.lon], {
        icon: L.divIcon({ className: '', html, iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: -200,
      })
      .bindTooltip(_esc(name), { direction: 'top', offset: [0, -15], className: 'poi-tip' })
      .on('click', e => {
        L.DomEvent.stopPropagation(e);
        App.showPlaceFor(node);
      });

      _layer.addLayer(m);
      _markers.set(key, m);
    }
  }

  function _clearMarkers() {
    _markers.forEach(m => _layer.removeLayer(m));
    _markers.clear();
    _fetchedBox = null;
  }

  /* ── POI Info Sheet ──────────────────────────────────────── */
  let _sheetNode = null;

  /* Category-specific extra OSM tags to show */
  const CAT_EXTRA = {
    restaurant: [
      ['🍽️', 'cuisine',          v => _fmtList(v)],
      ['🪑', 'capacity',         v => `${v} ที่นั่ง`],
      ['🛵', 'delivery',         v => v === 'yes' ? 'มีบริการเดลิเวอรี่' : null],
      ['🥡', 'takeaway',         v => v === 'yes' ? 'มีบริการซื้อกลับบ้าน' : null],
      ['🌿', 'diet:vegetarian',  v => v === 'yes' ? 'มีเมนูมังสวิรัติ' : null],
      ['☕', 'outdoor_seating',  v => v === 'yes' ? 'มีที่นั่งกลางแจ้ง' : null],
    ],
    cafe: [
      ['🍵', 'cuisine',          v => _fmtList(v)],
      ['📶', 'internet_access',  v => v === 'wlan' || v === 'yes' ? 'มี Wi-Fi' : null],
      ['☕', 'outdoor_seating',  v => v === 'yes' ? 'มีที่นั่งกลางแจ้ง' : null],
    ],
    hotel: [
      ['⭐', 'stars',            v => `${v} ดาว`],
      ['🛏️', 'rooms',           v => `${v} ห้อง`],
      ['📶', 'internet_access',  v => v && v !== 'no' ? 'มีอินเทอร์เน็ต' : null],
      ['🏢', 'operator',         v => v],
    ],
    museum: [
      ['🏛️', 'operator',        v => v],
      ['💳', 'fee',              v => v === 'yes' ? 'มีค่าเข้าชม' : (v === 'no' ? 'ฟรี' : null)],
      ['♿', 'wheelchair',       v => v === 'yes' ? 'รองรับรถเข็น' : null],
    ],
    pharmacy: [
      ['💊', 'brand',            v => v],
      ['🏥', 'operator',         v => v],
      ['♿', 'wheelchair',       v => v === 'yes' ? 'รองรับรถเข็น' : null],
    ],
    hospital: [
      ['🏥', 'operator',         v => v],
      ['🚨', 'emergency',        v => v === 'yes' ? 'มีห้องฉุกเฉิน' : null],
      ['🛏️', 'beds',            v => `${v} เตียง`],
      ['♿', 'wheelchair',       v => v === 'yes' ? 'รองรับรถเข็น' : null],
    ],
    school: [
      ['🏫', 'operator',         v => v],
      ['📚', 'isced:level',      v => `ระดับ ISCED ${v}`],
    ],
    mall: [
      ['🏬', 'operator',         v => v],
      ['🏢', 'brand',            v => v],
      ['♿', 'wheelchair',       v => v === 'yes' ? 'รองรับรถเข็น' : null],
    ],
    fuel: [
      ['⛽', 'brand',            v => v],
      ['🛢️', 'fuel:diesel',     v => v === 'yes' ? 'ดีเซล' : null],
      ['🛢️', 'fuel:octane_91',  v => v === 'yes' ? 'เบนซิน 91' : null],
      ['🛢️', 'fuel:octane_95',  v => v === 'yes' ? 'เบนซิน 95' : null],
      ['🔋', 'amenity',          v => null], // skip
    ],
    bank: [
      ['🏦', 'brand',            v => v],
      ['🏦', 'operator',         v => v],
      ['🏧', 'atm',              v => v === 'yes' ? 'มีตู้ ATM' : null],
    ],
    park: [
      ['🌲', 'operator',         v => v],
      ['🐕', 'dog',              v => v === 'yes' ? 'อนุญาตให้นำสุนัขเข้า' : null],
      ['🛝', 'playground',       v => v === 'yes' ? 'มีสนามเด็กเล่น' : null],
    ],
    market: [
      ['🛒', 'operator',         v => v],
      ['🕐', 'market_type',      v => v],
    ],
    fastfood: [
      ['🍔', 'brand',            v => v],
      ['🍽️', 'cuisine',         v => _fmtList(v)],
      ['🛵', 'delivery',         v => v === 'yes' ? 'มีบริการเดลิเวอรี่' : null],
      ['🥡', 'takeaway',         v => v === 'yes' ? 'มีบริการซื้อกลับบ้าน' : null],
    ],
    convenience: [
      ['🏪', 'brand',            v => v],
      ['🏢', 'operator',         v => v],
      ['🏧', 'atm',              v => v === 'yes' ? 'มีตู้ ATM' : null],
    ],
    temple: [
      ['🛕', 'religion',         v => ({ buddhist: 'พุทธ', christian: 'คริสต์', islam: 'อิสลาม', hindu: 'ฮินดู' }[v] || v)],
      ['📿', 'denomination',     v => v],
      ['🏢', 'operator',         v => v],
    ],
    cinema: [
      ['🏢', 'brand',            v => v],
      ['🏢', 'operator',         v => v],
    ],
    fitness: [
      ['🏋️', 'sport',           v => _fmtList(v)],
      ['🏢', 'operator',         v => v],
      ['💳', 'fee',              v => v === 'yes' ? 'มีค่าใช้จ่าย' : (v === 'no' ? 'ฟรี' : null)],
    ],
    police: [
      ['🚔', 'operator',         v => v],
    ],
    post: [
      ['📮', 'operator',         v => v],
      ['📦', 'parcel',           v => v === 'yes' ? 'รับ/ส่งพัสดุ' : null],
    ],
    laundry: [
      ['👕', 'brand',            v => v],
      ['🔧', 'self_service',     v => v === 'yes' ? 'บริการตนเอง' : null],
    ],
    beauty: [
      ['💆', 'massage',          v => v === 'yes' ? 'มีบริการนวด' : null],
      ['💇', 'brand',            v => v],
    ],
  };

  function _fmtList(v) {
    return v.split(/[;,]/).map(s => s.trim()).filter(Boolean).join(', ');
  }

  function _buildRows(tags, cat) {
    const rows = [];

    /* address */
    const addrParts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:subdistrict'] && `แขวง${tags['addr:subdistrict']}`,
      tags['addr:district']    && `เขต${tags['addr:district']}`,
      tags['addr:city']        || tags['addr:province'],
      tags['addr:postcode'],
    ].filter(Boolean);
    if (addrParts.length) rows.push(['📍', addrParts.join(' ')]);

    /* contact */
    if (tags.phone)         rows.push(['📞', tags.phone.replace(/;/g, ' / ')]);
    if (tags['contact:phone']) rows.push(['📞', tags['contact:phone'].replace(/;/g, ' / ')]);

    /* hours */
    if (tags.opening_hours) rows.push(['🕐', _fmtHours(tags.opening_hours)]);

    /* website */
    const web = tags.website || tags['contact:website'];
    if (web) {
      const display = web.replace(/^https?:\/\//, '').replace(/\/$/, '');
      rows.push(['🌐', `<a href="${_esc(web)}" target="_blank" rel="noopener">${_esc(display)}</a>`]);
    }

    /* category-specific extras */
    const extras = CAT_EXTRA[cat] || [];
    const usedKeys = new Set();
    for (const [icon, key, fmt] of extras) {
      if (usedKeys.has(key)) continue;
      const val = tags[key];
      if (!val) continue;
      const label = fmt(val);
      if (label) { rows.push([icon, _esc(label)]); usedKeys.add(key); }
    }

    /* fuel types — merge into one row */
    if (cat === 'fuel') {
      const fuels = [];
      if (tags['fuel:diesel'] === 'yes')     fuels.push('ดีเซล');
      if (tags['fuel:octane_91'] === 'yes')  fuels.push('91');
      if (tags['fuel:octane_95'] === 'yes')  fuels.push('95');
      if (tags['fuel:octane_98'] === 'yes')  fuels.push('98');
      if (tags['fuel:lpg'] === 'yes')        fuels.push('LPG');
      if (tags['fuel:cng'] === 'yes')        fuels.push('CNG');
      if (fuels.length) rows.push(['🛢️', fuels.join(' · ')]);
    }

    /* wheelchair — generic */
    if (!CAT_EXTRA[cat]?.find(e => e[1] === 'wheelchair') && tags.wheelchair === 'yes') {
      rows.push(['♿', 'รองรับรถเข็น']);
    }

    return rows;
  }

  function _fmtHours(raw) {
    /* humanise common patterns a little, keep original if complex */
    return raw
      .replace(/Mo-Fr/g, 'จ-ศ').replace(/Sa/g, 'ส').replace(/Su/g, 'อา')
      .replace(/Mo/g, 'จ').replace(/Tu/g, 'อ').replace(/We/g, 'พ')
      .replace(/Th/g, 'พฤ').replace(/Fr/g, 'ศ')
      .replace(/PH off/g, 'ปิดวันหยุด')
      .replace(/off/g, 'ปิด');
  }

  function _showInfo(node, cat, cfg, name) {
    const tags = node.tags || {};

    const overlay   = document.getElementById('poiSheet');
    const elIcon    = document.getElementById('poiShIcon');
    const elCat     = document.getElementById('poiShCat');
    const elName    = document.getElementById('poiShName');
    const elImgWrap = document.getElementById('poiShImgWrap');
    const elImg     = document.getElementById('poiShImg');
    const elDesc    = document.getElementById('poiShDesc');
    const elDetails = document.getElementById('poiShDetails');
    const navBtn    = document.getElementById('poiShNavBtn');

    /* header icon */
    elIcon.style.background = cfg.color;
    elIcon.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" ` +
      `stroke-linecap="round" stroke-linejoin="round" width="16" height="16">${cfg.paths}</svg>`;

    elCat.textContent  = cfg.label;
    elName.textContent = name;

    /* reset async content */
    elImgWrap.classList.add('hidden');
    elImg.src = '';
    elDesc.classList.add('hidden');
    elDesc.textContent = '';
    elDetails.innerHTML = `<div class="poi-sh-loading">กำลังโหลดข้อมูล…</div>`;

    /* static OSM rows */
    const rows = _buildRows(tags, cat);

    /* navigate */
    navBtn.onclick = () => {
      const destName = encodeURIComponent(name);
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${node.lat},${node.lon}&destination_place_id=&travelmode=driving`,
        '_blank', 'noopener'
      );
    };

    overlay.classList.add('show');
    _sheetNode = node;

    /* render static rows immediately, then enrich with Wikipedia */
    _renderDetails(elDetails, rows);

    _fetchWikiInfo(name).then(info => {
      if (_sheetNode !== node) return;

      if (info?.image) {
        elImg.src = info.image;
        elImg.onload  = () => elImgWrap.classList.remove('hidden');
        elImg.onerror = () => {};
      }
      if (info?.description) {
        elDesc.textContent = info.description;
        elDesc.classList.remove('hidden');
      }
    });
  }

  function _renderDetails(el, rows) {
    if (!rows.length) {
      el.innerHTML = `<p class="poi-sh-noinfo">ไม่มีข้อมูลเพิ่มเติมใน OpenStreetMap</p>`;
      return;
    }
    el.innerHTML = rows.map(([icon, val]) =>
      `<div class="poi-sh-row"><span class="poi-sh-row-icon">${icon}</span><span>${val}</span></div>`
    ).join('');
  }

  async function _fetchWikiInfo(name) {
    /* AbortSignal.timeout ไม่รองรับทุก browser — ใช้ manual controller แทน */
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 7000);
    try {
      for (const lang of ['th', 'en']) {
        if (ctrl.signal.aborted) break;
        try {
          const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
          const res  = await fetch(url, { signal: ctrl.signal });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.type === 'disambiguation') continue;
          clearTimeout(tid);
          return {
            image:       data.thumbnail?.source || data.originalimage?.source || null,
            description: data.description || null,
          };
        } catch (inner) {
          if (inner.name === 'AbortError') break;
        }
      }
    } finally {
      clearTimeout(tid);
    }
    return null;
  }

  function _initSheet() {
    const overlay = document.getElementById('poiSheet');
    if (!overlay) return;
    document.getElementById('poiShClose').addEventListener('click', () => {
      overlay.classList.remove('show');
      _sheetNode = null;
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.classList.remove('show'); _sheetNode = null; }
    });
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init };
})();
