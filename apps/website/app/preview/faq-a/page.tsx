import FAQSplit from '@/components/home/previews/FAQSplit';

export const metadata = { title: 'FAQ preview — Split' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <FAQSplit />
    </main>
  );
}
