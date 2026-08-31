import CustomerCases from '@/components/customers/CustomerCases';

export const metadata = { title: 'Customers — Option A (cards grid)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <CustomerCases />
      </section>
    </main>
  );
}
