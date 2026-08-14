import { useEffect, useState } from 'react';
import { Youtube, Instagram, Share2, ExternalLink } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, Spinner } from '../components/ui.jsx';

const CHANNELS = [
  { key: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-status-absent' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-mint-light' },
  { key: 'tiktok', label: 'TikTok', icon: Share2, color: 'text-ivory' },
];

export default function DbzOnline() {
  const [org, setOrg] = useState(null);
  useEffect(() => { api.get('/org').then((d) => setOrg(d.org)); }, []);

  return (
    <AppLayout title="DBZ Online">
      {!org ? <Spinner /> : (
        <>
          <p className="text-sage mb-4">Die offiziellen Kanäle des {org.name}. Externe Plattformen – Inhalte liegen außerhalb der App.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CHANNELS.map(({ key, label, icon: Icon, color }) => {
              const url = org.socialLinks?.[key];
              if (!url) return null;
              return (
                <a key={key} href={url} target="_blank" rel="noreferrer">
                  <Card className="p-5 hover:bg-hover transition flex flex-col items-center gap-3 text-center">
                    <Icon size={32} className={color} />
                    <div className="text-ivory">{label}</div>
                    <span className="text-xs text-sage-muted inline-flex items-center gap-1">Öffnen <ExternalLink size={12} /></span>
                  </Card>
                </a>
              );
            })}
          </div>
        </>
      )}
    </AppLayout>
  );
}
