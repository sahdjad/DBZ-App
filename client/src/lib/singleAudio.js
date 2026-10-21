// Immer nur EIN Audio gleichzeitig: Startet man eine Aufnahme (z. B. in der
// Korrektur), werden alle anderen Audio-/Video-Player auf der Seite pausiert –
// wie bei WhatsApp. „play“ blubbert nicht hoch, daher im Capture-Modus lauschen.
export function installSingleAudio() {
  document.addEventListener('play', (e) => {
    const current = e.target;
    if (!(current instanceof HTMLMediaElement)) return;
    document.querySelectorAll('audio, video').forEach((el) => {
      if (el !== current && !el.paused) el.pause();
    });
  }, true);
}
