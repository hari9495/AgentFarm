import FeaturesCleanBento from '@/components/home/previews/FeaturesCleanBento';

export const metadata = { title: 'Features preview — Clean Bento' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <FeaturesCleanBento />
    </main>
  );
}
