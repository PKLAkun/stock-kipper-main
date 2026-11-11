// FILE: lib/db/dashboard.js
// Menyusun data ringkasan dashboard dari repository.
import { getRepository } from './index.js';

export async function getDashboardData() {
  const repo = getRepository();
  const [counts, lowest, recentActivity, totalAdmin, totalStaff] = await Promise.all([
    repo.dashboardCounts(),
    repo.lowestBalanceItems(6),
    repo.recentActivity(8),
    repo.countByRole('admin'),
    repo.countByRole('staff'),
  ]);
  return { ...counts, lowestBalanceItems: lowest, recentActivity, totalAdmin, totalStaff };
}
