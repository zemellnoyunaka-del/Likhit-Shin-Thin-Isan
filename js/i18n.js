/* ============================================================
   i18n.js – Internationalisation (TH / EN)
   ============================================================ */

const I18n = (() => {
  const STORAGE_KEY = 'voiceMapLang';

  const translations = {
    th: {
      /* App */
      'app.subtitle':          'แผนที่เสียงพูดได้',
      /* Bottom nav */
      'nav.home':              'หน้าหลัก',
      'nav.map':               'แผนที่',
      'nav.voicemap':          'Voice Map',
      'nav.settings':          'ตั้งค่า',
      /* Home page */
      'home.stat_pins':        '📌 หมุดเสียง',
      'home.stat_visits':      '🔊 เยี่ยมชม',
      'home.btn_map_title':    'แผนที่',
      'home.btn_map_sub':      'สำรวจแผนที่ดาวเทียม',
      'home.btn_voice_title':  'Voice Map',
      'home.btn_voice_sub':    'ค้นหาหมุดเสียงรอบตัว',
      'home.recent':           '📜 เยี่ยมชมล่าสุด',
      'home.no_history':       'ยังไม่มีประวัติการเดินทาง<br>ออกเดินทางแล้วบันทึกอัตโนมัติ',
      /* GPS */
      'gps.searching':         'กำลังค้นหา GPS…',
      'gps.no_support':        'ไม่รองรับ GPS',
      'gps.no_permission':     'ไม่ได้รับสิทธิ์ GPS',
      'gps.no_signal':         'ไม่พบสัญญาณ GPS',
      'gps.timeout':           'GPS หมดเวลา',
      'gps.error':             'GPS ผิดพลาด',
      /* Search */
      'search.placeholder':    'ค้นหาสถานที่…',
      'search.searching':      'กำลังค้นหา…',
      'search.no_result':      'ไม่พบสถานที่',
      'search.error':          'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง',
      /* Bottom panel */
      'panel.loading':         'กำลังโหลด…',
      'panel.no_pins':         'ยังไม่มีจุดพิเศษ',
      'panel.pins':            'จุดพิเศษบนแผนที่',
      'panel.center':          '🎯 ตำแหน่งของฉัน',
      'panel.nav_to':          '🧭 นำทางไปยัง',
      'panel.remain':          'ระยะเหลือ',
      'panel.time':            'เวลาโดยประมาณ',
      'panel.stop_nav':        '⏹️ หยุดนำทาง',
      /* Pin sheet */
      'sheet.dist':            'ระยะห่าง:',
      'sheet.navigate':        '🧭 นำทาง',
      'sheet.play':            '🔊 ฟังเสียง',
      'sheet.playing':         '⏸️ หยุดเล่น',
      'sheet.loading_audio':   '⏳ กำลังโหลด…',
      /* Place sheet */
      'place.navigate':        '🧭 นำทาง',
      'place.gmaps':           '🗺️ Google Maps',
      'place.loading':         'กำลังค้นหาข้อมูล…',
      /* Toasts */
      'toast.no_gps':          'ยังไม่ได้รับสัญญาณ GPS',
      'toast.gps_perm':        'กรุณาเปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์',
      'toast.gps_acc':         'สัญญาณ GPS ยังไม่แม่นยำ (±%s ม.) รอสักครู่',
      'toast.searching':       'กำลังค้นหาตำแหน่ง GPS…',
      'toast.loading':         'กำลังค้นหาตำแหน่ง…',
      /* Left panel */
      'lp.history':            '📜 ประวัติการเดินทาง',
      'lp.wanderer':           '🧭 ผู้พเนจร',
      'lp.no_history':         'ยังไม่มีประวัติการเดินทาง<br>เดินทางไปถึงหมุดพิเศษเพื่อบันทึก',
      'lp.no_pins':            'ยังไม่มีหมุดพิเศษบนแผนที่',
      'lp.all_pins':           'รายชื่อหมุดพิเศษทั้งหมด',
      'lp.next_level':         'อีก %s ครั้ง → ระดับถัดไป',
      'lp.max_level':          '✨ ระดับสูงสุด ✨',
      'lp.visits_badge':       '%s ครั้ง',
      'lp.unique_pins':        '%s / %s จุดพิเศษ',
      /* Wanderer ranks */
      'rank.beginner':         'ผู้เริ่มต้น',
      'rank.traveler':         'นักเดินทาง',
      'rank.explorer':         'ผู้สำรวจ',
      'rank.adventurer':       'นักผจญภัย',
      'rank.wanderer':         'ผู้พเนจร',
      'rank.legend':           'ผู้พเนจรผู้ยิ่งใหญ่',
      /* Level titles */
      'level.1':               'นักเดินทางฝึกหัด',
      'level.2':               'นักเดินมือใหม่',
      'level.3':               'นักเดินถางผู้เชี่ยวชาญ',
      'level.4':               'นักเดินทางในตำนาน',
      'lp.level':              'ระดับ %s',
      /* History time */
      'time.just_now':         'เพิ่งเดินทางถึง',
      'time.minutes_ago':      '%s นาทีที่แล้ว',
      'time.hours_ago':        '%s ชั่วโมงที่แล้ว',
      'time.today':            'วันนี้',
      'time.yesterday':        'เมื่อวาน',
      /* Home recent */
      'home.just_visited':     'เพิ่งเยี่ยมชม',
      'home.min_ago':          '%s นาทีที่แล้ว',
      'home.hr_ago':           '%s ชั่วโมงที่แล้ว',
      /* Settings */
      'settings.title':        'ตั้งค่า',
      'settings.lang_title':   'ภาษา / Language',
      'settings.lang_desc':    'เลือกภาษาที่ใช้แสดงผล',
      'settings.lang_th':      'ภาษาไทย',
      'settings.lang_en':      'English',
      'settings.about':        'เกี่ยวกับ',
      'settings.version':      'Voice Map v1.0',
    },

    en: {
      /* App */
      'app.subtitle':          'Talking Audio Map',
      /* Bottom nav */
      'nav.home':              'Home',
      'nav.map':               'Map',
      'nav.voicemap':          'Voice Map',
      'nav.settings':          'Settings',
      /* Home page */
      'home.stat_pins':        '📌 Audio Pins',
      'home.stat_visits':      '🔊 Visited',
      'home.btn_map_title':    'Map',
      'home.btn_map_sub':      'Explore satellite map',
      'home.btn_voice_title':  'Voice Map',
      'home.btn_voice_sub':    'Find nearby audio pins',
      'home.recent':           '📜 Recent Visits',
      'home.no_history':       'No travel history yet<br>Visit pins to record automatically',
      /* GPS */
      'gps.searching':         'Searching GPS…',
      'gps.no_support':        'GPS not supported',
      'gps.no_permission':     'GPS permission denied',
      'gps.no_signal':         'GPS signal not found',
      'gps.timeout':           'GPS timeout',
      'gps.error':             'GPS error',
      /* Search */
      'search.placeholder':    'Search places…',
      'search.searching':      'Searching…',
      'search.no_result':      'No places found',
      'search.error':          'An error occurred, please try again',
      /* Bottom panel */
      'panel.loading':         'Loading…',
      'panel.no_pins':         'No special pins yet',
      'panel.pins':            'pins on map',
      'panel.center':          '🎯 My Location',
      'panel.nav_to':          '🧭 Navigating to',
      'panel.remain':          'Distance',
      'panel.time':            'Est. Time',
      'panel.stop_nav':        '⏹️ Stop Navigation',
      /* Pin sheet */
      'sheet.dist':            'Distance:',
      'sheet.navigate':        '🧭 Navigate',
      'sheet.play':            '🔊 Play Audio',
      'sheet.playing':         '⏸️ Stop',
      'sheet.loading_audio':   '⏳ Loading…',
      /* Place sheet */
      'place.navigate':        '🧭 Navigate',
      'place.gmaps':           '🗺️ Google Maps',
      'place.loading':         'Fetching information…',
      /* Toasts */
      'toast.no_gps':          'GPS signal not received yet',
      'toast.gps_perm':        'Please enable location in browser settings',
      'toast.gps_acc':         'GPS not accurate yet (±%s m), please wait',
      'toast.searching':       'Searching for GPS location…',
      'toast.loading':         'Searching for location…',
      /* Left panel */
      'lp.history':            '📜 Travel History',
      'lp.wanderer':           '🧭 Wanderer',
      'lp.no_history':         'No travel history yet<br>Visit special pins to record',
      'lp.no_pins':            'No special pins on map',
      'lp.all_pins':           'All special pins',
      'lp.next_level':         '%s more → next level',
      'lp.max_level':          '✨ Max Level ✨',
      'lp.visits_badge':       '%s visits',
      'lp.unique_pins':        '%s / %s pins',
      /* Wanderer ranks */
      'rank.beginner':         'Beginner',
      'rank.traveler':         'Traveler',
      'rank.explorer':         'Explorer',
      'rank.adventurer':       'Adventurer',
      'rank.wanderer':         'Wanderer',
      'rank.legend':           'Legendary Wanderer',
      /* Level titles */
      'level.1':               'Trainee Traveler',
      'level.2':               'Novice Walker',
      'level.3':               'Expert Pathfinder',
      'level.4':               'Legendary Wanderer',
      'lp.level':              'Level %s',
      /* History time */
      'time.just_now':         'Just arrived',
      'time.minutes_ago':      '%s min ago',
      'time.hours_ago':        '%s hr ago',
      'time.today':            'Today',
      'time.yesterday':        'Yesterday',
      /* Home recent */
      'home.just_visited':     'Just visited',
      'home.min_ago':          '%s min ago',
      'home.hr_ago':           '%s hr ago',
      /* Settings */
      'settings.title':        'Settings',
      'settings.lang_title':   'Language',
      'settings.lang_desc':    'Select display language',
      'settings.lang_th':      'ภาษาไทย',
      'settings.lang_en':      'English',
      'settings.about':        'About',
      'settings.version':      'Voice Map v1.0',
    }
  };

  let _lang = localStorage.getItem(STORAGE_KEY) || 'th';

  /* t(key, ...args) – %s placeholders replaced in order */
  function t(key, ...args) {
    let str = (translations[_lang] || translations.th)[key] || key;
    args.forEach(a => { str = str.replace('%s', a); });
    return str;
  }

  function getLang() { return _lang; }

  function setLang(lang) {
    if (!translations[lang] || lang === _lang) return;
    _lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    apply();
    /* Notify app to refresh dynamic text */
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.innerHTML = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    /* Mark active lang button */
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === _lang);
    });
    document.documentElement.lang = _lang;
  }

  return { t, getLang, setLang, apply };
})();
