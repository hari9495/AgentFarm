import HowItWorksSteps from '@/components/product/HowItWorksSteps';

export const metadata = { title: 'How It Works — Option A (step cards)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <HowItWorksSteps />
      </section>
    </main>
  );
}
