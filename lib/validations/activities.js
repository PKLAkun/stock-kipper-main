// FILE: lib/validations/activities.js
// Filter halaman Aktivitas (GET /api/activities) — riwayat transactions_log.

import { z } from 'zod';
import { JENIS_VALUES } from '../constants/bkb.js';

const emptyOr = (schema, message) => schema.or(z.literal('', { errorMap: () => ({ message }) }));

export const activitiesQuerySchema = z.object({
  userId: emptyOr(z.string().trim().regex(/^\d+$/), 'Filter user tidak valid').optional().default(''),
  jenis: emptyOr(z.enum([...JENIS_VALUES, 'SA', 'ADJ']), 'Filter jenis tidak valid').optional().default(''),
  startDate: emptyOr(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), 'Tanggal mulai harus format YYYY-MM-DD').optional().default(''),
  endDate: emptyOr(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), 'Tanggal akhir harus format YYYY-MM-DD').optional().default(''),
  search: z.string().trim().max(100, 'Kata kunci terlalu panjang').optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
