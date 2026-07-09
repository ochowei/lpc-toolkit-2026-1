import { Button } from './ui/button';
import type { AppPath } from '../lib/app-route';

interface NotFoundPageProps {
  readonly onNavigate: (path: AppPath) => void;
}

export function NotFoundPage({ onNavigate }: NotFoundPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-5 text-text">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-mute">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-text">Page not found</h1>
        <p className="mt-3 text-sm text-text-2">
          This route is not part of the local LPC Toolkit web app.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="default" onClick={() => onNavigate('/')}>
            Back to Home
          </Button>
          <Button variant="primary" onClick={() => onNavigate('/compose')}>
            Open Composer
          </Button>
        </div>
      </section>
    </main>
  );
}
