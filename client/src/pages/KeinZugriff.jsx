import { Link } from 'react-router-dom';
import { Lock, Home } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { Button, EmptyState } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

// Seite ist für die aktuelle Rolle gesperrt. Früher wurde stumm zur Startseite
// umgeleitet -- wer einem Link folgte, wusste nicht, was passiert war.
export default function KeinZugriff() {
  const { user } = useAuth();
  const role = user?.roleLabel;
  return (
    <AppLayout title="Kein Zugriff">
      <EmptyState
        icon={Lock}
        title="Diese Seite ist für deine Rolle nicht freigegeben"
        text={role ? `Du bist als „${role}" angemeldet. Hast du mehrere Rollen, kannst du oben im Menü wechseln.` : 'Hast du mehrere Rollen, kannst du oben im Menü wechseln.'}
        action={<Button as={Link} to="/dashboard"><Home size={18} /> Zur Startseite</Button>}
      />
    </AppLayout>
  );
}
