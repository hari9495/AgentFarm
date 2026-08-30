import HeroDashboardMockup from '@/components/home/previews/HeroDashboardMockup';

export const metadata = { title: 'Hero preview — Dashboard Mockup' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <HeroDashboardMockup />
    </main>
  );
}
