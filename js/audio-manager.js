/* ============================================================
   audio-manager.js – Recording & playback helpers
   ============================================================ */

const AudioManager = (() => {
  let mediaRecorder = null;
  let chunks = [];
  let isRecording = false;
  let currentAudio = null;
  let timerInterval = null;
  let startTime = null;
  const MAX_MS = 60_000;

  function bestMime() {
    for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  async function startRecording(onTick) {
    if (isRecording) return null;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = bestMime();
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    chunks = [];
    isRecording = true;
    startTime = Date.now();

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.start(100);

    timerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (onTick) onTick(elapsed);
      if (elapsed >= MAX_MS) stopRecording();
    }, 100);

    return stream;
  }

  async function stopRecording() {
    return new Promise(resolve => {
      if (!mediaRecorder || !isRecording) { resolve(null); return; }
      clearInterval(timerInterval);
      isRecording = false;

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        chunks = [];
        mediaRecorder = null;
        resolve(blob);
      };
      mediaRecorder.stop();
    });
  }

  async function playBlob(blob) {
    stopPlayback();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
    try { await currentAudio.play(); }
    catch (e) {
      URL.revokeObjectURL(url);
      currentAudio = null;
      throw e;
    }
    return currentAudio;
  }

  function stopPlayback() {
    if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
  }

  function formatMs(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  return {
    get isRecording() { return isRecording; },
    startRecording, stopRecording, playBlob, stopPlayback, formatMs
  };
})();
