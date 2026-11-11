# CLAUDE.md: Stok Hub (stock-kipper)

Aturan kerja AI agent untuk repo ini. Baca seluruhnya sebelum mengerjakan apa pun.

## Proyek
- Tujuan: aplikasi web untuk mencatat Bukti Keluar Barang (BKB) dan saldo stok, menggantikan BKB tulis tangan.
- Sisi: fullstack dalam satu repo. Next.js App Router berisi tampilan (`app/`, `components/`) dan API (`app/api/`). Tidak ada repo pasangan.
- Database: Supabase (PostgreSQL). Project Supabase milik Andre, isinya masih data dev. Tidak ada akses ke Supabase dari repo ini.
- Stack: JavaScript (tanpa TypeScript), Next.js 15.5.25, React 19.1.0, `@supabase/supabase-js` 2.49, Zod 3.25, SWR 2.3, Tailwind 3.4, `jose` (JWT sesi), `bcryptjs`.
- Dokumen sumber:
  - `docs/Flow_Stok_Hub_Final_v3.pdf`: alur yang disepakati (versi web).
  - `docs/Revisi_Check.md`: daftar keputusan dan pekerjaan.
  - `docs/status.md`: tahap saat ini dan pertanyaan terbuka.

## Perintah
- Pasang dependency: `npm install`
- Menjalankan aplikasi: `npm run dev` (butuh `.env.local` dan database Supabase)
- Build: `npm run build`
- Lint: `npm run lint`
- Isi data awal: `npm run seed` (butuh `.env.local` dan database Supabase)
- Menjalankan tes: `npm test` (Vitest). File tes `*.test.js` di samping file yang dites; helper tes bersama di `test/`. `supabase/schema.sql` dites dengan PGlite (`test/schema.pglite.test.js`).
- Cek struktur: `bash ~/.claude-personal/skills/standar-proyek/scripts/cek-proyek.sh . menengah eksisting`

## Alur kerja
- Ikuti skill alur-kerja-dev. Baca `docs/status.md` dulu untuk tahu tahap saat ini.
- Jangan menulis kode produksi sebelum rancangan (tahap 3) dan rencana (tahap 4) disetujui dan tercatat di `docs/status.md`.
- Hal yang ambigu masuk `docs/pertanyaan.md`. Jangan menebak diam-diam.
- Kebutuhan berubah: perbarui dokumen (flow, `Revisi_Check.md`, `status.md`) dan minta persetujuan dulu, baru kode.
- Kerjakan satu tugas dari `docs/rencana.md` dalam satu waktu. Selesai tugas: tes hijau (skill uji-regresi), build berhasil, dokumen terdampak diperbarui, `docs/status.md` dan `docs/rencana.md` diperbarui.

## Aturan kode
- Ikuti pola yang sudah ada:
  - API route: `checkSameOrigin` (untuk aksi yang mengubah data), lalu `requireAuth`, lalu `requireRole`, lalu validasi Zod, lalu panggil repository di `lib/db`.
  - Cek role ditulis `const roleCheck = requireRole(...); if (roleCheck.error) return roleCheck.error;`. `requireRole` selalu mengembalikan objek, jadi jangan menulis `if (roleCheck) return roleCheck`.
  - Error domain memakai `DomainError` dan `handleApiError`. Pesan error internal tidak dikirim ke browser.
  - Data tampilan memakai `useRealtimeSWR` dengan `subscribeTables` yang sesuai.
- Semua perubahan stok terjadi di fungsi SQL dalam satu transaksi, dengan baris barang dikunci `FOR UPDATE`. Jangan mengubah `items.quantity` langsung dari JavaScript.
- Ubah hanya kode yang termasuk tugas. Perapian di luar tugas diusulkan terpisah, tidak langsung dikerjakan.
- Jangan menambah atau menaikkan versi dependency tanpa persetujuan.
- Konfigurasi lewat environment variable (lihat `lib/env.js` dan `.env.example`), tidak ditulis langsung di kode.

## Keamanan
- Rahasia hanya lewat environment variable. Jangan membuka, menampilkan, atau menyalin isi `.env`, `.env.local`, atau file lain berisi kunci Supabase, `AUTH_SECRET`, atau password.
- `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai di server. Browser hanya memakai anon key untuk mendengar sinyal realtime.
- Keputusan penting divalidasi di server: role, kepemilikan data (operator hanya melihat BKB miliknya), status BKB, kecocokan saldo, dan konfirmasi password untuk aksi penting. Client tidak dipercaya.
- Jangan menulis password, PIN, atau token sesi ke log.
- Kode yang menyentuh sesi, login, atau data pengguna diperiksa dengan skill keamanan-frontend.

## Batasan
- Tidak pernah terhubung ke Supabase atau server mana pun dari sini.
- Perubahan database hanya lewat `supabase/schema.sql`, disertai panduan langkah demi langkah untuk Andre. Andre yang menjalankannya di Supabase.
- Repo ini berasal dari file zip dan tidak memakai git. Jangan menjalankan `git init` atau perintah git lain. File zip asli adalah satu-satunya cadangan.
- Jangan menghapus file atau data tanpa konfirmasi, kecuali kode yang tidak dipakai lagi (lihat aturan khusus).

## Aturan khusus proyek
- Istilah:
  - **Operator** membuat BKB pemakaian dan hasil produksi.
  - **SK (Stock keeper, role `staff`)** mengecek BKB dan mengetik saldo akhir.
  - **DE (Data entry, role `admin`)** approve, Ganti BKB, Ubah data BKB, dan koreksi saldo.
  - **Superadmin** memegang semua hak DE, ditambah kelola pengguna dan pengaturan.
- Aturan bisnis yang tidak boleh dilanggar:
  - BKB tidak pernah dihapus. Pembatalan selalu mengembalikan saldo.
  - Cek saldo selalu berlaku, termasuk saat saldo 0. Stok tidak boleh minus.
  - Nomor urut diisi sistem, per barang.
  - Peran DE dalam alur mengikuti pengaturan "Wajib approve DE".
- Dokumentasi ditulis dalam bahasa Indonesia.
- Menghapus kode yang tidak dipakai lagi boleh tanpa konfirmasi (diputuskan pengguna 7 November 2026), dengan syarat:
  - hanya file di `app/`, `components/`, `lib/`, dan `hooks/`;
  - file itu tidak lagi dirujuk di mana pun (dicek dengan pencarian import dan path), karena fungsinya sudah dipindah oleh tugas di `docs/rencana.md`;
  - `npm run build` dan `npm test` tetap berhasil setelah dihapus;
  - setiap file yang dihapus dicatat di `docs/status.md` bagian "File yang dihapus", beserta alasannya.

  Tidak termasuk: `docs/`, `supabase/`, `scripts/`, file konfigurasi, file env, dan data. Untuk itu tetap minta konfirmasi.
- **Mulai tahap 2 (keputusan pengguna 11 November 2026): kode lama tidak dihapus.** Kode yang diganti atau tidak dipakai lagi dijadikan komentar, dengan keterangan di atasnya, misalnya `// [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: <alasan>`. Untuk SQL memakai `--`, untuk JSX `{/* ... */}`. Aturan ini menggantikan aturan hapus kode di atas, untuk pekerjaan tahap 2 dan seterusnya.
- `npm install` boleh dijalankan tanpa konfirmasi (diputuskan pengguna 7 November 2026). Menambah dependency baru selain Vitest dan `@electric-sql/pglite` (keduanya hanya `devDependencies`) tetap minta persetujuan.
- `@electric-sql/pglite` dipakai untuk mengetes `supabase/schema.sql` di laptop, tanpa terhubung ke Supabase (disetujui 7 November 2026).
- Semua sub-agent, termasuk reviewer, memakai Sonnet di project ini (keputusan pengguna 7 November 2026).
- Prototipe UI tidak dibuat untuk project ini. Setelah rancangan disetujui, langsung lanjut ke tahap 4 tanpa menanyakan prototipe. Diputuskan pengguna 7 November 2026. Gerbang dan persetujuan lain tetap berlaku.
- Jawaban dari Andre (anak magang, posisi DE) kuat untuk sisi DE. Hal di luar akses DE dikonfirmasi ke SK atau atasan.
