import ProductFeaturesGridB from '@/components/product/ProductFeaturesGridB';

export const metadata = { title: 'Features — Option B (dashed grid)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <ProductFeaturesGridB />
      </section>
    </main>
  );
}
