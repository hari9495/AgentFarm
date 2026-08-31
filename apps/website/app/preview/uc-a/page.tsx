import UseCasesRows from '@/components/use-cases/UseCasesRows';

export const metadata = { title: 'Use cases — Option A (alternating rows)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <UseCasesRows />
      </section>
    </main>
  );
}
