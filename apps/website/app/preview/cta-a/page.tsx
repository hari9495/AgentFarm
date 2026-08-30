import CTABold from '@/components/home/previews/CTABold';

export const metadata = { title: 'CTA preview — Bold blue panel' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <CTABold />
    </main>
  );
}
