import type { Metadata } from 'next';
import { termsPageContent } from '@/lib/marketing-content';
import LegalDoc from '@/components/legal/LegalDoc';

export const metadata: Metadata = {
  title: termsPageContent.metadata.title,
  description: termsPageContent.metadata.description,
};

export default function TermsPage() {
  return (
    <LegalDoc
      title={termsPageContent.title}
      updatedAt={termsPageContent.updatedAt}
      intro={termsPageContent.intro}
      sections={termsPageContent.sections}
    />
  );
}
