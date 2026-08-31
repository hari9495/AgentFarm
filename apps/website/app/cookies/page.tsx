import type { Metadata } from 'next';
import { cookiesPageContent } from '@/lib/marketing-content';
import LegalDoc from '@/components/legal/LegalDoc';

export const metadata: Metadata = {
  title: cookiesPageContent.metadata.title,
  description: cookiesPageContent.metadata.description,
};

export default function CookiesPage() {
  return (
    <LegalDoc
      title={cookiesPageContent.title}
      updatedAt={cookiesPageContent.updatedAt}
      intro={cookiesPageContent.intro}
      sections={cookiesPageContent.sections}
    />
  );
}
