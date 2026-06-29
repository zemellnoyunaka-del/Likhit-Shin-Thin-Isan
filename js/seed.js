/* ============================================================
   seed.js – Pre-seeded pins with bundled audio files
   Run once at startup; skips if data already exists.
   ============================================================ */

const SeedData = (() => {

  const SEEDS = [
    // เพิ่ม seed pins อื่น ๆ ได้ที่นี่
  ];

  /* IDs ของ seed pins ที่ถูกลบออก — จะถูกลบจาก storage ทุกครั้งที่ app เปิด */
  const REMOVED_SEED_IDS = [
    'pin_seed_001', // โรงเรียนเทศบาลวัดกลาง
  ];

  async function run() {
    /* ลบ pins ที่ถูก retire ออกจาก storage (รวม audio) */
    for (const id of REMOVED_SEED_IDS) {
      if (PinStorage.getAll().find(p => p.id === id)) {
        PinStorage.del(id);
        console.info(`[Seed] ลบหมุด "${id}" ออกแล้ว`);
      }
    }
    for (const seed of SEEDS) {
      await _seedOne(seed);
    }
  }

  async function _seedOne({ pin, audioFile }) {
    const existing = PinStorage.getAll().find(p => p.id === pin.id);

    // อัปเดตชื่อถ้าชื่อเปลี่ยน (migration)
    if (existing) {
      if (existing.name !== pin.name) PinStorage.update(pin.id, { name: pin.name });
      return;
    }

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
