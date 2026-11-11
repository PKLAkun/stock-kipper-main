import Badge from '@/components/ui/Badge';

export const ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'admin', label: 'Data entry' },
  { value: 'staff', label: 'Stock keeper' },
  { value: 'operator', label: 'Operator' },
];

const TONE = { superadmin: 'amber', admin: 'indigo', staff: 'slate', operator: 'green' };

export function roleLabel(role) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

// badge role dengan istilah proyek (Operator, Stock keeper, Data entry, Superadmin)
export default function RoleBadge({ role }) {
  return <Badge tone={TONE[role] || 'slate'}>{roleLabel(role)}</Badge>;
}
