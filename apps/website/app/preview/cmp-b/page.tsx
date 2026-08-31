import PricingComparisonInteractive from '@/components/pricing/PricingComparisonInteractive';

export const metadata = { title: 'Comparison — Option B (interactive)' };

export default function Page() {
  return (
    <main style={{ background: 'var(--op-paper)', minHeight: '100vh' }}>
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <PricingComparisonInteractive />
      </section>
    </main>
  );
}
