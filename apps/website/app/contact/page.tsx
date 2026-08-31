import type { Metadata } from 'next';
import { contactItems } from '@/components/contact/contact-data';
import ContactSplitSection from '@/components/contact/ContactSplitSection';
import ContactForm from '@/components/shared/ContactForm';

export const metadata: Metadata = {
  title: 'Contact the AgentFarms Team — Demos and Partnerships',
  description: 'Get in touch with the AgentFarms team about demos, partnerships, enterprise plans, or questions about governed AI workers. We respond within one business day.',
};

export default function ContactPage() {
  return (
    <div>
      {/* Contact section — pulled two-column split (21st.dev: shadcnspace/contact-01) */}
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 96 }}>
        <ContactSplitSection
          eyebrow="Contact"
          title="Get in touch"
          description="Questions about the platform, a demo request, or a partnership inquiry — we read everything and respond fast."
          info={contactItems}
        >
          <ContactForm />
        </ContactSplitSection>
      </section>
    </div>
  );
}
