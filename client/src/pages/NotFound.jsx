import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="min-h-screen relative grid place-items-center bg-bg text-center px-6">
      <div className="absolute inset-0 hero-atmosphere hero-image" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-[#0B1E14]" aria-hidden="true" />
      <div className="relative animate-fade-up">
        <div className="font-mono text-mint text-7xl sm:text-8xl">404</div>
        <h1 className="font-display text-3xl sm:text-4xl text-ivory mt-4">Seite nicht gefunden</h1>
        <p className="text-sage mt-3 max-w-md mx-auto">
          Diese Seite existiert nicht oder wurde verschoben.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Button as={Link} to="/dashboard">
            <Home size={18} /> Zum Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
