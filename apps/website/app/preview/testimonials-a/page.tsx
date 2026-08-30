import TestimonialsStaggered from '@/components/home/previews/TestimonialsStaggered';

export const metadata = { title: 'Testimonials preview — Staggered Grid' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <TestimonialsStaggered />
    </main>
  );
}
