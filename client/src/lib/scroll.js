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
}
