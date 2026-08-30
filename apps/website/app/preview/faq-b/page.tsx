import FAQTwoCol from '@/components/home/previews/FAQTwoCol';

export const metadata = { title: 'FAQ preview — Two column' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <FAQTwoCol />
    </main>
  );
}
