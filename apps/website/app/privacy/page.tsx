import type { Metadata } from 'next';
import { privacyPageContent } from '@/lib/marketing-content';
import LegalDoc from '@/components/legal/LegalDoc';

export const metadata: Metadata = {
  title: privacyPageContent.metadata.title,
  description: privacyPageContent.metadata.description,
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      title={privacyPageContent.title}
      updatedAt={privacyPageContent.updatedAt}
      intro={privacyPageContent.intro}
      sections={privacyPageContent.sections}
    />
  );
}
