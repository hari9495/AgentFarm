import HeroPreviewSwitch from '@/components/home/previews/HeroPreviewSwitch';

export const metadata = { title: 'Hero preview — Preview Switch' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <HeroPreviewSwitch />
    </main>
  );
}
