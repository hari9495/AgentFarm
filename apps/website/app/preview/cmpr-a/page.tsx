import CompareMatrix from '@/components/compare/CompareMatrix';

export const metadata = { title: 'Compare — Option A (full matrix)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <CompareMatrix />
      </section>
    </main>
  );
}
