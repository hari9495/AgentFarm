import { redirect } from 'next/navigation';

/**
 * /dashboard — canonical redirect to the main dashboard at /.
 * The setup-wizard success screen links here after agent deployment;
 * we forward to the overview tab so the user lands on activity immediately.
 */
export default function DashboardPage() {
    redirect('/?tab=overview');
}
