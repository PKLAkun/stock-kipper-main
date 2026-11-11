# Panduan Migrasi Supabase — Stok Hub (BKB)

> Skema lama (`items` dengan SKU/harga/min_stock, `stock_history`) **diganti total**.
> Tabel `users` **tidak disentuh**. Backup dulu bila data stok lama masih dibutuhkan.
> (Dashboard → Table Editor → Export CSV, atau `pg_dump -t items -t stock_history`.)

## 1. Jalankan skema
1. Supabase Dashboard → **SQL Editor** → New query.
2. Tempel seluruh isi `supabase/schema.sql` → **Run** (cukup sekali; aman diulang, tapi BAGIAN 0 akan menghapus data `items`/`bkb`/log).
3. Hasil: tabel `items`, `bkb`, `bkb_items`, `transactions_log` (+ `users` bila belum ada), 3 fungsi RPC
   (`create_bkb`, `create_item_master`, `update_item_master`), RLS aktif, dan trigger realtime.

## 2. Pastikan Realtime aktif
- Realtime yang dipakai adalah **Broadcast dari trigger** (`realtime.send`), bukan `postgres_changes`.
  Alasannya: RLS "tolak semua" membuat browser (anon key) tidak akan menerima event `postgres_changes`.
  Sinyal broadcast hanya berisi nama tabel (`{"table":"items"}`), tanpa data stok.
- Dashboard → **Project Settings → Realtime** (atau *Realtime → Settings*): pastikan Realtime **Enabled**.
- Cek: buka dua tab/komputer, simpan BKB di satu sisi → saldo di Dashboard / Master / Aktivitas tab lain berubah
  tanpa refresh. Jika tidak: lihat *Logs → Realtime* dan pastikan fungsi `realtime.send` tersedia
  (project Supabase versi lama mungkin perlu upgrade). Sebagai jaring pengaman, UI tetap menyegarkan data
  tiap 30 detik dan saat tab kembali aktif.

## 3. Environment (`.env.local` / Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # aman untuk browser (hanya dipakai mendengar sinyal realtime)
SUPABASE_SERVICE_ROLE_KEY=...            # RAHASIA, hanya server
AUTH_SECRET=...                          # min 32 karakter
```
`DB_PROVIDER`, `NEXT_PUBLIC_DB_PROVIDER`, `DATABASE_URL` sudah **tidak dipakai** (SQLite dihapus).

## 4. Akun & contoh data
```bash
npm install
npm run seed     # membuat admin pertama (+3 contoh barang bila master kosong)
npm run dev
```
Akun Staff dibuat dari halaman **Pengguna** (khusus Admin).

## 5. Impor master barang asli (opsional)
Contoh via SQL Editor (lokasi mengikuti kategori):
```sql
select public.create_item_master(
  '{"categoryCode":"1","itemCode":"RM-PP001","name":"Biji PP","unit":"kg","quantity":5000}'::jsonb,
  null, 'Import');
```
atau impor CSV ke tabel `items` (kolom: category_code, location_code, item_code, name, quantity, unit)
— catatan: impor CSV langsung tidak menulis baris Saldo Awal ke riwayat.

## Asumsi yang perlu Anda konfirmasi
| Hal | Yang saya terapkan | Cara mengubah |
|---|---|---|
| Arah saldo | PB & BTL **mengurangi**; PR, RP, TRM **menambah** | `JENIS_TRANSAKSI` di `lib/constants/bkb.js` + `v_dir` di `create_bkb` |
| Mesin wajib saat INJ | **Wajib** | `MACHINE_REQUIRED_FOR_INJ = false` |
| Definisi "INJ" | Keterangan lengkap (mis. `BIP/INJ/1`) memuat kata `INJ` berdiri sendiri | `isInjKeterangan` + regex check `bkb_machine_only_for_inj` |
| No Dokumen | **Unik global** (tidak peka huruf besar/kecil) | index `bkb_doc_no_uq` (mis. jadikan unik per `bkb_date`/tahun bila nomor di-reset) |
| QTY | Boleh desimal, maks 3 digit (kg dsb.) | `numeric(14,3)` + `MAX_DECIMALS` |
| Barang yang sudah dipakai BKB | Tidak bisa dihapus (menjaga riwayat) | FK `bkb_items.item_id` |
| Zona waktu filter tanggal | WIB (+07:00) | `lib/db/helpers.js` |
