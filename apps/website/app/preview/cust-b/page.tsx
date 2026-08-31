import CustomerSpotlight from '@/components/customers/CustomerSpotlight';

export const metadata = { title: 'Customers — Option B (before/after spotlight)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <CustomerSpotlight />
      </section>
    </main>
  );
}
