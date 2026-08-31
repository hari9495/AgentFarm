/** Home CTA — the shared pulled CTA (shadcnblocks/cta11) fed home content. */

import SharedCTA from '@/components/shared/SharedCTA';
import { homeMarketingContent } from '@/lib/marketing-content';

export default function HomeCTA() {
  const { cta } = homeMarketingContent;
  return (
    <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
      <SharedCTA
        badge={cta.badge}
        heading={`${cta.titleLead} ${cta.titleAccent}`}
        description={cta.description}
        primary={{ label: 'Start free trial', href: '/get-started' }}
        secondary={{ label: 'Book a demo', href: '/book-demo' }}
        trustItems={[...cta.trustItems]}
      />
    </section>
  );
}
