'use client';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8FAFC', color: '#111827' }}>
        <main style={{ maxWidth: 560, padding: 32, textAlign: 'center' }}>
          <p style={{ marginBottom: 12, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0F6E56' }}>I’m This</p>
          <h1 style={{ margin: '0 0 12px', fontSize: 32, lineHeight: 1.15 }}>Something went wrong</h1>
          <p style={{ margin: '0 0 24px', color: '#4B5563', lineHeight: 1.7 }}>
            The app hit an unexpected error while rendering this page. You can retry or refresh the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#0F6E56',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '12px 18px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
          {error?.message ? (
            <p style={{ marginTop: 20, color: '#6B7280', fontSize: 13, wordBreak: 'break-word' }}>
              {error.message}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
