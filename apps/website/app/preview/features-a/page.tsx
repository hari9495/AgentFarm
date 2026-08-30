import FeaturesProductBento from '@/components/home/previews/FeaturesProductBento';

export const metadata = { title: 'Features preview — Product Bento' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <FeaturesProductBento />
    </main>
  );
}
