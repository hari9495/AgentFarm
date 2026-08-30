import TestimonialsMarquee from '@/components/home/previews/TestimonialsMarquee';

export const metadata = { title: 'Testimonials preview — Marquee' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <TestimonialsMarquee />
    </main>
  );
}
