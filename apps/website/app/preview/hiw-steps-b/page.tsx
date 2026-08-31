import HowItWorksStepsGrid from '@/components/how-it-works/HowItWorksStepsGrid';

export const metadata = { title: 'How-it-works steps — Option B (cards)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <HowItWorksStepsGrid />
      </section>
    </main>
  );
}
