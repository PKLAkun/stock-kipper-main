// FILE: lib/validations/users.js
// Validasi kelola pengguna (khusus superadmin). Dijalankan di server.

import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth.js';

export const USER_ROLES = ['superadmin', 'admin', 'staff', 'operator'];

const nameSchema = z.string().trim().min(1, 'Nama wajib diisi.').max(100, 'Nama terlalu panjang.');
const roleSchema = z.enum(USER_ROLES, { message: 'Role tidak valid.' });

// Inisial: 2-6 huruf A-Z, disimpan kapital. Kosong = tidak diisi (null).
export const inisialSchema = z
  .string({ invalid_type_error: 'Inisial tidak valid.' })
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => v === '' || /^[A-Z]{2,6}$/.test(v), 'Inisial 2 sampai 6 huruf (A-Z).')
  .transform((v) => (v === '' ? null : v))
  .nullish()
  .transform((v) => (v === undefined ? undefined : v ?? null));

const kodeOpsional = (pesan) =>
  z.string({ invalid_type_error: pesan }).trim().max(20, pesan).nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

// PIN operator: 4 sampai 6 angka (P-37)
export const pinSchema = z
  .string({ required_error: 'PIN wajib diisi.', invalid_type_error: 'PIN harus 4 sampai 6 angka.' })
  .regex(/^\d{4,6}$/, 'PIN harus 4 sampai 6 angka.');

// Operator: nama + PIN (tanpa email dan password). Role lain: nama + email + password.
export const createUserSchema = z
  .object({
    name: nameSchema,
    role: roleSchema,
    email: z.string().nullish(),
    password: z.string().nullish(),
    pin: z.string().nullish(),
    inisial: inisialSchema,
    timKode: kodeOpsional('Tim tidak valid.'),
    tujuanKode: kodeOpsional('Keterangan tidak valid.'),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'operator') {
      const pin = pinSchema.safeParse(value.pin ?? undefined);
      if (!pin.success) ctx.addIssue({ code: 'custom', path: ['pin'], message: pin.error.errors[0].message });
      // [Tahap 2, 11-11-2026, T-22] Keterangan wajib untuk operator baru (K-27)
      if (!value.tujuanKode) ctx.addIssue({ code: 'custom', path: ['tujuanKode'], message: 'Keterangan wajib dipilih untuk operator.' });
      return;
    }
    const email = emailSchema.safeParse(value.email ?? '');
    if (!email.success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: value.email ? email.error.errors[0].message : 'Email wajib diisi.' });
    }
    const password = passwordSchema.safeParse(value.password ?? '');
    if (!password.success) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: password.error.errors[0].message });
    }
  })
  .transform((value) =>
    value.role === 'operator'
      ? { name: value.name, role: value.role, pin: value.pin, inisial: value.inisial ?? null, timKode: value.timKode ?? null, tujuanKode: value.tujuanKode }
      : { name: value.name, role: value.role, email: emailSchema.parse(value.email), password: value.password, inisial: value.inisial ?? null, timKode: null, tujuanKode: null }
  );

// inisial/timKode/tujuanKode: tidak dikirim = nilai lama dipertahankan; null atau kosong = dikosongkan.
// Repository memaksa tim dan keterangan null untuk role selain operator.
export const updateUserSchema = z.object({
  name: nameSchema,
  role: roleSchema,
  active: z.boolean({ required_error: 'Status wajib diisi.', invalid_type_error: 'Status tidak valid.' }),
  inisial: inisialSchema,
  timKode: kodeOpsional('Tim tidak valid.'),
  tujuanKode: kodeOpsional('Keterangan tidak valid.'),
});

export const setPinSchema = z.object({ pin: pinSchema });
