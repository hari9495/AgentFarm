import type { Metadata } from 'next';
import { productPageContent } from '@/lib/marketing-content';
import ProductHeroSplit from '@/components/product/ProductHeroSplit';
import HowItWorksSteps from '@/components/product/HowItWorksSteps';
import ProductFeaturesGrid from '@/components/product/ProductFeaturesGrid';
import ProductDemoFramed from '@/components/product/ProductDemoFramed';
import ProductCTAClean from '@/components/product/ProductCTAClean';

export const metadata: Metadata = {
  title: productPageContent.metadata.title,
  description: productPageContent.metadata.description,
};

// Sections chosen via A/B (21st.dev-sourced, adapted to op-* tokens):
//   Hero        = split (copy + approval-gate panel)     [standard sub-page hero]
//   How it works= 7ovr/how-it-works-1 (step cards)       [Option A]
//   Features    = gooseui/features-grid (icon cards)     [Option A]
//   Demo        = framed worker-run flow                 [Option A]  (swap: ProductDemoCentered)
//   CTA         = clean light                            [Option A]  (swap: ProductCTABold)
export default function ProductPage() {
  return (
    <div>
      <ProductHeroSplit />

      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <HowItWorksSteps />
      </section>

      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <ProductFeaturesGrid />
      </section>

      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <ProductDemoFramed />
      </section>

      <section className="op-light" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <ProductCTAClean />
      </section>
    </div>
  );
}
