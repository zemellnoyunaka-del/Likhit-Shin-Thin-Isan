/* ============================================================
   seed.js – Pre-seeded pins with bundled audio files
   Run once at startup; skips if data already exists.
   ============================================================ */

const SeedData = (() => {

  const SEEDS = [
    {
      pin: {
        id:          'pin_seed_001',
        name:        'จุดพิเศษ',
        description: '',
        lat:         16.41326201980522,
        lng:         102.83149808400525,
        radius:      20,   // trigger radius in metres (overrides global PROX_M)
        createdAt:   0
      },
      audioFile: 'merged.mp3'
    }
    // เพิ่ม seed pins อื่น ๆ ได้ที่นี่
  ];

  async function run() {
    for (const seed of SEEDS) {
      await _seedOne(seed);
    }
  }

  async function _seedOne({ pin, audioFile }) {
    // ถ้ามี pin นี้อยู่แล้วให้ข้าม
    if (PinStorage.getAll().some(p => p.id === pin.id)) return;

    // บันทึก pin metadata
    PinStorage.add({ ...pin, createdAt: Date.now() });

    // โหลดและบันทึก audio
    if (!audioFile) return;
    try {
      const res = await fetch(audioFile);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      await VoiceMapDB.saveAudio(pin.id, blob);
      console.info(`[Seed] "${pin.name}" พร้อมใช้งาน (radius ${pin.radius}m)`);
    } catch (err) {
      console.warn(`[Seed] โหลดเสียงไม่ได้: ${err.message}`);
    }
  }

  return { run };
})();
