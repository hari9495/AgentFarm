import CTAClean from '@/components/home/previews/CTAClean';

export const metadata = { title: 'CTA preview — Clean light' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <CTAClean />
    </main>
  );
}
