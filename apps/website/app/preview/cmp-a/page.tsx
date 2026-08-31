import PricingComparison from '@/components/pricing/PricingComparison';

export const metadata = { title: 'Comparison — Option A (value matrix)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <PricingComparison />
      </section>
    </main>
  );
}
