import React from 'react';

// Fehlergrenze: Stürzt eine Seite beim Darstellen ab, bleibt sonst nur eine
// leere Fläche. Hier erscheint stattdessen eine verständliche Meldung mit zwei
// Auswegen. Beim Wechsel der Seite wird der Fehler zurückgesetzt -- der Rest
// der App bleibt benutzbar. Häufigster Anlass: nach einem Update fehlt eine
// alte, nachgeladene Datei; „Neu laden" holt dann die aktuelle Version.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[app] Darstellungsfehler:', error, info?.componentStack);
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.reset);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.reset);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="min-h-[100dvh] flex items-center justify-center p-6 bg-bg text-ivory">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold">Hier ist etwas schiefgelaufen</h1>
          <p className="text-sm text-sage">Diese Seite konnte nicht angezeigt werden. Deine Daten sind davon nicht betroffen.</p>
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-primary min-h-[2.75rem] rounded-xl bg-mint text-onaccent font-semibold px-4" onClick={() => window.location.reload()}>
              Neu laden
            </button>
            <button type="button" className="min-h-[2.75rem] rounded-xl border border-line px-4 font-semibold" onClick={() => { window.location.hash = '#/dashboard'; this.reset(); }}>
              Zur Startseite
            </button>
          </div>
        </div>
      </div>
    );
  }
}
