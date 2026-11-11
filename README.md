# Stok Hub — Digitalisasi Bukti Keluar Barang (BKB)

Next.js 15 (App Router, JavaScript) · Supabase PostgreSQL + Realtime · SWR · Zod · Tailwind.
Mengganti form BKB fisik (tulisan tangan) dengan input digital yang tervalidasi, saldo stok
yang selalu konsisten, dan riwayat mutasi lengkap.

## Role
| Role | Hak |
|---|---|
| **Operator** | Membuat BKB pemakaian dan hasil produksi, hanya melihat BKB miliknya. Login dengan PIN |
| **SK (`staff`)** | Membuat BKB untuk peminta bukan operator, mengecek BKB dan mengetik saldo akhir, membetulkan BKB, membuat BKB pengganti |
| **DE (`admin`)** | Approve (bila "Wajib approve DE" aktif), Kembalikan ke SK, Ganti BKB, Ubah data BKB, koreksi saldo, batal BKB tersimpan |
| **Superadmin** | Semua hak DE, ditambah kelola pengguna, parameter, mesin, dan pengaturan |

## Halaman
- `/` Dashboard: ringkasan stok, peringatan stok minimum, saldo terendah (realtime)
- `/buat-bkb`: form BKB untuk operator. `/buat-bkb/pengganti/[id]`: BKB pengganti (SK)
- `/ruang-tunggu`: BKB yang belum tersimpan per status (konfirmasi saldo, yang salah, approve, kembalikan, batal)
- `/stok`: tab Input BKB (SK), Daftar BKB, Master dan Saldo Stok (stok minimum, koreksi saldo, kartu stok)
- `/bkb/[id]`: detail BKB dan aksi per role. `/bkb/[id]/cetak`: cetak A5 lanskap
- `/aktivitas`: riwayat mutasi stok
- `/parameter`, `/pengaturan`, `/mesin`, `/user`: khusus superadmin (DE hanya melihat mesin)

## Aturan bisnis (ditegakkan di server dan database)
- BKB tidak pernah dihapus. Pembatalan selalu mengembalikan saldo.
- Cek saldo selalu berlaku, termasuk saat saldo 0. Stok tidak boleh minus.
- Nomor urut diisi sistem, per barang. Semua perubahan stok terjadi di fungsi SQL dalam satu transaksi
  dengan baris barang dikunci `FOR UPDATE` (lihat `docs/database.md`, bagian "Kontrak fungsi SQL").
- Jenis, tujuan, dept pemakai, dan dept proses diatur di tabel parameter.

## Realtime
Trigger database mengirim sinyal ringan lewat Realtime Broadcast (topik `stok-hub`) saat tabel stok, BKB,
parameter, mesin, atau pengaturan berubah. `hooks/useRealtimeSWR.js` memuat ulang data layar yang terkait.

## Menjalankan
Ikuti **`docs/panduan-deploy-supabase.md`** (jalankan `supabase/schema.sql`, isi `.env.local`), lalu:
```bash
npm install && npm run seed && npm run dev
```

## Deploy
Database di Supabase: `docs/panduan-deploy-supabase.md`. Aplikasi di Vercel: `docs/panduan-deploy-vercel.md`.

**Tahap 2 (11 November 2026):** urutan lengkap deploy dan uji ada di `docs/panduan-deploy-tahap-2.md`. Fitur baru: keterangan, inisial, dan shift otomatis dari akun; keluar otomatis saat shift habis; menu Cek Stok; menu Laporan (cetak/PDF dan Excel).

## Tes
```bash
npm test        # Vitest, termasuk schema.sql di PGlite (tanpa Supabase)
npm run lint
npm run build
```

Ringkasan konsep dalam bahasa sederhana: `docs/konsep-final.md`. Dokumen rancangan dan status pekerjaan ada di `docs/` (mulai dari `docs/status.md`).
