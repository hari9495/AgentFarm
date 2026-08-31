import ProductHeroCentered from '@/components/product/ProductHeroCentered';

export const metadata = { title: 'Product hero — Option B (centered)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <ProductHeroCentered />
    </main>
  );
}
