import { LogOut, ChevronRight } from 'lucide-react';
import AppLayout, { useNav, groupNav, badgeFor } from '../components/AppLayout.jsx';
import { Avatar, ListGroup, ListRow, Section } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

// „Mehr“: alle Bereiche, die nicht in der unteren Leiste stehen – gruppiert
// wie die iOS-Einstellungen. Oben das eigene Konto mit Rollenwechsel.
export default function Mehr() {
  return (
    <AppLayout title="Mehr">
      <MehrContent />
    </AppLayout>
  );
}

function MehrContent() {
  const { user } = useAuth();
  const { items, tabs, badges, openAccounts, logout } = useNav();
  const inTabs = new Set(tabs.map((t) => t.to));
  const groups = groupNav(items.filter((i) => !inTabs.has(i.to)));
  return (
    <div className="max-w-2xl mx-auto">
      <button
        type="button"
        onClick={openAccounts}
        className="w-full flex items-center gap-3.5 rounded-2xl bg-card border border-line/70 shadow-card px-4 py-3.5 text-left active:bg-hover transition-colors"
      >
        <Avatar name={user?.name} size={54} />
        <span className="min-w-0 flex-1">
          <span className="block text-title3 font-semibold text-ivory truncate">{user?.name}</span>
          <span className="block text-footnote text-sage-muted truncate">{user?.roleLabel} · Rolle wechseln</span>
        </span>
        <ChevronRight size={18} className="text-sage-muted/60 shrink-0" />
      </button>

      {groups.map((g) => (
        <Section key={g.group} title={g.group} className="mt-6">
          <ListGroup>
            {g.items.map((it) => (
              <ListRow key={it.to} to={it.to} icon={it.icon} title={it.label} badge={badgeFor(it.to, badges)} />
            ))}
          </ListGroup>
        </Section>
      ))}

      <ListGroup className="mt-6">
        <ListRow onClick={logout} icon={LogOut} iconTone="absent" title="Abmelden" danger />
      </ListGroup>
      <p className="text-center text-caption text-sage-muted mt-6">DBZ · Deen Bildungszentrum e.V.</p>
    </div>
  );
}
