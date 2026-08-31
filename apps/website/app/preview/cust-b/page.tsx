import CustomerClientsStack from '@/components/customers/CustomerClientsStack';

export const metadata = { title: 'Customers — Option B (clients + stats stack)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <CustomerClientsStack />
      </section>
    </main>
  );
}
