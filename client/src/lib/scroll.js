// Weiches, hochwertiges Scroll-Gefühl für einen bestimmten Scroll-Container
// (der Hauptinhalt in AppLayout). Grundsatz: das NATIVE Scroll-/Federverhalten
// des Systems hat Vorrang (iOS/iPadOS/macOS Safari federn selbst). Nur wo der
// Browser am Rand hart stoppt (v. a. Chrome/Desktop), ergänzen wir ein dezentes
// Abfedern. Zusätzlich: Scrollleiste wird beim Scrollen kurz kräftiger und am
// oberen/unteren Ende sanft zurückgenommen.

const supportsTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Hängt das Scroll-Gefühl an ein Element. Gibt eine Aufräum-Funktion zurück.
 * @param {HTMLElement|null} el Scroll-Container (overflow-y: auto)
 */
export function attachScrollFeel(el) {
  if (!el) return () => {};

  let idle;
  const inner = el.firstElementChild;
  let offset = 0;
  let releaseTimer;

  const markState = () => {
    el.classList.add('is-scrolling');
    clearTimeout(idle);
    idle = setTimeout(() => el.classList.remove('is-scrolling'), 650);
    const atTop = el.scrollTop <= 2;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    el.classList.toggle('at-edge', atTop || atBottom);
  };

  const release = () => {
    if (!inner) return;
    inner.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
    inner.style.transform = 'translateY(0)';
    offset = 0;
  };

  // Rand-Abfedern nur dort, wo es kein natives Bouncen gibt (Maus/Trackpad-Wheel,
  // v. a. Desktop-Chrome). Auf Touch-Geräten übernimmt das System das Federn.
  const onWheel = (e) => {
    if (supportsTouch || reduceMotion || !inner) return;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const past = (atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0);
    if (!past) {
      if (offset !== 0) release();
      return;
    }
    offset = Math.max(-46, Math.min(46, offset - e.deltaY * 0.05));
    inner.style.transition = 'none';
    inner.style.transform = `translateY(${offset}px)`;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(release, 90);
  };

  el.addEventListener('scroll', markState, { passive: true });
  el.addEventListener('wheel', onWheel, { passive: true });
  markState();

  return () => {
    el.removeEventListener('scroll', markState);
    el.removeEventListener('wheel', onWheel);
    clearTimeout(idle);
    clearTimeout(releaseTimer);
  };
}
