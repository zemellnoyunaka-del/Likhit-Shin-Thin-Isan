/* ============================================================
   i18n.js – Thai only
   ============================================================ */

const I18n = (() => {
  const strings = {
    'app.subtitle':          'แผนที่เสียงพูดได้',
    'nav.home':              'หน้าหลัก',
    'nav.map':               'แผนที่',
    'nav.voicemap':          'หน้าหลัก',
    'nav.settings':          'ตั้งค่า',
    'home.stat_pins':        'หมุดเสียง',
    'home.stat_visits':      'เยี่ยมชม',
    'home.btn_map_title':    'แผนที่',
    'home.btn_map_sub':      'สำรวจแผนที่ดาวเทียม',
    'home.btn_voice_title':  'แผนที่นิราศ',
    'home.btn_voice_sub':    'ค้นหาหมุดเสียงรอบตัว',
    'home.recent':           'เยี่ยมชมล่าสุด',
    'home.no_history':       'ยังไม่มีประวัติการเดินทาง<br>ออกเดินทางแล้วบันทึกอัตโนมัติ',
    'home.just_visited':     'เพิ่งเยี่ยมชม',
    'home.min_ago':          '%s นาทีที่แล้ว',
    'home.hr_ago':           '%s ชั่วโมงที่แล้ว',
    'gps.searching':         'กำลังค้นหา GPS…',
    'gps.no_support':        'ไม่รองรับ GPS',
    'gps.no_permission':     'ไม่ได้รับสิทธิ์ GPS',
    'gps.no_signal':         'ไม่พบสัญญาณ GPS',
    'gps.timeout':           'GPS หมดเวลา',
    'gps.error':             'GPS ผิดพลาด',
    'search.placeholder':    'ค้นหาสถานที่…',
    'search.searching':      'กำลังค้นหา…',
    'search.no_result':      'ไม่พบสถานที่',
    'search.error':          'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง',
    'panel.loading':         'กำลังโหลด…',
    'panel.no_pins':         'ยังไม่มีจุดพิเศษ',
    'panel.pins':            'จุดพิเศษบนแผนที่',
    'panel.center':          'ตำแหน่งของฉัน',
    'panel.nav_to':          'นำทางไปยัง',
    'panel.remain':          'ระยะเหลือ',
    'panel.time':            'เวลาโดยประมาณ',
    'panel.stop_nav':        'หยุดนำทาง',
    'sheet.dist':            'ระยะห่าง:',
    'sheet.navigate':        'นำทาง',
    'sheet.play':            'ฟังเสียง',
    'sheet.playing':         'หยุดเล่น',
    'sheet.loading_audio':   '⏳ กำลังโหลด…',
    'place.navigate':        'นำทาง',
    'place.gmaps':           'Google Maps',
    'place.loading':         'กำลังค้นหาข้อมูล…',
    'toast.no_gps':          'ยังไม่ได้รับสัญญาณ GPS',
    'toast.gps_perm':        'กรุณาเปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์',
    'toast.gps_acc':         'สัญญาณ GPS ยังไม่แม่นยำ (±%s ม.) รอสักครู่',
    'toast.searching':       'กำลังค้นหาตำแหน่ง GPS…',
    'toast.loading':         'กำลังค้นหาตำแหน่ง…',
    'lp.history':            'ประวัติการเดินทาง',
    'lp.wanderer':           'บันทึกการเดินทาง',
    'lp.no_history':         'ยังไม่มีประวัติการเดินทาง<br>เดินทางไปถึงหมุดพิเศษเพื่อบันทึก',
    'lp.no_pins':            'ยังไม่มีหมุดพิเศษบนแผนที่',
    'lp.all_pins':           'รายชื่อหมุดพิเศษทั้งหมด',
    'lp.next_level':         'อีก %s ครั้ง → ระดับถัดไป',
    'lp.max_level':          '✨ ระดับสูงสุด ✨',
    'lp.visits_badge':       '%s ครั้ง',
    'lp.unique_pins':        '%s / %s จุดพิเศษ',
    'rank.beginner':         'ผู้เริ่มต้น',
    'rank.traveler':         'นักเดินทาง',
    'rank.explorer':         'นักสำรวจ',
    'rank.adventurer':       'นักผจญภัย',
    'rank.wanderer':         'ผู้พเนจร',
    'rank.legend':           'ผู้พเนจรผู้ยิ่งใหญ่',
    'level.1':               'นักเดินทางฝึกหัด',
    'level.2':               'นักเดินมือใหม่',
    'level.3':               'นักเดินถางผู้เชี่ยวชาญ',
    'level.4':               'นักเดินทางในตำนาน',
    'lp.level':              'ระดับ %s',
    'time.just_now':         'เพิ่งเดินทางถึง',
    'time.minutes_ago':      '%s นาทีที่แล้ว',
    'time.hours_ago':        '%s ชั่วโมงที่แล้ว',
    'time.today':            'วันนี้',
    'time.yesterday':        'เมื่อวาน',
    'settings.title':        'ตั้งค่า',
    'settings.about':        'เกี่ยวกับ',
    'settings.version':      'แผนที่นิราศ v1.0',
  };

  function t(key, ...args) {
    let str = strings[key] || key;
    args.forEach(a => { str = str.replace('%s', a); });
    return str;
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.innerHTML = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.documentElement.lang = 'th';
  }

  return { t, apply };
})();
