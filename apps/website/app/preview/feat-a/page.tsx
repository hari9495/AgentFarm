import ProductFeaturesGrid from '@/components/product/ProductFeaturesGrid';

export const metadata = { title: 'Features — Option A (icon cards)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <ProductFeaturesGrid />
      </section>
    </main>
  );
}
