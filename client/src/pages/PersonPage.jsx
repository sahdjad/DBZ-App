import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Spinner } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { PersonAdminPanel } from '../components/PersonAdmin.jsx';

// Steckbrief einer Person (Leitung/Admin). Schüler landen auf ihrem Profil,
// das zusätzlich Anwesenheit, Aufgaben und Verhalten zeigt.
export default function PersonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [person, setPerson] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/admin/users/${id}`).then((d) => {
      if (['schueler', 'klassensprecher'].includes(d.user.role)) navigate(`/profil/${id}`, { replace: true });
      else setPerson(d.user);
    }).catch((e) => setError(e.message));
  }, [id]);
  return (
    <AppLayout title={person?.name || 'Person'}>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-sage-muted hover:text-ivory mb-4">
        <ArrowLeft size={16} /> Zurück
      </button>
      {error ? <Card className="p-6 text-status-absent">{error}</Card> : !person ? <Spinner /> : (
        <PersonAdminPanel userId={id} viewer={user} onChanged={() => api.get(`/admin/users/${id}`).then((d) => setPerson(d.user)).catch(() => {})} />
      )}
    </AppLayout>
  );
}
