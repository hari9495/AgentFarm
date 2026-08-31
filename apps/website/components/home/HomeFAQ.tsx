/** Home FAQ — the shared pulled FAQ (moumensoliman/faq-section) fed home content. */

import SharedFAQ from '@/components/shared/SharedFAQ';
import { homeMarketingContent } from '@/lib/marketing-content';

export default function HomeFAQ() {
  const { faq } = homeMarketingContent;
  return (
    <section className="op-light" style={{ paddingTop: 88, paddingBottom: 88 }}>
      <SharedFAQ heading={faq.title} subtitle={faq.description} faqs={faq.items.map((f) => ({ question: f.question, answer: f.answer }))} />
    </section>
  );
}
