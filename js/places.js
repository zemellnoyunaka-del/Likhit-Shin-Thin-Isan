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
    if (a === 'hospital' || a === 'clinic')    return '🏥';
    if (a === 'pharmacy')                      return '💊';
    if (a === 'restaurant')                    return '🍽️';
    if (a === 'cafe')                          return '☕';
    if (a === 'fast_food')                     return '🍔';
    if (a === 'food_court')                    return '🍱';
    if (a === 'bank')                          return '🏦';
    if (a === 'atm')                           return '🏧';
    if (a === 'school')                        return '🏫';
    if (a === 'university' || a === 'college') return '🎓';
    if (a === 'fuel')                          return '⛽';
    if (a === 'police')                        return '👮';
    if (a === 'post_office')                   return '📮';
    if (a === 'place_of_worship')              return '🙏';
    if (a === 'bus_station')                   return '🚌';
    if (a === 'marketplace')                   return '🏪';
    if (a === 'convenience')                   return '🏪';
    if (a === 'supermarket' || s === 'supermarket') return '🛒';
    if (s === 'clothes')                       return '👗';
    if (s === 'electronics')                   return '📱';
    if (s === 'bakery')                        return '🥖';
    if (s)                                     return '🛍️';
    if (t === 'hotel' || a === 'hotel')        return '🏨';
    if (t === 'attraction')                    return '🎯';
    if (t === 'museum')                        return '🏛️';
    if (t === 'viewpoint')                     return '🌄';
    if (l === 'park')                          return '🌳';
    if (l === 'fitness_centre')                return '💪';
    return '📍';
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

  return { fetchNearby, fetchAround, getLatLng, closest, categoryLabel, formatAddress, getWikiPhoto, poiIcon, poiColor };
})();
