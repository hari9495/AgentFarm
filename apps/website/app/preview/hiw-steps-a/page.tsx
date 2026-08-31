import FeatureStepsShowcase from '@/components/how-it-works/FeatureStepsShowcase';

export const metadata = { title: 'How-it-works steps — Option A (showcase)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <FeatureStepsShowcase />
      </section>
    </main>
  );
}
