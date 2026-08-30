import PricingClean from '@/components/home/previews/PricingClean';

export const metadata = { title: 'Pricing preview — Clean 3-tier' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <PricingClean />
    </main>
  );
}
