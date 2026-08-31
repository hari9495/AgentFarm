import CustomerCasesBento from '@/components/customers/CustomerCasesBento';

export const metadata = { title: 'Customers — Option A (casestudy-5 bento)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <CustomerCasesBento />
      </section>
    </main>
  );
}
