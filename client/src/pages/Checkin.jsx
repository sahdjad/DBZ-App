import { useEffect, useState } from 'react';
import { QrCode, CheckCircle2, Camera, Keyboard } from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, StatusBadge, useToast } from '../components/ui.jsx';
import { QrScanner, qrScanSupported } from '../components/QrCode.jsx';

export default function Checkin() {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);

  useEffect(() => {
    qrScanSupported().then(setCanScan);
  }, []);

  const doCheckin = async (token) => {
    setBusy(true);
    try {
      const r = await api.post('/checkin', { token: token.trim() });
      setResult(r);
      toast.push(r.already ? 'Du warst bereits eingecheckt' : 'Check-in erfolgreich', 'success');
    } catch (err) {
      setResult(null);
      toast.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    doCheckin(code);
  };

  const onScan = (value) => {
    setScanning(false);
    setCode(value);
    doCheckin(value);
  };

  return (
    <AppLayout title="Einchecken">
      <div className="max-w-md mx-auto">
        <Card className="p-6">
          <CardHeader
            title="Zum Unterricht einchecken"
            subtitle="Scanne den QR-Code oder gib den Code ein"
            icon={QrCode}
          />
          <div className="p-4 space-y-4">
            {canScan && (
              <>
                {scanning ? (
                  <div className="space-y-3">
                    <QrScanner
                      onResult={onScan}
                      onError={() => {
                        setScanning(false);
                        toast.push('Kamera nicht verfügbar – bitte Code eingeben', 'error');
                      }}
                    />
                    <Button variant="ghost" className="w-full" onClick={() => setScanning(false)}>
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <Button size="lg" className="w-full" onClick={() => setScanning(true)}>
                    <Camera size={18} /> QR-Code scannen
                  </Button>
                )}
                <div className="flex items-center gap-3 text-xs text-sage-muted">
                  <span className="h-px flex-1 bg-subtle" /> oder Code eingeben <span className="h-px flex-1 bg-subtle" />
                </div>
              </>
            )}

            <form onSubmit={submit} className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-sage-muted">
                <Keyboard size={16} /> Code der Lehrkraft
              </div>
              <input
                className="input text-center font-mono text-lg tracking-widest uppercase"
                placeholder="CODE"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Prüfe …' : 'Einchecken'}
              </Button>
            </form>
          </div>

          {result && (
            <div className="p-4 border-t border-line flex items-center gap-3">
              <CheckCircle2 className="text-status-present" />
              <div>
                <div className="text-ivory flex items-center gap-2">
                  Status: <StatusBadge status={result.status} />
                </div>
                {result.minutesLate > 0 && (
                  <div className="text-xs text-sage-muted mt-1">{result.minutesLate} Minuten verspätet</div>
                )}
              </div>
            </div>
          )}
        </Card>
        <p className="text-xs text-sage-muted mt-4 text-center">
          Die Check-in-Zeit wird serverseitig gespeichert. Der Code ist nur kurze Zeit gültig.
        </p>
      </div>
    </AppLayout>
  );
}
