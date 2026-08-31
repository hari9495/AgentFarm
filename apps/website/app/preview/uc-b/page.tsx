import UseCasesTabs from '@/components/use-cases/UseCasesTabs';

export const metadata = { title: 'Use cases — Option B (tabbed explorer)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <UseCasesTabs />
      </section>
    </main>
  );
}
