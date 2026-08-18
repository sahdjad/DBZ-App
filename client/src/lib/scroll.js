// Verleiht dem Scrollen ein weicheres, „lebendigeres" Gefühl:
// - markiert aktives Scrollen (Scrollleiste wird kurz kräftiger/breiter)
// - markiert das obere/untere Ende (Scrollleiste wird dezent zurückgenommen)
// Die eigentliche Optik steckt in index.css (::-webkit-scrollbar + .is-scrolling/.at-edge).
// Reine Fortschritts-/Zustandsmarkierung – kein Eingriff ins native Scrollen.

export function initScrollFeel() {
  if (typeof window === 'undefined' || window.__dbzScrollFeel) return;
  window.__dbzScrollFeel = true;

  const root = document.documentElement;
  let idleTimer;

  const update = () => {
    root.classList.add('is-scrolling');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => root.classList.remove('is-scrolling'), 650);

    const atTop = window.scrollY <= 2;
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
    root.classList.toggle('at-edge', atTop || atBottom);
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();

  // --- Weiches Abfedern am oberen/unteren Rand (Rubber-Band) ---
  // Wenn die Seite nicht weiter scrollen kann, den Inhalt minimal und gedämpft
  // verschieben und danach zurückfedern. Funktioniert auch in Chrome/Desktop.
  let offset = 0;
  let releaseTimer;
  const mainEl = () => document.querySelector('main');

  const release = () => {
    const m = mainEl();
    if (!m) return;
    m.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
    m.style.transform = 'translateY(0)';
    offset = 0;
  };

  window.addEventListener(
    'wheel',
    (e) => {
      const m = mainEl();
      if (!m) return;
      const atTop = window.scrollY <= 0;
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 1;
      const past = (atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0);
      if (!past) {
        if (offset !== 0) release();
        return;
      }
      // gedämpft aufsummieren, hart begrenzen
      offset = Math.max(-46, Math.min(46, offset - e.deltaY * 0.05));
      m.style.transition = 'none';
      m.style.transform = `translateY(${offset}px)`;
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(release, 90);
    },
    { passive: true },
  );
}
