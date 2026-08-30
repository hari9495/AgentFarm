import PricingGrowth from '@/components/home/previews/PricingGrowth';

export const metadata = { title: 'Pricing preview — Growth Plans' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <PricingGrowth />
    </main>
  );
}
