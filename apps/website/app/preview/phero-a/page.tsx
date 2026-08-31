import ProductHeroSplit from '@/components/product/ProductHeroSplit';

export const metadata = { title: 'Product hero — Option A (split)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <ProductHeroSplit />
    </main>
  );
}
