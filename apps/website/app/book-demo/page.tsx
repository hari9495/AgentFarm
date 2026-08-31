import type { Metadata } from 'next';
import BookDemoSectionB from '@/components/book-demo/BookDemoSectionB';

export const metadata: Metadata = {
  title: 'Book a Demo — See a Governed AI Worker in Action | AgentFarms',
  description:
    'Book a 30-minute demo with the AgentFarms team. See a live AI worker complete a real task end-to-end, ask about approval gates and evidence, and scope your first workflow.',
  alternates: { canonical: 'https://agentfarms.in/book-demo' },
  openGraph: {
    title: 'Book a Demo — See a Governed AI Worker in Action | AgentFarms',
    description: 'A 30-minute live demo with the AgentFarms team — governed AI workers, approval gates, and evidence.',
    url: 'https://agentfarms.in/book-demo',
    type: 'website',
  },
};

export default function BookDemoPage() {
  return (
    <div>
      {/* Book-a-demo section — pulled layout (21st.dev: designali-in/book-a-demo-3) */}
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 96 }}>
        <BookDemoSectionB />
      </section>
    </div>
  );
}
