/* ============================================================
   places.js – OSM POI lookup via Overpass API
   ============================================================ */

const PlaceInfo = (() => {
  const OVERPASS = 'https://overpass-api.de/api/interpreter';

  async function fetchNearby(lat, lng, radius = 30) {
    const q = `[out:json][timeout:8];
(
  node(around:${radius},${lat},${lng})[name];
  way(around:${radius},${lat},${lng})[name];
)->.r;
.r out center tags 5;`;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: ctrl.signal
      });
      const json = await res.json();
      return (json.elements || []).filter(el => el.tags?.name);
    } catch { return []; }
  }

  function getLatLng(el) {
    if (el.type === 'node') return { lat: el.lat, lng: el.lon };
    if (el.center) return { lat: el.center.lat, lng: el.center.lon };
    return null;
  }

  function _hav(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function closest(elements, lat, lng) {
    let best = null, bestDist = Infinity;
    for (const el of elements) {
      const pos = getLatLng(el);
      if (!pos) continue;
      const d = _hav(lat, lng, pos.lat, pos.lng);
      if (d < bestDist) { bestDist = d; best = el; }
    }
    return best;
  }

  function categoryLabel(tags) {
    const a = tags.amenity, s = tags.shop, t = tags.tourism, l = tags.leisure;
    if (a === 'hospital' || a === 'clinic') return '🏥 สถานพยาบาล';
    if (a === 'pharmacy') return '💊 ร้านขายยา';
    if (a === 'restaurant') return '🍽️ ร้านอาหาร';
    if (a === 'cafe') return '☕ คาเฟ่';
    if (a === 'fast_food') return '🍔 ฟาสต์ฟู้ด';
    if (a === 'food_court') return '🍱 ศูนย์อาหาร';
    if (a === 'bank') return '🏦 ธนาคาร';
    if (a === 'atm') return '🏧 ATM';
    if (a === 'school') return '🏫 โรงเรียน';
    if (a === 'university' || a === 'college') return '🎓 มหาวิทยาลัย';
    if (a === 'fuel') return '⛽ ปั๊มน้ำมัน';
    if (a === 'hotel') return '🏨 โรงแรม';
    if (a === 'police') return '👮 สถานีตำรวจ';
    if (a === 'post_office') return '📮 ไปรษณีย์';
    if (a === 'place_of_worship') return '🙏 สถานที่ทางศาสนา';
    if (a === 'parking') return '🅿️ ที่จอดรถ';
    if (a === 'marketplace') return '🏪 ตลาด';
    if (a === 'convenience') return '🏪 ร้านสะดวกซื้อ';
    if (a === 'supermarket' || s === 'supermarket') return '🛒 ซุปเปอร์มาร์เก็ต';
    if (a === 'bus_station') return '🚌 สถานีรถโดยสาร';
    if (s === 'clothes') return '👗 ร้านเสื้อผ้า';
    if (s === 'electronics') return '📱 ร้านอิเล็กทรอนิกส์';
    if (s === 'bakery') return '🥖 เบเกอรี่';
    if (s) return '🛍️ ร้านค้า';
    if (t === 'hotel') return '🏨 โรงแรม';
    if (t === 'attraction') return '🎯 สถานที่ท่องเที่ยว';
    if (t === 'museum') return '🏛️ พิพิธภัณฑ์';
    if (t === 'guest_house') return '🏠 เกสต์เฮาส์';
    if (t === 'viewpoint') return '🌄 จุดชมวิว';
    if (l === 'park') return '🌳 สวนสาธารณะ';
    if (l === 'swimming_pool') return '🏊 สระว่ายน้ำ';
    if (l === 'fitness_centre') return '💪 ฟิตเนส';
    if (tags.office === 'government') return '🏛️ หน่วยงานรัฐ';
    if (tags.office) return '🏢 สำนักงาน';
    if (tags.building) return '🏗️ อาคาร';
    return '📍 สถานที่';
  }

  function formatAddress(tags) {
    const parts = [];
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:subdistrict']) parts.push(`ต.${tags['addr:subdistrict']}`);
    if (tags['addr:district']) parts.push(`อ.${tags['addr:district']}`);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    return parts.join(' ');
  }

  async function getPlacePhoto(tags) {
    // 1. Direct image URL from OSM tag
    if (tags.image && /^https?:\/\//.test(tags.image)) return tags.image;

    // 2. Wikimedia Commons tag (e.g. "File:Wat_Pho.jpg" or category name)
    if (tags.wikimedia_commons) {
      const raw = tags.wikimedia_commons;
      const title = raw.startsWith('File:') ? raw : `File:${raw}`;
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`,
          { signal: ctrl.signal }
        );
        const data = await res.json();
        const pages = data?.query?.pages;
        if (pages) {
          const url = Object.values(pages)[0]?.imageinfo?.[0]?.thumburl;
          if (url) return url;
        }
      } catch { /* fall through */ }
    }

    // 3. Wikipedia thumbnail
    return getWikiPhoto(tags);
  }

  async function getWikiPhoto(tags) {
    const wiki = tags.wikipedia;
    if (!wiki) return null;
    const idx = wiki.indexOf(':');
    if (idx < 0) return null;
    const lang = wiki.slice(0, idx), title = wiki.slice(idx + 1);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { signal: ctrl.signal }
      );
      if (!res.ok) return null;
      return (await res.json()).thumbnail?.source ?? null;
    } catch { return null; }
  }

  const _AMENITY_FILTER =
    'restaurant|cafe|fast_food|food_court|hospital|clinic|pharmacy|' +
    'bank|atm|school|university|college|fuel|police|post_office|' +
    'bus_station|marketplace|convenience|hotel|place_of_worship|parking';

  async function fetchAround(lat, lng, radius = 700) {
    const q = `[out:json][timeout:15];
(
  node(around:${radius},${lat},${lng})[amenity~"${_AMENITY_FILTER}"][name];
  way(around:${radius},${lat},${lng})[amenity~"${_AMENITY_FILTER}"][name];
  node(around:${radius},${lat},${lng})[shop][name];
  node(around:${radius},${lat},${lng})[tourism~"hotel|attraction|museum|guest_house|viewpoint"][name];
  node(around:${radius},${lat},${lng})[leisure~"park|fitness_centre|swimming_pool"][name];
)->.r;
.r out center tags 70;`;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 16000);
      const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: ctrl.signal
      });
      const json = await res.json();
      return (json.elements || []).filter(el => el.tags?.name);
    } catch { return []; }
  }

  function poiIcon(tags) {
    const a = tags.amenity, s = tags.shop, t = tags.tourism, l = tags.leisure;
    const i = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="${d}"/></svg>`;

    if (a === 'hospital' || a === 'clinic')
      return i('M10 3v7H3v4h7v7h4v-7h7v-4h-7V3z');
    if (a === 'pharmacy')
      return i('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z');
    if (a === 'restaurant')
      return i('M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z');
    if (a === 'cafe')
      return i('M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z');
    if (a === 'fast_food' || a === 'food_court')
      return i('M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-8-15.03-8-15.03 0h15.03zM1.02 17h15v2H1z');
    if (a === 'bank')
      return i('M11.5 1L2 6v2h19V6L11.5 1zM5 10v7h3v-7H5zm5.5 0v7h3v-7h-3zM16 10v7h3v-7h-3zM2 19v2h19v-2H2z');
    if (a === 'atm')
      return i('M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z');
    if (a === 'school' || a === 'university' || a === 'college')
      return i('M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z');
    if (a === 'fuel')
      return i('M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33a2.5 2.5 0 002.5 2.5c.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5a2.5 2.5 0 005 0V9c0-.69-.28-1.32-.73-1.77zM18 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-6 0H6V5h6v5z');
    if (a === 'police')
      return i('M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z');
    if (a === 'post_office')
      return i('M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z');
    if (a === 'place_of_worship')
      return i('M11 2v4H7v4h4v12h2V10h4V6h-4V2z');
    if (a === 'parking')
      return i('M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z');
    if (a === 'bus_station')
      return i('M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z');
    if (a === 'marketplace' || a === 'convenience' || a === 'supermarket' || s === 'supermarket')
      return i('M17 18c-1.1 0-1.99.9-1.99 2S15.9 22 17 22c1.1 0 2-.9 2-2s-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.1 17 7 17h11v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.5 4H5.21l-.94-2H1zm6 16c-1.1 0-1.99.9-1.99 2S5.9 22 7 22c1.1 0 2-.9 2-2s-.9-2-2-2z');
    if (s === 'clothes')
      return i('M21 6.5l-4-4-5 5-5-5-4 4 4 4v9h10v-9l4-4z');
    if (s === 'electronics')
      return i('M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z');
    if (s === 'bakery')
      return i('M12 6c1.11 0 2-.89 2-2 0-.36-.1-.69-.26-1L12 0l-1.74 3c-.16.31-.26.64-.26 1 0 1.11.89 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.31-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9h-5V7h-2v2H6C4.34 9 3 10.34 3 12v1.46c0 .43.18.85.5 1.15l1.26 1.12c.36.33.85.5 1.34.5.46 0 .94-.16 1.32-.5l1.27-1.15c.36-.32.84-.5 1.31-.5.46 0 .94.18 1.3.51l1.27 1.15c.37.33.86.49 1.31.49.47 0 .95-.16 1.32-.5l1.26-1.12c.32-.3.5-.72.5-1.15V12C21 10.34 19.66 9 18 9z');
    if (s)
      return i('M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm0 10c-1.66 0-3-1.34-3-3h2c0 .55.45 1 1 1s1-.45 1-1h2c0 1.66-1.34 3-3 3z');
    if (t === 'hotel' || a === 'hotel')
      return i('M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z');
    if (t === 'attraction')
      return i('M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z');
    if (t === 'museum')
      return i('M22 11V9L12 2 2 9v2h2v9H2v2h20v-2h-2v-9h2zm-4 9h-3v-6H9v6H6v-9l6-4.5 6 4.5v9z');
    if (t === 'guest_house')
      return i('M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z');
    if (t === 'viewpoint')
      return i('M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z');
    if (l === 'park')
      return i('M12 2L3 13h6v8h6v-8h6z');
    if (l === 'fitness_centre')
      return i('M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z');
    if (l === 'swimming_pool')
      return i('M22 21c-1.11 0-1.73-.37-2.18-.64-.37-.22-.6-.36-1.15-.36-.56 0-.78.13-1.15.36-.46.27-1.07.64-2.18.64s-1.73-.37-2.18-.64c-.37-.22-.6-.36-1.15-.36-.56 0-.78.13-1.15.36-.46.27-1.08.64-2.19.64-1.11 0-1.73-.37-2.18-.64-.37-.23-.6-.36-1.15-.36s-.78.13-1.15.36C2.73 20.63 2.11 21 1 21v2c1.11 0 1.73-.37 2.18-.64.37-.22.6-.36 1.15-.36s.78.13 1.15.36c.46.27 1.08.64 2.19.64 1.11 0 1.73-.37 2.18-.64.37-.22.6-.36 1.15-.36.56 0 .78.13 1.15.36.46.27 1.07.64 2.18.64s1.73-.37 2.18-.64c.37-.22.6-.36 1.15-.36s.78.13 1.15.36c.46.27 1.07.64 2.18.64v-2c-.54 0-.78-.13-1.15-.36zM8.68 8c.19.31.32.65.32 1 0 1.1-.9 2-2 2s-2-.9-2-2l.03-.15C5.81 7.93 7 7 8 5c0 0 4 2 4 5 0 1.1-.9 2-2 2-.56 0-1.08-.23-1.45-.6L8 11l-.32-3zM19 3l-1-1-1 1c-1 1-2 2-2 4s.9 3 2 3 2-1 2-3-1-3-2-4zm-7 0l-1-1-1 1c-1 1-2 2-2 4s.9 3 2 3 2-1 2-3-1-3-2-4z');
    return i('M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');
  }

  function poiColor(tags) {
    const a = tags.amenity, s = tags.shop, t = tags.tourism, l = tags.leisure;
    if (a === 'restaurant' || a === 'cafe' || a === 'fast_food' || a === 'food_court') return '#E8420C';
    if (a === 'hospital' || a === 'clinic' || a === 'pharmacy') return '#D32F2F';
    if (a === 'school' || a === 'university' || a === 'college') return '#1565C0';
    if (a === 'bank' || a === 'atm')          return '#2E7D32';
    if (a === 'fuel')                         return '#E65100';
    if (a === 'police')                       return '#283593';
    if (a === 'place_of_worship')             return '#6A1B9A';
    if (a === 'bus_station')                  return '#00695C';
    if (s || a === 'marketplace' || a === 'convenience') return '#6A1B9A';
    if (t)                                    return '#BF360C';
    if (l === 'park')                         return '#2E7D32';
    if (l)                                    return '#00695C';
    return '#546E7A';
  }

  return { fetchNearby, fetchAround, getLatLng, closest, categoryLabel, formatAddress, getWikiPhoto, getPlacePhoto, poiIcon, poiColor };
})();
