import CompareSwitcher from '@/components/compare/CompareSwitcher';

export const metadata = { title: 'Compare — Option B (competitor switcher)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <CompareSwitcher />
      </section>
    </main>
  );
}
