import HowItWorksTimeline from '@/components/product/HowItWorksTimeline';

export const metadata = { title: 'How It Works — Option B (timeline)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <HowItWorksTimeline />
      </section>
    </main>
  );
}
