-- ============================================================
-- STOK HUB: SCHEMA (satu file, membangun ulang database dari nol)
-- Rancangan: docs/database.md. Jalankan di Supabase SQL Editor.
-- PERINGATAN: bagian 0 menghapus SEMUA tabel dan fungsi di skema public.
-- Hanya untuk data dev. Setelah ada data asli, pakai supabase/migrations/.
-- ============================================================

-- ---------- 0) BERSIHKAN ----------
-- [Tahap 2, 11-11-2026, T-20] Tabel baru: opname_items, opname, param_tim ikut dibersihkan.
drop table if exists public.opname_items       cascade;
drop table if exists public.opname             cascade;
drop table if exists public.audit_log          cascade;
drop table if exists public.transactions_log   cascade;
drop table if exists public.stock_history      cascade;
drop table if exists public.bkb_items          cascade;
drop table if exists public.bkb_requests       cascade;
drop table if exists public.bkb                cascade;
drop table if exists public.items              cascade;
drop table if exists public.machines           cascade;
drop table if exists public.param_tujuan       cascade;
drop table if exists public.param_tim          cascade;
drop table if exists public.param_dept_proses  cascade;
drop table if exists public.param_dept_pemakai cascade;
drop table if exists public.param_jenis        cascade;
drop table if exists public.app_settings       cascade;
drop table if exists public.users              cascade;

do $$ declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- ---------- 1) USERS ----------
create table public.users (
  id               bigserial primary key,
  name             text not null,
  email            text unique,
  password_hash    text,
  pin_hash         text,
  role             text not null check (role in ('superadmin','admin','staff','operator')),
  active           boolean not null default true,
  -- [Tahap 2, 11-11-2026, T-20] Inisial akun (2-6 huruf kapital). tim_kode dan tujuan_kode ditambah lewat ALTER TABLE
  -- setelah param_tim dan param_tujuan dibuat (bagian 3).
  inisial          text check (inisial is null or inisial ~ '^[A-Z]{2,6}$'),
  password_version integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint users_kredensial check (
    (role = 'operator' and pin_hash is not null) or
    (role <> 'operator' and email is not null and password_hash is not null)
  )
);

-- ---------- 2) PENGATURAN ----------
create table public.app_settings (
  key             text primary key,
  value           jsonb not null,
  updated_by_id   bigint,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
insert into public.app_settings (key, value) values ('wajib_approve_de', 'true'::jsonb);
-- role yang boleh membuat BKB dan BKB pengganti (dua pengaturan terpisah, diatur Superadmin, minimal satu role)
insert into public.app_settings (key, value) values ('peran_buat_bkb', '["operator","staff"]'::jsonb);
insert into public.app_settings (key, value) values ('peran_buat_pengganti', '["staff"]'::jsonb);

-- ---------- 3) PARAMETER ----------
create table public.param_jenis (
  kode       text primary key,
  nama       text not null,
  arah       text not null check (arah in ('in','out')),
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.param_dept_pemakai (
  kode       text primary key,
  nama       text not null,
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.param_dept_proses (
  kode       text primary key,
  nama       text not null,
  bawaan     boolean not null default false,
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index param_dept_proses_bawaan_uq on public.param_dept_proses ((true)) where bawaan;
create table public.param_tujuan (
  kode              text primary key,
  nama              text not null,
  jenis_kode        text not null references public.param_jenis(kode) on update restrict on delete restrict,
  dept_pemakai_kode text references public.param_dept_pemakai(kode) on update restrict on delete restrict,
  wajib_mesin       boolean not null default false,
  aktif             boolean not null default true,
  urutan            integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create table public.machines (
  id         bigserial primary key,
  code       text not null unique,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [Tahap 2, 11-11-2026, T-20] Parameter Tim (K-29) dan kolom akun yang merujuk parameter.
create table public.param_tim (
  kode       text primary key,
  nama       text not null,
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.param_tim (kode, nama, urutan) values
  ('TARIK',  'Tim Tarik',  1),
  ('SUPLAI', 'Tim Suplai', 2),
  ('TEMPEL', 'Tim Tempel', 3);
alter table public.users add column tim_kode text
  references public.param_tim(kode) on update restrict on delete restrict;
alter table public.users add column tujuan_kode text
  references public.param_tujuan(kode) on update restrict on delete restrict;
create unique index users_inisial_uq on public.users (inisial) where inisial is not null;

-- Isi awal (docs/PRD_Stok_Hub.md bagian 10.2; sisa isi menunggu P-35)
insert into public.param_jenis (kode, nama, arah, urutan) values
  ('PB',  'Pemakaian Barang',        'out', 1),
  ('PR',  'Hasil Produksi',          'in',  2),
  ('RP',  'Retur Pemakaian',         'in',  3),
  ('BTL', 'Distribusi / Penjualan',  'out', 4),
  ('TRM', 'Transfer Masuk',          'in',  5);

insert into public.param_dept_pemakai (kode, nama, urutan) values
  ('PL001', 'PPIC & QC',                    1),
  ('PL003', 'Produksi Plastik',             2),
  ('PL005', 'Sub Assy',                     3),
  ('45',    'Packing/AP',                   4),
  ('52',    'Crusser/Reject',               5),
  ('5501',  'Proses Gudang',                6),
  ('240',   'Lokasi Distribusi/Penjualan',  7);

-- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: nama dept proses diperbaiki (P1 Plastik Umum dst).
-- insert into public.param_dept_proses (kode, nama, bawaan, urutan) values
--   ('P1', 'P1', true,  1), ('P2', 'P2', false, 2), ('P3', 'P3', false, 3),
--   ('P4', 'P4', false, 4), ('P5', 'P5', false, 5);
insert into public.param_dept_proses (kode, nama, bawaan, urutan) values
  ('P1', 'Plastik Umum',      true,  1),
  ('P2', 'Plastik Full',      false, 2),
  ('P3', 'Plastik Kecil',     false, 3),
  ('P4', 'Plastik Finishing', false, 4),
  ('P5', 'Plastik Assembly',  false, 5);

-- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: isi awal keterangan diubah (INJ dept PL003, PROSES diberi nama baru,
-- TEMPEL dan IHW nonaktif, REJECT baru).
-- insert into public.param_tujuan (kode, nama, jenis_kode, dept_pemakai_kode, wajib_mesin, aktif, urutan) values
--   ('BIP',        'BIP',               'PB',  'PL003', false, true,  1),
--   ('BIP2',       'BIP2',              'PB',  'PL003', false, true,  2),
--   ('IHW',        'IHW',               'PB',  null,    false, true,  3),
--   ('TEMPEL',     'Tempel',            'PB',  '5501',  false, true,  4),
--   ('RAKIT',      'Rakit',             'PB',  '45',    false, true,  5),
--   ('PROSES',     'Proses Gudang',     'PB',  '5501',  false, true,  6),
--   ('SA',         'Sub Assy',          'PB',  'PL005', false, true,  7),
--   ('QC',         'QC',                'PB',  'PL001', false, true,  8),
--   ('INJ1',       'Injeksi 1',         'PR',  null,    true,  true,  9),
--   ('INJ2',       'Injeksi 2',         'PR',  null,    true,  true,  10),
--   ('INJ3',       'Injeksi 3',         'PR',  null,    true,  true,  11),
--   ('DISTRIBUSI', 'Distribusi',        'BTL', '240',   false, true,  12),
--   ('RETUR',      'Retur',             'RP',  null,    false, true,  13),
--   ('HASIL',      'Hasil',             'PR',  null,    false, false, 14);
insert into public.param_tujuan (kode, nama, jenis_kode, dept_pemakai_kode, wajib_mesin, aktif, urutan) values
  ('BIP',        'BIP',                    'PB',  'PL003', false, true,  1),
  ('BIP2',       'BIP2',                   'PB',  'PL003', false, true,  2),
  ('IHW',        'IHW',                    'PB',  null,    false, false, 3),
  ('TEMPEL',     'Tempel',                 'PB',  '5501',  false, false, 4),
  ('RAKIT',      'Rakit',                  'PB',  '45',    false, true,  5),
  ('PROSES',     'Proses Gudang (Tempel)', 'PB',  '5501',  false, true,  6),
  ('SA',         'Sub Assy',               'PB',  'PL005', false, true,  7),
  ('QC',         'QC',                     'PB',  'PL001', false, true,  8),
  ('INJ1',       'Injeksi 1',              'PR',  'PL003', true,  true,  9),
  ('INJ2',       'Injeksi 2',              'PR',  'PL003', true,  true,  10),
  ('INJ3',       'Injeksi 3',              'PR',  'PL003', true,  true,  11),
  ('DISTRIBUSI', 'Distribusi',             'BTL', '240',   false, true,  12),
  ('RETUR',      'Retur',                  'RP',  null,    false, true,  13),
  ('HASIL',      'Hasil',                  'PR',  null,    false, false, 14),
  ('REJECT',     'Reject',                 'PB',  '52',    false, true,  15);

-- ---------- 4) MASTER BARANG ----------
create table public.items (
  id             bigserial primary key,
  category_code  text not null check (category_code in ('1','4')),
  location_code  text not null,
  item_code      text not null,
  barcode        text,
  name           text not null,
  unit           text not null default 'pcs',
  quantity       numeric(14,3) not null default 0 check (quantity >= 0),
  stok_minimum   numeric(14,3) check (stok_minimum is null or stok_minimum >= 0),
  urut_terakhir  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint items_location_matches_category check (
    (category_code = '1' and location_code = '100') or
    (category_code = '4' and location_code = '800')
  )
);
create unique index items_item_code_uq on public.items (upper(item_code));
create unique index items_barcode_uq   on public.items (barcode) where barcode is not null;
create index items_name_idx            on public.items (lower(name));

-- ---------- 5) BKB ----------
create table public.bkb (
  id                       bigserial primary key,
  doc_no                   text not null unique,
  jenis_kode               text not null references public.param_jenis(kode) on update restrict on delete restrict,
  bkb_kategori             text not null check (bkb_kategori in ('1','4')),
  bkb_date                 date not null default current_date,
  reference                text,
  tujuan_kode              text not null references public.param_tujuan(kode) on update restrict on delete restrict,
  keterangan_extra         text,
  keterangan               text not null,
  machine                  text,
  sumber                   text not null default 'operator' check (sumber in ('operator','non_operator')),
  pihak_nama               text,
  pihak_dept               text,
  status                   text not null default 'menunggu'
                             check (status in ('menunggu','ditahan','menunggu_de','selesai','diganti','dibatalkan')),
  ditahan_karena           text check (ditahan_karena in
                             ('tidak_cocok','dibetulkan_sk','menunggu_koreksi','dikoreksi','stok_kurang','dikembalikan_de')),
  mengganti_bkb_id         bigint references public.bkb(id) on update restrict on delete restrict,
  diganti_oleh_bkb_id      bigint references public.bkb(id) on update restrict on delete restrict,
  catatan_sk               text,
  alasan                   text,
  dibuat_oleh_id           bigint,
  dibuat_oleh_nama         text,
  dikonfirmasi_oleh_id     bigint,
  dikonfirmasi_oleh_nama   text,
  dikonfirmasi_at          timestamptz,
  disimpan_oleh_id         bigint,
  disimpan_oleh_nama       text,
  disimpan_at              timestamptz,
  mode_approve             text check (mode_approve in ('de','langsung')),
  dibatalkan_oleh_id       bigint,
  dibatalkan_oleh_nama     text,
  dibatalkan_at            timestamptz,
  idempotency_key          uuid unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint bkb_pihak_non_operator check (sumber = 'operator' or nullif(trim(coalesce(pihak_nama,'')),'') is not null),
  constraint bkb_ditahan_karena_hanya_ditahan check (ditahan_karena is null or status = 'ditahan')
);
create index bkb_status_idx     on public.bkb (status, created_at desc);
create index bkb_pembuat_idx    on public.bkb (dibuat_oleh_id, created_at desc);
create index bkb_date_idx       on public.bkb (bkb_date desc, id desc);

create table public.bkb_items (
  id                      bigserial primary key,
  bkb_id                  bigint not null references public.bkb(id) on update restrict on delete restrict,
  item_id                 bigint not null references public.items(id) on update restrict on delete restrict,
  qty                     numeric(14,3) not null check (qty > 0),
  dept_pemakai_kode       text not null references public.param_dept_pemakai(kode) on update restrict on delete restrict,
  -- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: dept proses tidak lagi wajib (K-30), kolom boleh kosong.
  -- dept_proses_kode        text not null references public.param_dept_proses(kode) on update restrict on delete restrict,
  dept_proses_kode        text references public.param_dept_proses(kode) on update restrict on delete restrict,
  saldo_sk                numeric(14,3),
  saldo_sk_pertama        numeric(14,3),
  saldo_sistem_konfirmasi numeric(14,3),
  cocok                   boolean,
  nomor_urut              integer,
  saldo_sebelum           numeric(14,3),
  saldo_setelah           numeric(14,3),
  constraint bkb_items_unik unique (bkb_id, item_id)
);
create index bkb_items_item_idx on public.bkb_items (item_id);

-- ---------- 6) RIWAYAT ----------
create table public.transactions_log (
  id             bigserial primary key,
  bkb_id         bigint references public.bkb(id) on update restrict on delete restrict,
  -- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: jenis OPN dan aksi opname ditambahkan.
  -- jenis          text not null check (jenis in ('PB','PR','RP','BTL','TRM','SA','ADJ')),
  -- aksi           text not null check (aksi in ('simpan','batal','saldo_awal','koreksi')),
  jenis          text not null check (jenis in ('PB','PR','RP','BTL','TRM','SA','ADJ','OPN')),
  aksi           text not null check (aksi in ('simpan','batal','saldo_awal','koreksi','opname')),
  doc_no         text,
  keterangan     text,
  machine        text,
  item_id        bigint references public.items(id) on update restrict on delete restrict,
  item_code      text not null,
  item_name      text not null,
  qty            numeric(14,3) not null,
  direction      text not null check (direction in ('in','out')),
  balance_before numeric(14,3) not null,
  balance_after  numeric(14,3) not null,
  nomor_urut     integer,
  alasan         text,
  dept_pemakai   text,
  dept_proses    text,
  actor_id       bigint,
  actor_name     text,
  -- [Tahap 2, 11-11-2026, T-20] shift BKB, nama atasan dan nomor Berita Acara (koreksi saldo dan Cek Stok)
  shift          text,
  nama_atasan    text,
  nomor_ba       text,
  created_at     timestamptz not null default now()
);
create index txlog_created_idx on public.transactions_log (created_at desc, id desc);
create index txlog_item_idx    on public.transactions_log (item_id, nomor_urut);

create table public.audit_log (
  id         bigserial primary key,
  entitas    text not null,
  entitas_id text,
  -- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: aksi ajukan, setujui, tolak ditambahkan (Cek Stok).
  -- aksi       text not null check (aksi in
  --              ('buat','betulkan','konfirmasi','approve','kembalikan','ubah_data','ganti','batal','ubah','aktifkan','nonaktifkan')),
  aksi       text not null check (aksi in
               ('buat','betulkan','konfirmasi','approve','kembalikan','ubah_data','ganti','batal','ubah','aktifkan','nonaktifkan',
                'ajukan','setujui','tolak')),
  data_lama  jsonb,
  data_baru  jsonb,
  alasan     text,
  actor_id   bigint,
  actor_name text,
  created_at timestamptz not null default now()
);
create index audit_entitas_idx on public.audit_log (entitas, entitas_id, created_at desc);

-- [Tahap 2, 11-11-2026, T-20] Cek Stok / opname (rancangan tahap 2 bagian 2.5)
create table public.opname (
  id                 bigserial primary key,
  nomor              text not null unique,
  tanggal            date not null default current_date,
  alasan_jenis       text not null check (alasan_jenis in ('opname','rusak','hilang')),
  status             text not null default 'draf'
                       check (status in ('draf','diajukan','disetujui','ditolak','dibatalkan')),
  catatan            text,
  dibuat_oleh_id     bigint,
  dibuat_oleh_nama   text,
  diajukan_at        timestamptz,
  disetujui_oleh_id  bigint,
  disetujui_oleh_nama text,
  disetujui_at       timestamptz,
  nama_atasan        text,
  nomor_ba           text,
  ditolak_oleh_id    bigint,
  ditolak_oleh_nama  text,
  catatan_tolak      text,
  ditolak_at         timestamptz,
  dibatalkan_oleh_id bigint,
  dibatalkan_oleh_nama text,
  alasan_batal       text,
  dibatalkan_at      timestamptz,
  idempotency_key    uuid unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index opname_status_idx on public.opname (status, created_at desc);

create table public.opname_items (
  id                       bigserial primary key,
  opname_id                bigint not null references public.opname(id) on update restrict on delete restrict,
  item_id                  bigint not null references public.items(id) on update restrict on delete restrict,
  saldo_sistem_saat_hitung numeric(14,3) not null,
  qty_fisik                numeric(14,3) check (qty_fisik is null or qty_fisik >= 0),
  qty                      numeric(14,3) check (qty is null or qty > 0),
  selisih                  numeric(14,3) not null,
  analisa                  text,
  saldo_sebelum            numeric(14,3),
  saldo_setelah            numeric(14,3),
  constraint opname_items_unik unique (opname_id, item_id)
);
create index opname_items_item_idx on public.opname_items (item_id);

-- ---------- 7) TRIGGER ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end; $$;

do $$ declare t text;
begin foreach t in array array['users','param_jenis','param_dept_pemakai','param_dept_proses',
  'param_tujuan','machines','items','bkb','param_tim','opname'] loop
  execute format('create trigger trg_touch_%1$s before update on public.%1$I
                  for each row execute function public.touch_updated_at()', t);
end loop; end $$;

-- Kode (dan arah jenis) parameter terkunci setelah dipakai BKB
create or replace function public.cek_param_terkunci()
returns trigger language plpgsql as $$
declare v_pakai boolean := false;
begin
  if tg_table_name = 'param_jenis' then
    if new.kode is distinct from old.kode or new.arah is distinct from old.arah then
      v_pakai := exists (select 1 from public.bkb where jenis_kode = old.kode);
    end if;
  elsif tg_table_name = 'param_tujuan' then
    if new.kode is distinct from old.kode then
      v_pakai := exists (select 1 from public.bkb where tujuan_kode = old.kode);
    end if;
  elsif tg_table_name = 'param_dept_pemakai' then
    if new.kode is distinct from old.kode then
      v_pakai := exists (select 1 from public.bkb_items where dept_pemakai_kode = old.kode);
    end if;
  elsif tg_table_name = 'param_dept_proses' then
    if new.kode is distinct from old.kode then
      v_pakai := exists (select 1 from public.bkb_items where dept_proses_kode = old.kode);
    end if;
  end if;
  if v_pakai then
    raise exception 'PARAM_TERKUNCI|Kode atau arah % sudah dipakai BKB dan tidak bisa diubah', old.kode;
  end if;
  return new;
end; $$;
do $$ declare t text;
begin foreach t in array array['param_jenis','param_tujuan','param_dept_pemakai','param_dept_proses'] loop
  execute format('create trigger trg_param_terkunci_%1$s before update on public.%1$I
                  for each row execute function public.cek_param_terkunci()', t);
end loop; end $$;

-- Mesin hanya boleh diisi bila tujuan wajib mesin
create or replace function public.cek_bkb_mesin()
returns trigger language plpgsql as $$
begin
  if new.machine is not null
     and not coalesce((select wajib_mesin from public.param_tujuan where kode = new.tujuan_kode), false) then
    raise exception 'DATA_TIDAK_VALID|Mesin hanya boleh diisi untuk tujuan yang wajib mesin';
  end if;
  return new;
end; $$;
create trigger trg_bkb_mesin before insert or update on public.bkb
  for each row execute function public.cek_bkb_mesin();

-- doc_no tidak bisa diubah, kecuali lewat betulkan_bkb
create or replace function public.cek_bkb_docno()
returns trigger language plpgsql as $$
begin
  if new.doc_no is distinct from old.doc_no
     and coalesce(current_setting('app.boleh_ubah_docno', true), '') <> '1' then
    raise exception 'DATA_TIDAK_VALID|Nomor dokumen tidak bisa diubah';
  end if;
  return new;
end; $$;
create trigger trg_bkb_docno before update on public.bkb
  for each row execute function public.cek_bkb_docno();

-- Tidak ada hapus
create or replace function public.cegah_hapus()
returns trigger language plpgsql as $$
begin
  if tg_table_name in ('bkb_items','opname_items') and coalesce(current_setting('app.boleh_hapus_baris', true), '') = '1' then
    return old;
  end if;
  raise exception 'TIDAK_BOLEH_HAPUS|Data % tidak boleh dihapus', tg_table_name;
end; $$;
do $$ declare t text;
begin foreach t in array array['bkb','bkb_items','transactions_log','audit_log','opname','opname_items'] loop
  execute format('create trigger trg_cegah_hapus_%1$s before delete on public.%1$I
                  for each row execute function public.cegah_hapus()', t);
end loop; end $$;

-- Realtime
create or replace function public.notify_stok_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'stok-hub', false);
  exception when others then null;
  end;
  return null;
end; $$;
do $$ declare t text;
begin foreach t in array array['items','bkb','bkb_items','transactions_log','app_settings',
  'param_jenis','param_dept_pemakai','param_dept_proses','param_tujuan','machines','param_tim','opname','opname_items'] loop
  execute format('create trigger trg_notify_%1$s after insert or update or delete on public.%1$I
                  for each statement execute function public.notify_stok_changed()', t);
end loop; end $$;

-- ---------- 8) RLS DENY-ALL ----------
do $$ declare t text;
begin foreach t in array array['users','app_settings','param_jenis','param_dept_pemakai','param_dept_proses',
  'param_tujuan','machines','items','bkb','bkb_items','transactions_log','audit_log','param_tim','opname','opname_items'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists "deny_all_%1$s" on public.%1$I', t);
  execute format('create policy "deny_all_%1$s" on public.%1$I for all using (false) with check (false)', t);
end loop; end $$;

-- ---------- 9) FUNGSI PEMBANTU (berawalan _, bukan bagian kontrak) ----------
create or replace function public._cek_actor(p_actor jsonb)
returns void language plpgsql as $$
begin
  if p_actor is null or jsonb_typeof(p_actor) <> 'object'
     or nullif(p_actor->>'id','') is null or nullif(p_actor->>'name','') is null then
    raise exception 'DATA_TIDAK_VALID|Data aktor tidak lengkap';
  end if;
end; $$;

-- role boleh membuat BKB / BKB pengganti, dari app_settings (nilai kosong atau rusak -> bawaan)
create or replace function public._peran_diizinkan(p_key text, p_role text, p_bawaan jsonb)
returns boolean language sql stable as $$
  select coalesce(p_role, '') in (
    select jsonb_array_elements_text(
      coalesce((select value from public.app_settings
                where key = p_key and jsonb_typeof(value) = 'array' and jsonb_array_length(value) > 0),
               p_bawaan)))
$$;

create or replace function public._boleh_buat_bkb(p_role text)
returns boolean language sql stable as $$
  select public._peran_diizinkan('peran_buat_bkb', p_role, '["operator","staff"]'::jsonb)
$$;

-- operator tidak pernah boleh membuat BKB pengganti
create or replace function public._boleh_buat_pengganti(p_role text)
returns boolean language sql stable as $$
  select coalesce(p_role, '') <> 'operator'
     and public._peran_diizinkan('peran_buat_pengganti', p_role, '["staff"]'::jsonb)
$$;

create or replace function public._wajib_approve_de()
returns boolean language sql stable as $$
  select coalesce((select (value)::text = 'true' from public.app_settings where key = 'wajib_approve_de'), true)
$$;

create or replace function public._audit(p_entitas text, p_id text, p_aksi text,
  p_lama jsonb, p_baru jsonb, p_alasan text, p_actor jsonb)
returns void language sql as $$
  insert into public.audit_log (entitas, entitas_id, aksi, data_lama, data_baru, alasan, actor_id, actor_name)
  values (p_entitas, p_id, p_aksi, p_lama, p_baru, p_alasan, (p_actor->>'id')::bigint, p_actor->>'name')
$$;

create or replace function public._bkb_json(p_id bigint, p_selisih boolean default false)
returns jsonb language sql stable as $$
  select to_jsonb(b) || jsonb_build_object('items', coalesce((
    select jsonb_agg(
      case when p_selisih
           then to_jsonb(i) || jsonb_build_object('selisih', i.saldo_sk - i.saldo_sistem_konfirmasi)
           else to_jsonb(i) end
      order by i.id)
    from public.bkb_items i where i.bkb_id = b.id), '[]'::jsonb))
  from public.bkb b where b.id = p_id
$$;

-- Perubahan saldo suatu baris: keluar mengurangi, masuk menambah
create or replace function public._delta(p_arah text, p_qty numeric)
returns numeric language sql immutable as $$
  select case when p_arah = 'out' then -p_qty else p_qty end
$$;

create or replace function public._arah_jenis(p_kode text)
returns text language sql stable as $$ select arah from public.param_jenis where kode = p_kode $$;

-- keterangan_extra dari p: keterangan_extra, atau INISIAL/NOMOR dari kunci inisial dan nomor_urut
create or replace function public._susun_extra(p jsonb)
returns text language sql immutable as $$
  select coalesce(
    nullif(trim(coalesce(p->>'keterangan_extra', '')), ''),
    nullif(concat_ws('/', nullif(trim(coalesce(p->>'inisial', '')), ''), nullif(trim(coalesce(p->>'nomor_urut', '')), '')), ''))
$$;

create or replace function public._buat_doc_no(p_jenis text, p_kategori text, p_date date)
returns text language plpgsql as $$
declare
  v_prefix text;
  v_urut   integer;
begin
  v_prefix := p_jenis || case when p_kategori = '1' then '110' else '410' end || '-'
              || to_char(p_date, 'YY') || chr(64 + extract(month from p_date)::int);
  perform pg_advisory_xact_lock(hashtext('doc_no:' || v_prefix));
  select coalesce(max(substr(doc_no, length(v_prefix) + 1)::int), 0) + 1 into v_urut
  from public.bkb
  where left(doc_no, length(v_prefix)) = v_prefix
    and substr(doc_no, length(v_prefix) + 1) ~ '^[0-9]+$';
  return v_prefix || lpad(v_urut::text, 5, '0');
end; $$;

-- Validasi dan lengkapi baris barang. p_existing: {"item_id": {dept_pemakai_kode, dept_proses_kode}}
create or replace function public._siapkan_lines(p_items jsonb, p_dept_tujuan text,
  p_existing jsonb, p_ikut_tujuan boolean)
returns jsonb language plpgsql as $$
declare
  v_line  jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_ids   bigint[] := '{}';
  v_id    bigint;
  v_qty   numeric;
  v_ex    jsonb;
  v_pem   text;
  v_pro   text;
  -- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: dept proses bawaan tidak dipakai lagi (K-30).
  -- v_bawaan text := (select kode from public.param_dept_proses where bawaan limit 1);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'DATA_TIDAK_VALID|Minimal satu barang';
  end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    begin
      v_id  := (v_line->>'item_id')::bigint;
      v_qty := (v_line->>'qty')::numeric;
    exception when others then
      raise exception 'DATA_TIDAK_VALID|item_id atau qty tidak valid';
    end;
    if v_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'DATA_TIDAK_VALID|item_id dan qty (lebih dari 0) wajib';
    end if;
    if v_id = any (v_ids) then
      raise exception 'DATA_TIDAK_VALID|Barang id % dobel dalam satu BKB', v_id;
    end if;
    v_ids := v_ids || v_id;
    if not exists (select 1 from public.items where id = v_id) then
      raise exception 'BARANG_TIDAK_ADA|Barang id % tidak ditemukan', v_id;
    end if;
    v_ex  := coalesce(p_existing -> v_id::text, '{}'::jsonb);
    v_pem := nullif(trim(coalesce(v_line->>'dept_pemakai_kode', '')), '');
    if v_pem is null and p_ikut_tujuan then v_pem := p_dept_tujuan; end if;
    v_pem := coalesce(v_pem, nullif(v_ex->>'dept_pemakai_kode', ''), p_dept_tujuan);
    -- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: pengisian bawaan dept proses (K-30).
    -- v_pro := coalesce(nullif(trim(coalesce(v_line->>'dept_proses_kode', '')), ''),
    --                   nullif(v_ex->>'dept_proses_kode', ''), v_bawaan);
    -- Sekarang: dept proses opsional. Bila dikirim, divalidasi; bila tidak, memakai nilai lama (data lama), selain itu null.
    v_pro := coalesce(nullif(trim(coalesce(v_line->>'dept_proses_kode', '')), ''),
                      nullif(v_ex->>'dept_proses_kode', ''));
    if v_pem is null then
      raise exception 'DATA_TIDAK_VALID|Dept pemakai wajib dipilih untuk barang id %', v_id;
    end if;
    if not exists (select 1 from public.param_dept_pemakai where kode = v_pem) then
      raise exception 'DATA_TIDAK_VALID|Dept pemakai % tidak ada', v_pem;
    end if;
    -- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: cek dept proses wajib ada (K-30).
    -- if v_pro is null or not exists (select 1 from public.param_dept_proses where kode = v_pro) then
    --   raise exception 'DATA_TIDAK_VALID|Dept proses % tidak ada', coalesce(v_pro, '(kosong)');
    -- end if;
    if v_pro is not null and not exists (select 1 from public.param_dept_proses where kode = v_pro) then
      raise exception 'DATA_TIDAK_VALID|Dept proses % tidak ada', v_pro;
    end if;
    v_out := v_out || jsonb_build_object('item_id', v_id, 'qty', v_qty,
               'dept_pemakai_kode', v_pem, 'dept_proses_kode', v_pro);
  end loop;
  return v_out;
end; $$;

-- Simpan BKB: kunci barang, cek stok, nomor urut, log. Mengembalikan objek BKB.
-- Stok kurang tidak melempar error, supaya status ditahan tersimpan; hasilnya membawa error_kode.
-- p_reuse: {"item_id": nomor_urut} untuk BKB pengganti barang yang sama.
create or replace function public._simpan_lines(p_id bigint, p_actor jsonb, p_mode text, p_reuse jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare
  v_b      public.bkb%rowtype;
  v_arah   text;
  r        record;
  v_it     public.items%rowtype;
  v_after  numeric;
  v_urut   integer;
begin
  select * into v_b from public.bkb where id = p_id;
  v_arah := public._arah_jenis(v_b.jenis_kode);

  -- kunci semua barang menurut id, cek dulu sebelum mengubah apa pun
  for r in
    select i.item_id, i.qty, it.item_code, it.name, it.quantity
    from public.bkb_items i join public.items it on it.id = i.item_id
    where i.bkb_id = p_id order by i.item_id for update of it
  loop
    if r.quantity + public._delta(v_arah, r.qty) < 0 then
      update public.bkb set status = 'ditahan', ditahan_karena = 'stok_kurang' where id = p_id;
      perform public._audit('bkb', p_id::text, 'konfirmasi', null,
        jsonb_build_object('ditahan_karena', 'stok_kurang', 'item_code', r.item_code, 'saldo', r.quantity, 'qty', r.qty),
        'Stok kurang saat simpan', p_actor);
      return public._bkb_json(p_id) || jsonb_build_object(
        'error_kode', 'STOK_MINUS',
        'error_pesan', format('STOK_MINUS|%s|%s|%s|%s', r.item_code, r.name, r.quantity, r.qty));
    end if;
  end loop;

  for r in
    select bi.id as bi_id, bi.item_id, bi.qty, bi.dept_pemakai_kode, bi.dept_proses_kode
    from public.bkb_items bi where bi.bkb_id = p_id order by bi.item_id
  loop
    select * into v_it from public.items where id = r.item_id;
    v_after := v_it.quantity + public._delta(v_arah, r.qty);
    if p_reuse ? r.item_id::text then
      v_urut := (p_reuse->>r.item_id::text)::int;
    else
      v_urut := v_it.urut_terakhir + 1;
      update public.items set urut_terakhir = v_urut where id = r.item_id;
    end if;
    update public.items set quantity = v_after where id = r.item_id;
    update public.bkb_items set nomor_urut = v_urut, saldo_sebelum = v_it.quantity, saldo_setelah = v_after
      where id = r.bi_id;
    insert into public.transactions_log
      (bkb_id, jenis, aksi, doc_no, keterangan, machine, item_id, item_code, item_name, qty, direction,
       balance_before, balance_after, nomor_urut, dept_pemakai, dept_proses, actor_id, actor_name, shift)
    values (p_id, v_b.jenis_kode, 'simpan', v_b.doc_no, v_b.keterangan, v_b.machine, v_it.id, v_it.item_code,
       v_it.name, r.qty, v_arah, v_it.quantity, v_after, v_urut, r.dept_pemakai_kode, r.dept_proses_kode,
       (p_actor->>'id')::bigint, p_actor->>'name', v_b.reference);
  end loop;

  update public.bkb set status = 'selesai', ditahan_karena = null, mode_approve = p_mode,
    disimpan_oleh_id = (p_actor->>'id')::bigint, disimpan_oleh_nama = p_actor->>'name', disimpan_at = now()
    where id = p_id;
  return public._bkb_json(p_id);
end; $$;

-- Balik stok BKB selesai (tulis log batal). Melempar STOK_MINUS bila hasilnya minus.
create or replace function public._balik_stok(p_id bigint, p_alasan text, p_actor jsonb)
returns void language plpgsql as $$
declare
  v_b     public.bkb%rowtype;
  v_arah  text;
  v_balik text;
  r       record;
  v_after numeric;
begin
  select * into v_b from public.bkb where id = p_id;
  v_arah  := public._arah_jenis(v_b.jenis_kode);
  v_balik := case when v_arah = 'out' then 'in' else 'out' end;
  for r in
    select i.item_id, i.qty, i.dept_pemakai_kode, i.dept_proses_kode, it.item_code, it.name, it.quantity
    from public.bkb_items i join public.items it on it.id = i.item_id
    where i.bkb_id = p_id order by i.item_id for update of it
  loop
    v_after := r.quantity - public._delta(v_arah, r.qty);
    if v_after < 0 then
      raise exception 'STOK_MINUS|%|%|%|%', r.item_code, r.name, r.quantity, r.qty;
    end if;
    update public.items set quantity = v_after where id = r.item_id;
    insert into public.transactions_log
      (bkb_id, jenis, aksi, doc_no, keterangan, machine, item_id, item_code, item_name, qty, direction,
       balance_before, balance_after, alasan, dept_pemakai, dept_proses, actor_id, actor_name, shift)
    values (p_id, v_b.jenis_kode, 'batal', v_b.doc_no, v_b.keterangan, v_b.machine, r.item_id, r.item_code,
       r.name, r.qty, v_balik, r.quantity, v_after, p_alasan, r.dept_pemakai_kode, r.dept_proses_kode,
       (p_actor->>'id')::bigint, p_actor->>'name', v_b.reference);
  end loop;
end; $$;

-- Saldo sistem yang diharapkan setelah BKB (membalik BKB lama bila BKB ini pengganti)
create or replace function public._saldo_harapan(p_bkb_id bigint, p_item_id bigint)
returns numeric language plpgsql stable as $$
declare
  v_b      public.bkb%rowtype;
  v_qty    numeric;
  v_saldo  numeric;
  v_lama   numeric;
begin
  select * into v_b from public.bkb where id = p_bkb_id;
  select qty into v_qty from public.bkb_items where bkb_id = p_bkb_id and item_id = p_item_id;
  select quantity into v_saldo from public.items where id = p_item_id;
  v_saldo := v_saldo + public._delta(public._arah_jenis(v_b.jenis_kode), v_qty);
  if v_b.mengganti_bkb_id is not null then
    select i.qty into v_lama from public.bkb_items i where i.bkb_id = v_b.mengganti_bkb_id and i.item_id = p_item_id;
    if v_lama is not null then
      v_saldo := v_saldo - public._delta(
        public._arah_jenis((select jenis_kode from public.bkb where id = v_b.mengganti_bkb_id)), v_lama);
    end if;
  end if;
  return v_saldo;
end; $$;

-- ---------- 10) FUNGSI KONTRAK ----------
create or replace function public.buat_bkb(p jsonb, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key     uuid;
  v_exist   bigint;
  v_t       public.param_tujuan%rowtype;
  v_date    date;
  v_kat     text := p->>'bkb_kategori';
  v_mesin   text := nullif(trim(coalesce(p->>'machine', '')), '');
  v_sumber  text;
  v_lines   jsonb;
  v_lama    public.bkb%rowtype;
  v_doc     text;
  v_id      bigint;
  v_line    jsonb;
  v_extra   text;
  v_tujuan  text;
  v_inisial text;
  v_ref     text;
begin
  perform public._cek_actor(p_actor);
  if nullif(p->>'mengganti_bkb_id', '') is not null then
    if not public._boleh_buat_pengganti(p_actor->>'role') then
      raise exception 'DILARANG|Role % tidak boleh membuat BKB pengganti', coalesce(p_actor->>'role', '(kosong)');
    end if;
  elsif not public._boleh_buat_bkb(p_actor->>'role') then
    raise exception 'DILARANG|Role % tidak boleh membuat BKB', coalesce(p_actor->>'role', '(kosong)');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'DATA_TIDAK_VALID|Data BKB kosong';
  end if;
  begin
    v_key := nullif(p->>'idempotency_key', '')::uuid;
  exception when others then
    raise exception 'DATA_TIDAK_VALID|idempotency_key bukan UUID';
  end;
  if v_key is not null then
    select id into v_exist from public.bkb where idempotency_key = v_key;
    if found then return public._bkb_json(v_exist); end if;
  end if;

  if v_kat is null or v_kat not in ('1','4') then
    raise exception 'DATA_TIDAK_VALID|bkb_kategori harus 1 atau 4';
  end if;
  begin
    v_date := coalesce(nullif(p->>'bkb_date', '')::date, current_date);
  exception when others then
    raise exception 'DATA_TIDAK_VALID|bkb_date tidak valid';
  end;
  -- [Tahap 2, 11-11-2026, T-20] Tujuan operator diambil dari akun (K-27), inisial dari akun, shift divalidasi.
  v_tujuan := p->>'tujuan_kode';
  if p_actor->>'role' = 'operator' then
    v_tujuan := (select tujuan_kode from public.users where id = (p_actor->>'id')::bigint);
    if v_tujuan is null then
      raise exception 'AKUN_BELUM_DIATUR|Akun belum diatur keterangannya. Hubungi Superadmin';
    end if;
  end if;
  -- [Tahap 2, 11-11-2026, T-27] Dinonaktifkan (temuan review): akun tanpa inisial masih memakai kiriman browser.
  -- v_inisial := (select inisial from public.users where id = (p_actor->>'id')::bigint);
  -- if v_inisial is not null then
  --   p := p || jsonb_build_object('inisial', v_inisial);
  -- end if;
  -- Inisial dari akun; akun tanpa inisial memakai 3 huruf pertama kata pertama namanya (sama dengan nameToInitial).
  -- Kiriman browser hanya dipakai bila aktor tidak ada di tabel users.
  select coalesce(u.inisial, nullif(upper(left(split_part(trim(u.name), ' ', 1), 3)), ''))
    into v_inisial from public.users u where u.id = (p_actor->>'id')::bigint;
  if v_inisial is not null then
    p := p || jsonb_build_object('inisial', v_inisial);
  end if;
  v_ref := nullif(trim(coalesce(p->>'reference', '')), '');
  if v_ref is not null and v_ref not in ('1','2','3') then
    raise exception 'DATA_TIDAK_VALID|Shift (reference) harus 1, 2, atau 3';
  end if;

  -- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: tujuan selalu dari body (sekarang lewat v_tujuan).
  -- select * into v_t from public.param_tujuan where kode = p->>'tujuan_kode';
  select * into v_t from public.param_tujuan where kode = v_tujuan;
  if not found or not v_t.aktif then
    raise exception 'TUJUAN_TIDAK_VALID|Tujuan % tidak ada atau nonaktif', coalesce(v_tujuan, '(kosong)');
  end if;
  if v_t.wajib_mesin and v_mesin is null then
    raise exception 'DATA_TIDAK_VALID|Mesin wajib diisi untuk tujuan %', v_t.kode;
  end if;
  if not v_t.wajib_mesin and v_mesin is not null then
    raise exception 'DATA_TIDAK_VALID|Tujuan % tidak memakai mesin', v_t.kode;
  end if;

  v_sumber := coalesce(nullif(p->>'sumber', ''), case when p_actor->>'role' = 'operator' then 'operator' else 'non_operator' end);
  if v_sumber not in ('operator','non_operator') then
    raise exception 'DATA_TIDAK_VALID|sumber tidak valid';
  end if;
  if v_sumber = 'non_operator' and nullif(trim(coalesce(p->>'pihak_nama', '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|pihak_nama wajib untuk BKB bukan operator';
  end if;

  if nullif(p->>'mengganti_bkb_id', '') is not null then
    select * into v_lama from public.bkb where id = (p->>'mengganti_bkb_id')::bigint for update;
    if not found then
      raise exception 'BKB_TIDAK_ADA|BKB yang diganti tidak ditemukan';
    end if;
    if v_lama.status <> 'selesai' or v_lama.diganti_oleh_bkb_id is not null then
      raise exception 'STATUS_TIDAK_SESUAI|BKB yang diganti harus berstatus selesai';
    end if;
  end if;

  v_lines := public._siapkan_lines(p->'items', v_t.dept_pemakai_kode, '{}'::jsonb, true);
  v_doc   := public._buat_doc_no(v_t.jenis_kode, v_kat, v_date);
  v_extra := public._susun_extra(p);

  insert into public.bkb (doc_no, jenis_kode, bkb_kategori, bkb_date, reference, tujuan_kode, keterangan_extra,
      keterangan, machine, sumber, pihak_nama, pihak_dept, status, mengganti_bkb_id, idempotency_key,
      dibuat_oleh_id, dibuat_oleh_nama)
  values (v_doc, v_t.jenis_kode, v_kat, v_date, v_ref, v_t.kode,
      v_extra,
      coalesce(nullif(trim(coalesce(p->>'keterangan', '')), ''), concat_ws('/', v_t.kode, v_extra)),
      v_mesin, v_sumber,
      case when v_sumber = 'non_operator' then trim(p->>'pihak_nama') end,
      case when v_sumber = 'non_operator' then nullif(trim(coalesce(p->>'pihak_dept', '')), '') end,
      'menunggu', v_lama.id, v_key, (p_actor->>'id')::bigint, p_actor->>'name')
  returning id into v_id;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    insert into public.bkb_items (bkb_id, item_id, qty, dept_pemakai_kode, dept_proses_kode)
    values (v_id, (v_line->>'item_id')::bigint, (v_line->>'qty')::numeric,
            v_line->>'dept_pemakai_kode', v_line->>'dept_proses_kode');
  end loop;

  perform public._audit('bkb', v_id::text, 'buat', null, public._bkb_json(v_id), null, p_actor);
  return public._bkb_json(v_id);
end; $$;

create or replace function public.betulkan_bkb(p_id bigint, p jsonb, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_b      public.bkb%rowtype;
  v_lama   jsonb;
  v_t      public.param_tujuan%rowtype;
  v_kat    text;
  v_date   date;
  v_mesin  text;
  v_sumber text;
  v_pnama  text;
  v_pdept  text;
  v_ganti_t boolean;
  v_exist  jsonb;
  v_lines  jsonb;
  v_line   jsonb;
  v_doc    text;
  v_extra  text;
  v_ket    text;
  v_ref    text;
begin
  perform public._cek_actor(p_actor);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'DATA_TIDAK_VALID|Data kosong';
  end if;
  -- [Tahap 2, 11-11-2026, T-20] Shift (reference) divalidasi: kosong atau 1, 2, 3.
  v_ref := nullif(trim(coalesce(p->>'reference', '')), '');
  if v_ref is not null and v_ref not in ('1','2','3') then
    raise exception 'DATA_TIDAK_VALID|Shift (reference) harus 1, 2, atau 3';
  end if;
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if v_b.status not in ('menunggu','ditahan') then
    raise exception 'STATUS_TIDAK_SESUAI|BKB berstatus % tidak bisa dibetulkan', v_b.status;
  end if;
  v_lama := public._bkb_json(p_id);

  v_kat   := coalesce(p->>'bkb_kategori', v_b.bkb_kategori);
  if v_kat not in ('1','4') then raise exception 'DATA_TIDAK_VALID|bkb_kategori harus 1 atau 4'; end if;
  begin
    v_date := coalesce(nullif(p->>'bkb_date', '')::date, v_b.bkb_date);
  exception when others then
    raise exception 'DATA_TIDAK_VALID|bkb_date tidak valid';
  end;
  select * into v_t from public.param_tujuan where kode = coalesce(nullif(p->>'tujuan_kode', ''), v_b.tujuan_kode);
  if not found then raise exception 'TUJUAN_TIDAK_VALID|Tujuan tidak ada'; end if;
  v_ganti_t := v_t.kode <> v_b.tujuan_kode;
  if v_ganti_t and not v_t.aktif then
    raise exception 'TUJUAN_TIDAK_VALID|Tujuan % nonaktif', v_t.kode;
  end if;
  v_mesin := case when p ? 'machine' then nullif(trim(coalesce(p->>'machine', '')), '') else v_b.machine end;
  if not v_t.wajib_mesin then
    if v_ganti_t and not (p ? 'machine') then v_mesin := null; end if;
    if v_mesin is not null then raise exception 'DATA_TIDAK_VALID|Tujuan % tidak memakai mesin', v_t.kode; end if;
  elsif v_mesin is null then
    raise exception 'DATA_TIDAK_VALID|Mesin wajib diisi untuk tujuan %', v_t.kode;
  end if;
  v_sumber := coalesce(nullif(p->>'sumber', ''), v_b.sumber);
  if v_sumber not in ('operator','non_operator') then raise exception 'DATA_TIDAK_VALID|sumber tidak valid'; end if;
  v_pnama := case when p ? 'pihak_nama' then nullif(trim(coalesce(p->>'pihak_nama', '')), '') else v_b.pihak_nama end;
  v_pdept := case when p ? 'pihak_dept' then nullif(trim(coalesce(p->>'pihak_dept', '')), '') else v_b.pihak_dept end;
  if v_sumber = 'operator' then v_pnama := null; v_pdept := null;
  elsif v_pnama is null then raise exception 'DATA_TIDAK_VALID|pihak_nama wajib untuk BKB bukan operator'; end if;

  -- keterangan
  if p ? 'keterangan_extra' or p ? 'inisial' or p ? 'nomor_urut' then
    v_extra := public._susun_extra(p);
  else
    v_extra := v_b.keterangan_extra;
  end if;
  v_ket := coalesce(nullif(trim(coalesce(p->>'keterangan', '')), ''),
    case when v_ganti_t or p ? 'keterangan_extra' or p ? 'inisial' or p ? 'nomor_urut'
         then concat_ws('/', v_t.kode, v_extra) else v_b.keterangan end);

  -- baris barang
  select coalesce(jsonb_object_agg(item_id::text, jsonb_build_object(
      'dept_pemakai_kode', dept_pemakai_kode, 'dept_proses_kode', dept_proses_kode)), '{}'::jsonb)
    into v_exist from public.bkb_items where bkb_id = p_id;
  if p ? 'items' then
    v_lines := public._siapkan_lines(p->'items', v_t.dept_pemakai_kode, v_exist, v_ganti_t);
  else
    select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty,
        'dept_pemakai_kode', case when v_ganti_t and v_t.dept_pemakai_kode is not null then v_t.dept_pemakai_kode else dept_pemakai_kode end,
        'dept_proses_kode', dept_proses_kode) order by id), '[]'::jsonb)
      into v_lines from public.bkb_items where bkb_id = p_id;
  end if;

  -- nomor dokumen dibuat ulang bila prefix berubah
  v_doc := v_b.doc_no;
  if left(v_b.doc_no, length(v_b.doc_no) - 5) is distinct from
     (v_t.jenis_kode || case when v_kat = '1' then '110' else '410' end || '-'
      || to_char(v_date, 'YY') || chr(64 + extract(month from v_date)::int)) then
    v_doc := public._buat_doc_no(v_t.jenis_kode, v_kat, v_date);
  end if;

  perform set_config('app.boleh_ubah_docno', '1', true);
  update public.bkb set
    doc_no = v_doc, jenis_kode = v_t.jenis_kode, bkb_kategori = v_kat, bkb_date = v_date,
    tujuan_kode = v_t.kode, machine = v_mesin, sumber = v_sumber, pihak_nama = v_pnama, pihak_dept = v_pdept,
    reference        = case when p ? 'reference' then v_ref else reference end,
    keterangan_extra = v_extra,
    keterangan       = v_ket,
    catatan_sk       = case when p ? 'catatan_sk' then nullif(trim(coalesce(p->>'catatan_sk', '')), '') else catatan_sk end,
    status = 'menunggu', ditahan_karena = null,
    dikonfirmasi_oleh_id = null, dikonfirmasi_oleh_nama = null, dikonfirmasi_at = null
  where id = p_id;
  perform set_config('app.boleh_ubah_docno', '0', true);

  perform set_config('app.boleh_hapus_baris', '1', true);
  delete from public.bkb_items where bkb_id = p_id
    and item_id not in (select (value->>'item_id')::bigint from jsonb_array_elements(v_lines));
  perform set_config('app.boleh_hapus_baris', '0', true);

  for v_line in select value from jsonb_array_elements(v_lines) loop
    insert into public.bkb_items (bkb_id, item_id, qty, dept_pemakai_kode, dept_proses_kode)
    values (p_id, (v_line->>'item_id')::bigint, (v_line->>'qty')::numeric,
            v_line->>'dept_pemakai_kode', v_line->>'dept_proses_kode')
    on conflict (bkb_id, item_id) do update set
      qty = excluded.qty, dept_pemakai_kode = excluded.dept_pemakai_kode, dept_proses_kode = excluded.dept_proses_kode;
  end loop;
  update public.bkb_items set saldo_sk = null, saldo_sistem_konfirmasi = null, cocok = null where bkb_id = p_id;

  perform public._audit('bkb', p_id::text, 'betulkan', v_lama, public._bkb_json(p_id), null, p_actor);
  return public._bkb_json(p_id);
end; $$;

-- SK memilih "Yang salah?" pada BKB ditahan: 'bkb' (SK membetulkan) atau 'saldo' (menunggu koreksi DE)
create or replace function public.yang_salah_bkb(p_id bigint, p_pilihan text, p_catatan text, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public.bkb%rowtype;
begin
  perform public._cek_actor(p_actor);
  if p_pilihan is null or p_pilihan not in ('bkb','saldo') then
    raise exception 'DATA_TIDAK_VALID|p_pilihan harus bkb atau saldo';
  end if;
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if v_b.status <> 'ditahan' then
    raise exception 'STATUS_TIDAK_SESUAI|Hanya BKB ditahan yang bisa ditandai, status sekarang %', v_b.status;
  end if;
  update public.bkb set
    ditahan_karena = case when p_pilihan = 'saldo' then 'menunggu_koreksi' else 'dibetulkan_sk' end,
    catatan_sk = coalesce(nullif(trim(coalesce(p_catatan, '')), ''), catatan_sk)
    where id = p_id;
  perform public._audit('bkb', p_id::text, 'betulkan',
    jsonb_build_object('ditahan_karena', v_b.ditahan_karena),
    jsonb_build_object('yang_salah', p_pilihan, 'ditahan_karena',
      case when p_pilihan = 'saldo' then 'menunggu_koreksi' else 'dibetulkan_sk' end),
    nullif(trim(coalesce(p_catatan, '')), ''), p_actor);
  return public._bkb_json(p_id);
end; $$;

create or replace function public.konfirmasi_bkb(p_id bigint, p_lines jsonb, p_catatan text, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_b      public.bkb%rowtype;
  v_line   jsonb;
  v_bi     public.bkb_items%rowtype;
  v_sk     numeric;
  v_harap  numeric;
  v_cocok  boolean;
  v_semua  boolean := true;
  v_n      integer;
  v_baru   jsonb;
begin
  perform public._cek_actor(p_actor);
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if v_b.status not in ('menunggu','ditahan') or v_b.ditahan_karena = 'menunggu_koreksi' then
    raise exception 'STATUS_TIDAK_SESUAI|BKB berstatus % % tidak bisa dikonfirmasi', v_b.status, coalesce(v_b.ditahan_karena, '');
  end if;
  if v_b.mengganti_bkb_id is not null
     and (select status from public.bkb where id = v_b.mengganti_bkb_id) <> 'selesai' then
    raise exception 'STATUS_TIDAK_SESUAI|BKB yang diganti sudah tidak berstatus selesai';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'DATA_TIDAK_VALID|p_lines harus array';
  end if;
  select count(*) into v_n from public.bkb_items where bkb_id = p_id;
  if jsonb_array_length(p_lines) <> v_n or (
     select count(distinct (value->>'bkb_item_id')) from jsonb_array_elements(p_lines)) <> v_n then
    raise exception 'DATA_TIDAK_VALID|Saldo akhir harus diisi untuk semua barang';
  end if;

  -- kunci barang menurut id (urutan tetap, mencegah deadlock)
  perform 1 from public.items where id in (
    select item_id from public.bkb_items where bkb_id in (p_id, coalesce(v_b.mengganti_bkb_id, p_id)))
    order by id for update;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    begin
      select * into v_bi from public.bkb_items
        where id = (v_line->>'bkb_item_id')::bigint and bkb_id = p_id;
      v_sk := (v_line->>'saldo_sk')::numeric;
    exception when others then
      raise exception 'DATA_TIDAK_VALID|bkb_item_id atau saldo_sk tidak valid';
    end;
    if v_bi.id is null then
      raise exception 'DATA_TIDAK_VALID|bkb_item_id % bukan baris BKB ini', v_line->>'bkb_item_id';
    end if;
    if v_sk is null then raise exception 'DATA_TIDAK_VALID|saldo_sk wajib diisi'; end if;
    v_harap := public._saldo_harapan(p_id, v_bi.item_id);
    v_cocok := v_harap >= 0 and v_sk = v_harap;
    if not v_cocok then v_semua := false; end if;
    update public.bkb_items set saldo_sk = v_sk, saldo_sk_pertama = coalesce(saldo_sk_pertama, v_sk),
      saldo_sistem_konfirmasi = v_harap, cocok = v_cocok where id = v_bi.id;
  end loop;

  update public.bkb set dikonfirmasi_oleh_id = (p_actor->>'id')::bigint,
    dikonfirmasi_oleh_nama = p_actor->>'name', dikonfirmasi_at = now(),
    catatan_sk = case when p_catatan is not null then nullif(trim(p_catatan), '') else catatan_sk end
    where id = p_id;

  if not v_semua then
    update public.bkb set status = 'ditahan', ditahan_karena = 'tidak_cocok' where id = p_id;
  elsif v_b.mengganti_bkb_id is not null or public._wajib_approve_de() then
    update public.bkb set status = 'menunggu_de', ditahan_karena = null where id = p_id;
  else
    update public.bkb set status = 'menunggu_de', ditahan_karena = null where id = p_id;
    v_baru := public._simpan_lines(p_id, p_actor, 'langsung');
  end if;

  perform public._audit('bkb', p_id::text, 'konfirmasi', null,
    jsonb_build_object('semua_cocok', v_semua, 'status', (select status from public.bkb where id = p_id)), null, p_actor);
  return public._bkb_json(p_id, true);
end; $$;

-- Versi tanpa catatan
create or replace function public.konfirmasi_bkb(p_id bigint, p_lines jsonb, p_actor jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.konfirmasi_bkb(p_id, p_lines, null::text, p_actor)
$$;

create or replace function public.simpan_bkb(p_id bigint, p_actor jsonb, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public.bkb%rowtype;
begin
  perform public._cek_actor(p_actor);
  if p_mode is null or p_mode not in ('de','langsung') then
    raise exception 'DATA_TIDAK_VALID|p_mode harus de atau langsung';
  end if;
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if v_b.status <> 'menunggu_de' then
    raise exception 'STATUS_TIDAK_SESUAI|BKB berstatus % tidak bisa disimpan', v_b.status;
  end if;
  if v_b.mengganti_bkb_id is not null then
    raise exception 'GANTI_WAJIB|BKB pengganti hanya bisa disimpan lewat ganti_bkb';
  end if;
  return public._simpan_lines(p_id, p_actor, p_mode);
end; $$;

create or replace function public.approve_bkb(p_id bigint, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_b    public.bkb%rowtype;
  v_role text := p_actor->>'role';
  v_hasil jsonb;
begin
  perform public._cek_actor(p_actor);
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if v_b.status <> 'menunggu_de' then
    raise exception 'STATUS_TIDAK_SESUAI|BKB berstatus % tidak bisa di-approve', v_b.status;
  end if;
  if v_b.mengganti_bkb_id is not null then
    raise exception 'GANTI_WAJIB|BKB pengganti hanya bisa disimpan lewat ganti_bkb';
  end if;
  if v_role in ('admin','superadmin') then
    v_hasil := public._simpan_lines(p_id, p_actor, 'de');
  elsif v_role = 'staff' and not public._wajib_approve_de() then
    v_hasil := public._simpan_lines(p_id, p_actor, 'langsung');
  else
    raise exception 'DILARANG|Role % tidak boleh approve BKB', coalesce(v_role, '(kosong)');
  end if;
  perform public._audit('bkb', p_id::text, 'approve', null,
    jsonb_build_object('status', v_hasil->>'status'), null, p_actor);
  return v_hasil;
end; $$;

create or replace function public.batal_bkb(p_id bigint, p_alasan text, p_versi timestamptz, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public.bkb%rowtype;
begin
  perform public._cek_actor(p_actor);
  if nullif(trim(coalesce(p_alasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Alasan pembatalan wajib diisi';
  end if;
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if p_versi is not null and p_versi is distinct from v_b.updated_at then
    raise exception 'VERSI_BERUBAH|Data sudah berubah, muat ulang.';
  end if;
  if v_b.status in ('diganti','dibatalkan') then
    raise exception 'STATUS_TIDAK_SESUAI|BKB berstatus % tidak bisa dibatalkan', v_b.status;
  end if;
  if v_b.status = 'selesai' and coalesce(p_actor->>'role', '') not in ('admin','superadmin') then
    raise exception 'DILARANG|Hanya DE atau superadmin yang boleh membatalkan BKB selesai';
  end if;
  if v_b.status = 'selesai' then
    perform public._balik_stok(p_id, p_alasan, p_actor);
  end if;
  update public.bkb set status = 'dibatalkan', ditahan_karena = null, alasan = trim(p_alasan),
    dibatalkan_oleh_id = (p_actor->>'id')::bigint, dibatalkan_oleh_nama = p_actor->>'name', dibatalkan_at = now()
    where id = p_id;
  perform public._audit('bkb', p_id::text, 'batal', jsonb_build_object('status', v_b.status),
    jsonb_build_object('status', 'dibatalkan'), trim(p_alasan), p_actor);
  return public._bkb_json(p_id);
end; $$;

-- Versi tanpa p_versi
create or replace function public.batal_bkb(p_id bigint, p_alasan text, p_actor jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.batal_bkb(p_id, p_alasan, null::timestamptz, p_actor)
$$;

create or replace function public.kembalikan_bkb(p_id bigint, p_alasan text, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public.bkb%rowtype;
begin
  perform public._cek_actor(p_actor);
  if nullif(trim(coalesce(p_alasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Alasan wajib diisi';
  end if;
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if v_b.status <> 'menunggu_de' then
    raise exception 'STATUS_TIDAK_SESUAI|BKB berstatus % tidak bisa dikembalikan', v_b.status;
  end if;
  update public.bkb set status = 'ditahan', ditahan_karena = 'dikembalikan_de' where id = p_id;
  perform public._audit('bkb', p_id::text, 'kembalikan', jsonb_build_object('status', 'menunggu_de'),
    jsonb_build_object('status', 'ditahan', 'ditahan_karena', 'dikembalikan_de'), trim(p_alasan), p_actor);
  return public._bkb_json(p_id);
end; $$;

create or replace function public.ganti_bkb(p_id_lama bigint, p_id_pengganti bigint, p_alasan text,
  p_versi timestamptz, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lama   public.bkb%rowtype;
  v_peng   public.bkb%rowtype;
  v_bi     public.bkb_items%rowtype;
  v_harap  numeric;
  v_semua  boolean := true;
  v_cocok  boolean;
  v_reuse  jsonb;
  v_hasil  jsonb;
  r        record;
begin
  perform public._cek_actor(p_actor);
  if nullif(trim(coalesce(p_alasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Alasan penggantian wajib diisi';
  end if;
  -- kunci BKB menurut id
  perform 1 from public.bkb where id in (p_id_lama, p_id_pengganti) order by id for update;
  select * into v_lama from public.bkb where id = p_id_lama;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB lama % tidak ditemukan', p_id_lama; end if;
  select * into v_peng from public.bkb where id = p_id_pengganti;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB pengganti % tidak ditemukan', p_id_pengganti; end if;
  if p_versi is not null and p_versi is distinct from v_lama.updated_at then
    raise exception 'VERSI_BERUBAH|Data sudah berubah, muat ulang.';
  end if;
  if v_lama.status <> 'selesai' then
    raise exception 'STATUS_TIDAK_SESUAI|BKB lama berstatus %', v_lama.status;
  end if;
  if v_peng.status <> 'menunggu_de' or v_peng.mengganti_bkb_id is distinct from p_id_lama then
    raise exception 'STATUS_TIDAK_SESUAI|BKB pengganti harus berstatus menunggu_de dan merujuk BKB lama';
  end if;

  -- kunci semua barang yang terlibat menurut id
  perform 1 from public.items where id in (
    select item_id from public.bkb_items where bkb_id in (p_id_lama, p_id_pengganti)) order by id for update;

  -- cek saldo pengganti terhadap saldo terbaru
  for v_bi in select * from public.bkb_items where bkb_id = p_id_pengganti order by item_id loop
    v_harap := public._saldo_harapan(p_id_pengganti, v_bi.item_id);
    v_cocok := v_harap >= 0 and v_bi.saldo_sk is not distinct from v_harap;
    if not v_cocok then v_semua := false; end if;
    update public.bkb_items set saldo_sistem_konfirmasi = v_harap, cocok = v_cocok where id = v_bi.id;
  end loop;
  if not v_semua then
    update public.bkb set status = 'ditahan', ditahan_karena = 'tidak_cocok' where id = p_id_pengganti;
    perform public._audit('bkb', p_id_pengganti::text, 'ganti', null,
      jsonb_build_object('ganti_berhasil', false, 'bkb_lama', p_id_lama), trim(p_alasan), p_actor);
    return public._bkb_json(p_id_pengganti, true) || jsonb_build_object(
      'ganti_berhasil', false, 'error_kode', 'SALDO_PENGGANTI_TIDAK_COCOK',
      'error_pesan', 'SALDO_PENGGANTI_TIDAK_COCOK|Saldo BKB pengganti tidak cocok dengan saldo terbaru');
  end if;

  -- barang BKB lama tidak boleh jadi minus setelah dibalik dan diganti
  for r in
    select it.item_code, it.name, it.quantity, l.qty,
           it.quantity - public._delta(public._arah_jenis(v_lama.jenis_kode), l.qty)
             + coalesce((select public._delta(public._arah_jenis(v_peng.jenis_kode), n.qty)
                         from public.bkb_items n where n.bkb_id = p_id_pengganti and n.item_id = l.item_id), 0) as akhir
    from public.bkb_items l join public.items it on it.id = l.item_id
    where l.bkb_id = p_id_lama order by l.item_id
  loop
    if r.akhir < 0 then
      raise exception 'STOK_MINUS|%|%|%|%', r.item_code, r.name, r.quantity, r.qty;
    end if;
  end loop;

  -- nomor urut barang yang sama dipakai ulang
  select coalesce(jsonb_object_agg(l.item_id::text, l.nomor_urut), '{}'::jsonb) into v_reuse
    from public.bkb_items l join public.bkb_items n on n.item_id = l.item_id and n.bkb_id = p_id_pengganti
    where l.bkb_id = p_id_lama and l.nomor_urut is not null;

  perform public._balik_stok(p_id_lama, trim(p_alasan), p_actor);
  v_hasil := public._simpan_lines(p_id_pengganti, p_actor, 'de', v_reuse);
  if v_hasil ? 'error_kode' then
    raise exception '%', v_hasil->>'error_pesan';
  end if;

  update public.bkb set status = 'diganti', diganti_oleh_bkb_id = p_id_pengganti, alasan = trim(p_alasan),
    dibatalkan_oleh_id = (p_actor->>'id')::bigint, dibatalkan_oleh_nama = p_actor->>'name', dibatalkan_at = now()
    where id = p_id_lama;
  perform public._audit('bkb', p_id_lama::text, 'ganti', jsonb_build_object('status', 'selesai'),
    jsonb_build_object('status', 'diganti', 'diganti_oleh_bkb_id', p_id_pengganti), trim(p_alasan), p_actor);
  return public._bkb_json(p_id_pengganti, true) || jsonb_build_object('ganti_berhasil', true);
end; $$;

-- Versi tanpa p_versi
create or replace function public.ganti_bkb(p_id_lama bigint, p_id_pengganti bigint, p_alasan text, p_actor jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.ganti_bkb(p_id_lama, p_id_pengganti, p_alasan, null::timestamptz, p_actor)
$$;

-- p: machine, keterangan_extra, keterangan, dept_pemakai [{baris, kode}], dept_proses [{baris, kode}]
-- baris = id bkb_items
create or replace function public.ubah_data_bkb(p_id bigint, p jsonb, p_alasan text, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_b     public.bkb%rowtype;
  v_t     public.param_tujuan%rowtype;
  v_lama  jsonb;
  v_mesin text;
  v_extra text;
  v_ket   text;
  v_line  jsonb;
  v_n     integer;
  v_kolom text;
  v_tabel text;
begin
  perform public._cek_actor(p_actor);
  if nullif(trim(coalesce(p_alasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Alasan wajib diisi';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'DATA_TIDAK_VALID|Data kosong'; end if;
  select * into v_b from public.bkb where id = p_id for update;
  if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_id; end if;
  if v_b.status <> 'selesai' then
    raise exception 'STATUS_TIDAK_SESUAI|Data hanya bisa diubah pada BKB selesai, status sekarang %', v_b.status;
  end if;
  v_lama := public._bkb_json(p_id);
  select * into v_t from public.param_tujuan where kode = v_b.tujuan_kode;
  v_mesin := case when p ? 'machine' then nullif(trim(coalesce(p->>'machine', '')), '') else v_b.machine end;
  if v_t.wajib_mesin and v_mesin is null then
    raise exception 'DATA_TIDAK_VALID|Mesin wajib diisi untuk tujuan %', v_t.kode;
  end if;
  if not v_t.wajib_mesin and v_mesin is not null then
    raise exception 'DATA_TIDAK_VALID|Tujuan % tidak memakai mesin', v_t.kode;
  end if;
  v_extra := case when p ? 'keterangan_extra' then nullif(trim(coalesce(p->>'keterangan_extra', '')), '') else v_b.keterangan_extra end;
  v_ket := coalesce(nullif(trim(coalesce(p->>'keterangan', '')), ''),
    case when p ? 'keterangan_extra' then concat_ws('/', v_b.tujuan_kode, v_extra) else v_b.keterangan end);

  update public.bkb set machine = v_mesin, keterangan_extra = v_extra, keterangan = v_ket where id = p_id;

  foreach v_kolom in array array['dept_pemakai','dept_proses'] loop
    if p ? v_kolom then
      if jsonb_typeof(p->v_kolom) <> 'array' then
        raise exception 'DATA_TIDAK_VALID|% harus array [{baris, kode}]', v_kolom;
      end if;
      v_tabel := case when v_kolom = 'dept_pemakai' then 'param_dept_pemakai' else 'param_dept_proses' end;
      for v_line in select value from jsonb_array_elements(p->v_kolom) loop
        if nullif(v_line->>'kode', '') is null then
          raise exception 'DATA_TIDAK_VALID|kode % wajib', v_kolom;
        end if;
        execute format('select count(*) from public.%I where kode = $1', v_tabel) into v_n using v_line->>'kode';
        if v_n = 0 then
          raise exception 'DATA_TIDAK_VALID|Kode % % tidak ada', v_kolom, v_line->>'kode';
        end if;
        if v_kolom = 'dept_pemakai' then
          update public.bkb_items set dept_pemakai_kode = v_line->>'kode'
            where id = (v_line->>'baris')::bigint and bkb_id = p_id;
        else
          update public.bkb_items set dept_proses_kode = v_line->>'kode'
            where id = (v_line->>'baris')::bigint and bkb_id = p_id;
        end if;
        get diagnostics v_n = row_count;
        if v_n = 0 then
          raise exception 'DATA_TIDAK_VALID|Baris % bukan baris BKB ini', v_line->>'baris';
        end if;
      end loop;
    end if;
  end loop;

  perform public._audit('bkb', p_id::text, 'ubah_data', v_lama, public._bkb_json(p_id), trim(p_alasan), p_actor);
  return public._bkb_json(p_id);
end; $$;

-- [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: koreksi_saldo lama (tanpa nama atasan dan nomor BA).
-- Diganti versi di bawah dengan p_nama_atasan dan p_nomor_ba (K-32). Versi lama:
-- -- Koreksi saldo. p_bkb_id opsional: BKB ditahan (tidak_cocok / menunggu_koreksi) yang memuat barang ini
-- -- dikembalikan ke SK (ditahan_karena = dikoreksi).
-- create or replace function public.koreksi_saldo(p_item_id bigint, p_saldo_baru numeric, p_alasan text,
--   p_bkb_id bigint, p_actor jsonb)
-- returns jsonb language plpgsql security definer set search_path = public as $$
-- declare
--   v_it  public.items%rowtype;
--   v_log public.transactions_log%rowtype;
--   v_b   public.bkb%rowtype;
-- begin
--   perform public._cek_actor(p_actor);
--   if nullif(trim(coalesce(p_alasan, '')), '') is null then
--     raise exception 'DATA_TIDAK_VALID|Alasan koreksi wajib diisi';
--   end if;
--   if p_saldo_baru is null or p_saldo_baru < 0 then
--     raise exception 'DATA_TIDAK_VALID|Saldo baru tidak boleh minus';
--   end if;
--   if p_bkb_id is not null then
--     select * into v_b from public.bkb where id = p_bkb_id for update;
--     if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_bkb_id; end if;
--     if v_b.status <> 'ditahan' or v_b.ditahan_karena not in ('tidak_cocok','menunggu_koreksi')
--        or not exists (select 1 from public.bkb_items where bkb_id = p_bkb_id and item_id = p_item_id) then
--       raise exception 'STATUS_TIDAK_SESUAI|BKB % tidak sedang menunggu koreksi saldo barang ini', p_bkb_id;
--     end if;
--   end if;
--   select * into v_it from public.items where id = p_item_id for update;
--   if not found then raise exception 'BARANG_TIDAK_ADA|Barang % tidak ditemukan', p_item_id; end if;
--   if p_saldo_baru = v_it.quantity then
--     raise exception 'DATA_TIDAK_VALID|Saldo baru sama dengan saldo sistem';
--   end if;
--   update public.items set quantity = p_saldo_baru where id = p_item_id;
--   insert into public.transactions_log
--     (bkb_id, jenis, aksi, keterangan, item_id, item_code, item_name, qty, direction, balance_before, balance_after,
--      alasan, actor_id, actor_name)
--   values (p_bkb_id, 'ADJ', 'koreksi', 'Koreksi saldo', v_it.id, v_it.item_code, v_it.name,
--      abs(p_saldo_baru - v_it.quantity), case when p_saldo_baru > v_it.quantity then 'in' else 'out' end,
--      v_it.quantity, p_saldo_baru, trim(p_alasan), (p_actor->>'id')::bigint, p_actor->>'name')
--   returning * into v_log;
--   -- BKB yang menunggu koreksi untuk barang ini kembali ke SK
--   update public.bkb set ditahan_karena = 'dikoreksi'
--     where status = 'ditahan' and (ditahan_karena = 'menunggu_koreksi' or id = p_bkb_id)
--       and id in (select bkb_id from public.bkb_items where item_id = p_item_id);
--   return to_jsonb(v_log);
-- end; $$;
--
-- -- Versi tanpa p_bkb_id
-- create or replace function public.koreksi_saldo(p_item_id bigint, p_saldo_baru numeric, p_alasan text, p_actor jsonb)
-- returns jsonb language sql security definer set search_path = public as $$
--   select public.koreksi_saldo(p_item_id, p_saldo_baru, p_alasan, null::bigint, p_actor)
-- $$;

-- [Tahap 2, 11-11-2026, T-20] Koreksi saldo, wajib nama atasan dan nomor Berita Acara (K-32).
-- p_bkb_id opsional: BKB ditahan (tidak_cocok / menunggu_koreksi) yang memuat barang ini
-- dikembalikan ke SK (ditahan_karena = dikoreksi).
create or replace function public.koreksi_saldo(p_item_id bigint, p_saldo_baru numeric, p_alasan text,
  p_nama_atasan text, p_nomor_ba text, p_bkb_id bigint, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_it  public.items%rowtype;
  v_log public.transactions_log%rowtype;
  v_b   public.bkb%rowtype;
begin
  perform public._cek_actor(p_actor);
  if nullif(trim(coalesce(p_alasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Alasan koreksi wajib diisi';
  end if;
  if nullif(trim(coalesce(p_nama_atasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Nama atasan wajib diisi';
  end if;
  if nullif(trim(coalesce(p_nomor_ba, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Nomor Berita Acara wajib diisi';
  end if;
  if p_saldo_baru is null or p_saldo_baru < 0 then
    raise exception 'DATA_TIDAK_VALID|Saldo baru tidak boleh minus';
  end if;
  if p_bkb_id is not null then
    select * into v_b from public.bkb where id = p_bkb_id for update;
    if not found then raise exception 'BKB_TIDAK_ADA|BKB % tidak ditemukan', p_bkb_id; end if;
    if v_b.status <> 'ditahan' or v_b.ditahan_karena not in ('tidak_cocok','menunggu_koreksi')
       or not exists (select 1 from public.bkb_items where bkb_id = p_bkb_id and item_id = p_item_id) then
      raise exception 'STATUS_TIDAK_SESUAI|BKB % tidak sedang menunggu koreksi saldo barang ini', p_bkb_id;
    end if;
  end if;
  select * into v_it from public.items where id = p_item_id for update;
  if not found then raise exception 'BARANG_TIDAK_ADA|Barang % tidak ditemukan', p_item_id; end if;
  if p_saldo_baru = v_it.quantity then
    raise exception 'DATA_TIDAK_VALID|Saldo baru sama dengan saldo sistem';
  end if;
  update public.items set quantity = p_saldo_baru where id = p_item_id;
  insert into public.transactions_log
    (bkb_id, jenis, aksi, keterangan, item_id, item_code, item_name, qty, direction, balance_before, balance_after,
     alasan, actor_id, actor_name, nama_atasan, nomor_ba)
  values (p_bkb_id, 'ADJ', 'koreksi', 'Koreksi saldo', v_it.id, v_it.item_code, v_it.name,
     abs(p_saldo_baru - v_it.quantity), case when p_saldo_baru > v_it.quantity then 'in' else 'out' end,
     v_it.quantity, p_saldo_baru, trim(p_alasan), (p_actor->>'id')::bigint, p_actor->>'name',
     trim(p_nama_atasan), trim(p_nomor_ba))
  returning * into v_log;
  perform public._audit('items', v_it.id::text, 'ubah',
    jsonb_build_object('quantity', v_it.quantity),
    jsonb_build_object('quantity', p_saldo_baru, 'koreksi_saldo', true, 'nama_atasan', trim(p_nama_atasan),
                       'nomor_ba', trim(p_nomor_ba), 'bkb_id', p_bkb_id),
    trim(p_alasan), p_actor);
  -- BKB yang menunggu koreksi untuk barang ini kembali ke SK
  update public.bkb set ditahan_karena = 'dikoreksi'
    where status = 'ditahan' and (ditahan_karena = 'menunggu_koreksi' or id = p_bkb_id)
      and id in (select bkb_id from public.bkb_items where item_id = p_item_id);
  return to_jsonb(v_log);
end; $$;

-- Versi tanpa p_bkb_id
create or replace function public.koreksi_saldo(p_item_id bigint, p_saldo_baru numeric, p_alasan text,
  p_nama_atasan text, p_nomor_ba text, p_actor jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.koreksi_saldo(p_item_id, p_saldo_baru, p_alasan, p_nama_atasan, p_nomor_ba, null::bigint, p_actor)
$$;

-- ---------- Tahap 2: Cek Stok (opname) dan laporan ----------
-- [Tahap 2, 11-11-2026, T-20] Fungsi baru, lihat docs/database.md bagian "Tahap 2".

-- Nomor OPN-YYMM-00001, urutan per bulan dari tanggal opname
create or replace function public._buat_nomor_opname(p_date date)
returns text language plpgsql as $$
declare
  v_prefix text := 'OPN-' || to_char(p_date, 'YYMM') || '-';
  v_urut   integer;
begin
  perform pg_advisory_xact_lock(hashtext('opname_no:' || v_prefix));
  select coalesce(max(substr(nomor, length(v_prefix) + 1)::int), 0) + 1 into v_urut
  from public.opname
  where left(nomor, length(v_prefix)) = v_prefix
    and substr(nomor, length(v_prefix) + 1) ~ '^[0-9]+$';
  return v_prefix || lpad(v_urut::text, 5, '0');
end; $$;

-- Objek opname lengkap: semua kolom opname + items (kolom opname_items + item_code, item_name, unit), urut id
create or replace function public._opname_json(p_id bigint)
returns jsonb language sql stable as $$
  select to_jsonb(o) || jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(i) || jsonb_build_object('item_code', it.item_code, 'item_name', it.name, 'unit', it.unit)
                     order by i.id)
    from public.opname_items i join public.items it on it.id = i.item_id
    where i.opname_id = o.id), '[]'::jsonb))
  from public.opname o where o.id = p_id
$$;

-- Role pembuat/pengaju/pembatal: staff, superadmin
create or replace function public._cek_peran_opname_buat(p_actor jsonb)
returns void language plpgsql as $$
begin
  if coalesce(p_actor->>'role', '') not in ('staff','superadmin') then
    raise exception 'DILARANG|Role % tidak boleh membuat atau mengajukan Cek Stok', coalesce(p_actor->>'role', '(kosong)');
  end if;
end; $$;

-- Role penyetuju/penolak: admin, superadmin
create or replace function public._cek_peran_opname_setuju(p_actor jsonb)
returns void language plpgsql as $$
begin
  if coalesce(p_actor->>'role', '') not in ('admin','superadmin') then
    raise exception 'DILARANG|Role % tidak boleh menyetujui atau menolak Cek Stok', coalesce(p_actor->>'role', '(kosong)');
  end if;
end; $$;

-- p: id (ubah draf/ditolak; kosong = baru), idempotency_key, tanggal, alasan_jenis (opname|rusak|hilang), catatan,
-- items [{item_id, qty_fisik (opname) | qty (rusak/hilang), analisa}]
create or replace function public.simpan_opname(p jsonb, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_o      public.opname%rowtype;
  v_id     bigint;
  v_key    uuid;
  v_exist  bigint;
  v_jenis  text;
  v_tgl    date;
  v_line   jsonb;
  v_ids    bigint[] := '{}';
  v_iid    bigint;
  v_in     numeric;
  v_saldo  numeric;
  v_sel    numeric;
  v_fisik  numeric;
  v_qty    numeric;
  v_ana    text;
  v_lama   jsonb;
begin
  perform public._cek_actor(p_actor);
  perform public._cek_peran_opname_buat(p_actor);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'DATA_TIDAK_VALID|Data Cek Stok kosong';
  end if;
  begin
    v_id := nullif(p->>'id', '')::bigint;
    v_key := nullif(p->>'idempotency_key', '')::uuid;
  exception when others then
    raise exception 'DATA_TIDAK_VALID|id atau idempotency_key tidak valid';
  end;
  begin
    v_tgl := nullif(p->>'tanggal', '')::date;
  exception when others then
    raise exception 'DATA_TIDAK_VALID|tanggal tidak valid';
  end;

  if v_id is not null then
    select * into v_o from public.opname where id = v_id for update;
    if not found then raise exception 'OPNAME_TIDAK_ADA|Cek Stok % tidak ditemukan', v_id; end if;
    if v_o.status not in ('draf','ditolak') then
      raise exception 'STATUS_TIDAK_SESUAI|Cek Stok berstatus % tidak bisa diubah', v_o.status;
    end if;
    v_lama := public._opname_json(v_id);
  elsif v_key is not null then
    select id into v_exist from public.opname where idempotency_key = v_key;
    if found then return public._opname_json(v_exist); end if;
  end if;

  v_jenis := coalesce(nullif(p->>'alasan_jenis', ''), v_o.alasan_jenis);
  if v_jenis is null or v_jenis not in ('opname','rusak','hilang') then
    raise exception 'DATA_TIDAK_VALID|alasan_jenis harus opname, rusak, atau hilang';
  end if;
  if v_id is null or p ? 'items' then
    if p->'items' is null or jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
      raise exception 'DATA_TIDAK_VALID|Minimal satu barang';
    end if;
  end if;

  if v_id is null then
    v_tgl := coalesce(v_tgl, current_date);
    insert into public.opname (nomor, tanggal, alasan_jenis, status, catatan, dibuat_oleh_id, dibuat_oleh_nama, idempotency_key)
    values (public._buat_nomor_opname(v_tgl), v_tgl, v_jenis, 'draf', nullif(trim(coalesce(p->>'catatan', '')), ''),
            (p_actor->>'id')::bigint, p_actor->>'name', v_key)
    returning id into v_id;
  else
    update public.opname set
      tanggal = coalesce(v_tgl, tanggal), alasan_jenis = v_jenis,
      catatan = case when p ? 'catatan' then nullif(trim(coalesce(p->>'catatan', '')), '') else catatan end
    where id = v_id;
  end if;

  if p ? 'items' then
    -- kunci barang menurut id supaya saldo yang disimpan konsisten
    perform 1 from public.items where id in (
      select (value->>'item_id')::bigint from jsonb_array_elements(p->'items')
      where value->>'item_id' ~ '^[0-9]+$') order by id for share;
    perform set_config('app.boleh_hapus_baris', '1', true);
    delete from public.opname_items where opname_id = v_id;
    perform set_config('app.boleh_hapus_baris', '0', true);
    for v_line in select value from jsonb_array_elements(p->'items') loop
      begin
        v_iid := (v_line->>'item_id')::bigint;
      exception when others then
        raise exception 'DATA_TIDAK_VALID|item_id tidak valid';
      end;
      if v_iid is null then raise exception 'DATA_TIDAK_VALID|item_id wajib'; end if;
      if v_iid = any (v_ids) then
        raise exception 'DATA_TIDAK_VALID|Barang id % dobel dalam satu Cek Stok', v_iid;
      end if;
      v_ids := v_ids || v_iid;
      select quantity into v_saldo from public.items where id = v_iid;
      if not found then raise exception 'BARANG_TIDAK_ADA|Barang id % tidak ditemukan', v_iid; end if;
      v_ana := nullif(trim(coalesce(v_line->>'analisa', '')), '');
      v_fisik := null; v_qty := null;
      begin
        if v_jenis = 'opname' then
          v_fisik := (v_line->>'qty_fisik')::numeric;
        else
          v_qty := (v_line->>'qty')::numeric;
        end if;
      exception when others then
        raise exception 'DATA_TIDAK_VALID|Jumlah barang id % tidak valid', v_iid;
      end;
      if v_jenis = 'opname' then
        if v_fisik is null or v_fisik < 0 then
          raise exception 'DATA_TIDAK_VALID|qty_fisik wajib dan tidak boleh minus (barang id %)', v_iid;
        end if;
        v_sel := v_fisik - v_saldo;
      else
        if v_qty is null or v_qty <= 0 then
          raise exception 'DATA_TIDAK_VALID|qty wajib lebih dari 0 (barang id %)', v_iid;
        end if;
        v_sel := -v_qty;
      end if;
      insert into public.opname_items (opname_id, item_id, saldo_sistem_saat_hitung, qty_fisik, qty, selisih, analisa)
      values (v_id, v_iid, v_saldo, v_fisik, v_qty, v_sel, v_ana);
    end loop;
  else
    -- alasan_jenis berubah tanpa items baru tidak boleh (jumlah lama tidak cocok lagi)
    if v_o.id is not null and v_jenis <> v_o.alasan_jenis then
      raise exception 'DATA_TIDAK_VALID|Mengubah alasan_jenis harus disertai items';
    end if;
  end if;

  perform public._audit('opname', v_id::text, case when v_lama is null then 'buat' else 'ubah' end,
    v_lama, public._opname_json(v_id), null, p_actor);
  return public._opname_json(v_id);
end; $$;

create or replace function public.ajukan_opname(p_id bigint, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_o public.opname%rowtype;
  v_bad record;
begin
  perform public._cek_actor(p_actor);
  perform public._cek_peran_opname_buat(p_actor);
  select * into v_o from public.opname where id = p_id for update;
  if not found then raise exception 'OPNAME_TIDAK_ADA|Cek Stok % tidak ditemukan', p_id; end if;
  if v_o.status not in ('draf','ditolak') then
    raise exception 'STATUS_TIDAK_SESUAI|Cek Stok berstatus % tidak bisa diajukan', v_o.status;
  end if;
  if not exists (select 1 from public.opname_items where opname_id = p_id) then
    raise exception 'DATA_TIDAK_VALID|Cek Stok belum punya barang';
  end if;
  select it.item_code into v_bad
    from public.opname_items oi join public.items it on it.id = oi.item_id
    where oi.opname_id = p_id and oi.selisih <> 0 and length(trim(coalesce(oi.analisa, ''))) < 10
    order by oi.id limit 1;
  if found then
    raise exception 'ANALISA_WAJIB|Analisa minimal 10 karakter wajib diisi untuk barang % yang selisihnya tidak 0', v_bad.item_code;
  end if;
  update public.opname set status = 'diajukan', diajukan_at = now() where id = p_id;
  perform public._audit('opname', p_id::text, 'ajukan', jsonb_build_object('status', v_o.status),
    jsonb_build_object('status', 'diajukan'), null, p_actor);
  return public._opname_json(p_id);
end; $$;

create or replace function public.approve_opname(p_id bigint, p_nama_atasan text, p_nomor_ba text, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_o     public.opname%rowtype;
  r       record;
  v_after numeric;
begin
  perform public._cek_actor(p_actor);
  perform public._cek_peran_opname_setuju(p_actor);
  if nullif(trim(coalesce(p_nama_atasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Nama atasan wajib diisi';
  end if;
  if nullif(trim(coalesce(p_nomor_ba, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Nomor Berita Acara wajib diisi';
  end if;
  select * into v_o from public.opname where id = p_id for update;
  if not found then raise exception 'OPNAME_TIDAK_ADA|Cek Stok % tidak ditemukan', p_id; end if;
  if v_o.status <> 'diajukan' then
    raise exception 'STATUS_TIDAK_SESUAI|Cek Stok berstatus % tidak bisa disetujui', v_o.status;
  end if;
  if v_o.dibuat_oleh_id is not null and v_o.dibuat_oleh_id = (p_actor->>'id')::bigint then
    raise exception 'TIDAK_BOLEH_SENDIRI|Cek Stok buatan sendiri tidak boleh disetujui sendiri';
  end if;

  -- kunci barang menurut id, cek semua dulu sebelum mengubah apa pun
  for r in
    select oi.selisih, it.item_code, it.name, it.quantity
    from public.opname_items oi join public.items it on it.id = oi.item_id
    where oi.opname_id = p_id order by oi.item_id for update of it
  loop
    if r.quantity + r.selisih < 0 then
      raise exception 'STOK_MINUS|%|%|%|%', r.item_code, r.name, r.quantity, abs(r.selisih);
    end if;
  end loop;

  for r in
    select oi.id as oi_id, oi.selisih, oi.analisa, it.id as item_id, it.item_code, it.name, it.quantity
    from public.opname_items oi join public.items it on it.id = oi.item_id
    where oi.opname_id = p_id order by oi.item_id
  loop
    v_after := r.quantity + r.selisih;
    update public.opname_items set saldo_sebelum = r.quantity, saldo_setelah = v_after where id = r.oi_id;
    if r.selisih <> 0 then
      update public.items set quantity = v_after where id = r.item_id;
      insert into public.transactions_log
        (jenis, aksi, doc_no, keterangan, item_id, item_code, item_name, qty, direction, balance_before, balance_after,
         alasan, actor_id, actor_name, nama_atasan, nomor_ba)
      values ('OPN', 'opname', v_o.nomor, 'Cek Stok ' || v_o.alasan_jenis, r.item_id, r.item_code, r.name,
         abs(r.selisih), case when r.selisih > 0 then 'in' else 'out' end, r.quantity, v_after,
         r.analisa, (p_actor->>'id')::bigint, p_actor->>'name', trim(p_nama_atasan), trim(p_nomor_ba));
    end if;
  end loop;

  update public.opname set status = 'disetujui', disetujui_oleh_id = (p_actor->>'id')::bigint,
    disetujui_oleh_nama = p_actor->>'name', disetujui_at = now(),
    nama_atasan = trim(p_nama_atasan), nomor_ba = trim(p_nomor_ba) where id = p_id;
  perform public._audit('opname', p_id::text, 'setujui', jsonb_build_object('status', 'diajukan'),
    jsonb_build_object('status', 'disetujui', 'nama_atasan', trim(p_nama_atasan), 'nomor_ba', trim(p_nomor_ba)),
    null, p_actor);
  return public._opname_json(p_id);
end; $$;

create or replace function public.tolak_opname(p_id bigint, p_catatan text, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o public.opname%rowtype;
begin
  perform public._cek_actor(p_actor);
  perform public._cek_peran_opname_setuju(p_actor);
  if nullif(trim(coalesce(p_catatan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Catatan penolakan wajib diisi';
  end if;
  select * into v_o from public.opname where id = p_id for update;
  if not found then raise exception 'OPNAME_TIDAK_ADA|Cek Stok % tidak ditemukan', p_id; end if;
  if v_o.status <> 'diajukan' then
    raise exception 'STATUS_TIDAK_SESUAI|Cek Stok berstatus % tidak bisa ditolak', v_o.status;
  end if;
  update public.opname set status = 'ditolak', catatan_tolak = trim(p_catatan),
    ditolak_oleh_id = (p_actor->>'id')::bigint, ditolak_oleh_nama = p_actor->>'name', ditolak_at = now()
    where id = p_id;
  perform public._audit('opname', p_id::text, 'tolak', jsonb_build_object('status', 'diajukan'),
    jsonb_build_object('status', 'ditolak'), trim(p_catatan), p_actor);
  return public._opname_json(p_id);
end; $$;

create or replace function public.batal_opname(p_id bigint, p_alasan text, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o public.opname%rowtype;
begin
  perform public._cek_actor(p_actor);
  perform public._cek_peran_opname_buat(p_actor);
  if nullif(trim(coalesce(p_alasan, '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|Alasan pembatalan wajib diisi';
  end if;
  select * into v_o from public.opname where id = p_id for update;
  if not found then raise exception 'OPNAME_TIDAK_ADA|Cek Stok % tidak ditemukan', p_id; end if;
  if v_o.status not in ('draf','ditolak') then
    raise exception 'STATUS_TIDAK_SESUAI|Cek Stok berstatus % tidak bisa dibatalkan', v_o.status;
  end if;
  update public.opname set status = 'dibatalkan', alasan_batal = trim(p_alasan),
    dibatalkan_oleh_id = (p_actor->>'id')::bigint, dibatalkan_oleh_nama = p_actor->>'name', dibatalkan_at = now()
    where id = p_id;
  perform public._audit('opname', p_id::text, 'batal', jsonb_build_object('status', v_o.status),
    jsonb_build_object('status', 'dibatalkan'), trim(p_alasan), p_actor);
  return public._opname_json(p_id);
end; $$;

-- Rekap stok per barang. Tanggal memakai hari WIB. saldo_awal dan saldo_akhir dihitung mundur dari saldo
-- sekarang memakai riwayat, jadi selalu: saldo_awal + masuk - keluar + koreksi = saldo_akhir.
-- masuk/keluar = baris riwayat selain ADJ dan OPN menurut arah; koreksi = selisih bersih ADJ + OPN.
-- p_kategori kosong = semua kategori.
create or replace function public.laporan_rekap(p_dari date, p_sampai date, p_kategori text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_mulai   timestamptz;
  v_akhir   timestamptz;
  v_hasil   jsonb;
begin
  if p_dari is null or p_sampai is null or p_sampai < p_dari then
    raise exception 'DATA_TIDAK_VALID|Rentang tanggal tidak valid';
  end if;
  if nullif(p_kategori, '') is not null and p_kategori not in ('1','4') then
    raise exception 'DATA_TIDAK_VALID|kategori harus 1 atau 4';
  end if;
  v_mulai := p_dari::timestamp at time zone 'Asia/Jakarta';
  v_akhir := (p_sampai + 1)::timestamp at time zone 'Asia/Jakarta';
  select coalesce(jsonb_agg(to_jsonb(x) order by x.item_code), '[]'::jsonb) into v_hasil from (
    select it.id as item_id, it.category_code, it.item_code, it.name, it.unit, it.stok_minimum,
           it.quantity - s.sejak_dari as saldo_awal,
           s.masuk, s.keluar, s.koreksi,
           it.quantity - s.setelah_sampai as saldo_akhir,
           (it.stok_minimum is not null and it.quantity - s.setelah_sampai < it.stok_minimum) as di_bawah_minimum
    from public.items it
    cross join lateral (
      select
        coalesce(sum(case when t.created_at >= v_mulai then public._delta(t.direction, t.qty) end), 0) as sejak_dari,
        coalesce(sum(case when t.created_at >= v_akhir then public._delta(t.direction, t.qty) end), 0) as setelah_sampai,
        coalesce(sum(case when t.created_at >= v_mulai and t.created_at < v_akhir and t.jenis not in ('ADJ','OPN')
                          and t.direction = 'in' then t.qty end), 0) as masuk,
        coalesce(sum(case when t.created_at >= v_mulai and t.created_at < v_akhir and t.jenis not in ('ADJ','OPN')
                          and t.direction = 'out' then t.qty end), 0) as keluar,
        coalesce(sum(case when t.created_at >= v_mulai and t.created_at < v_akhir and t.jenis in ('ADJ','OPN')
                          then public._delta(t.direction, t.qty) end), 0) as koreksi
      from public.transactions_log t where t.item_id = it.id
    ) s
    where nullif(p_kategori, '') is null or it.category_code = p_kategori
  ) x;
  return v_hasil;
end; $$;

-- Mutasi (transactions_log). p: dari, sampai (tanggal WIB), item_id, jenis, tujuan (kode keterangan BKB),
-- keterangan (mengandung teks), shift, limit (bawaan 1000, maks 50000), offset. Mengembalikan {rows, total}.
create or replace function public.laporan_mutasi(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_dari   date;
  v_sampai date;
  v_item   bigint;
  v_jenis  text;
  v_tujuan text;
  v_ket    text;
  v_shift  text;
  v_limit  integer;
  v_offset integer;
  v_total  bigint;
  v_rows   jsonb;
begin
  p := coalesce(p, '{}'::jsonb);
  if jsonb_typeof(p) <> 'object' then raise exception 'DATA_TIDAK_VALID|Filter harus objek'; end if;
  begin
    v_dari   := nullif(p->>'dari', '')::date;
    v_sampai := nullif(p->>'sampai', '')::date;
    v_item   := nullif(p->>'item_id', '')::bigint;
    v_limit  := coalesce(nullif(p->>'limit', '')::integer, 1000);
    v_offset := coalesce(nullif(p->>'offset', '')::integer, 0);
  exception when others then
    raise exception 'DATA_TIDAK_VALID|Filter tidak valid';
  end;
  if v_limit < 1 or v_limit > 50000 or v_offset < 0 then
    raise exception 'DATA_TIDAK_VALID|limit harus 1 sampai 50000 dan offset tidak boleh minus';
  end if;
  v_jenis  := nullif(trim(coalesce(p->>'jenis', '')), '');
  v_tujuan := nullif(trim(coalesce(p->>'tujuan', '')), '');
  v_ket    := nullif(trim(coalesce(p->>'keterangan', '')), '');
  v_shift  := nullif(trim(coalesce(p->>'shift', '')), '');

  with f as (
    select t.*, b.tujuan_kode, b.bkb_date, b.reference as bkb_shift
    from public.transactions_log t left join public.bkb b on b.id = t.bkb_id
    where (v_dari is null or t.created_at >= (v_dari::timestamp at time zone 'Asia/Jakarta'))
      and (v_sampai is null or t.created_at < ((v_sampai + 1)::timestamp at time zone 'Asia/Jakarta'))
      and (v_item is null or t.item_id = v_item)
      and (v_jenis is null or t.jenis = v_jenis)
      and (v_tujuan is null or b.tujuan_kode = v_tujuan)
      and (v_ket is null or t.keterangan ilike '%' || v_ket || '%')
      and (v_shift is null or t.shift = v_shift)
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at, g.id)
                   from (select * from f order by created_at, id limit v_limit offset v_offset) g), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end; $$;

create or replace function public.create_item_master(p jsonb, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cat  text := p->>'category_code';
  v_qty  numeric;
  v_item public.items%rowtype;
  v_cons text;
begin
  perform public._cek_actor(p_actor);
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'DATA_TIDAK_VALID|Data kosong'; end if;
  if v_cat is null or v_cat not in ('1','4') then raise exception 'DATA_TIDAK_VALID|category_code harus 1 atau 4'; end if;
  if nullif(trim(coalesce(p->>'item_code', '')), '') is null or nullif(trim(coalesce(p->>'name', '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|item_code dan name wajib';
  end if;
  begin
    v_qty := coalesce(nullif(p->>'quantity', '')::numeric, 0);
  exception when others then
    raise exception 'DATA_TIDAK_VALID|quantity tidak valid';
  end;
  if v_qty < 0 then raise exception 'DATA_TIDAK_VALID|quantity tidak boleh minus'; end if;
  begin
    insert into public.items (category_code, location_code, item_code, barcode, name, unit, quantity, stok_minimum)
    values (v_cat, case when v_cat = '1' then '100' else '800' end, trim(p->>'item_code'),
            nullif(trim(coalesce(p->>'barcode', '')), ''), trim(p->>'name'),
            coalesce(nullif(trim(coalesce(p->>'unit', '')), ''), 'pcs'), v_qty,
            nullif(p->>'stok_minimum', '')::numeric)
    returning * into v_item;
  exception when unique_violation then
    get stacked diagnostics v_cons = constraint_name;
    if v_cons = 'items_barcode_uq' then
      raise exception 'BARCODE_SUDAH_ADA|Barcode sudah dipakai barang lain';
    end if;
    raise exception 'KODE_SUDAH_ADA|Kode barang % sudah ada', trim(p->>'item_code');
  end;
  if v_qty > 0 then
    insert into public.transactions_log
      (jenis, aksi, keterangan, item_id, item_code, item_name, qty, direction, balance_before, balance_after,
       actor_id, actor_name)
    values ('SA', 'saldo_awal', 'Saldo awal master barang', v_item.id, v_item.item_code, v_item.name,
            v_qty, 'in', 0, v_qty, (p_actor->>'id')::bigint, p_actor->>'name');
  end if;
  perform public._audit('items', v_item.id::text, 'buat', null, to_jsonb(v_item), null, p_actor);
  return to_jsonb(v_item);
end; $$;

create or replace function public.update_item_master(p_id bigint, p jsonb, p_actor jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old  public.items%rowtype;
  v_new  public.items%rowtype;
  v_cat  text;
  v_cons text;
begin
  perform public._cek_actor(p_actor);
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'DATA_TIDAK_VALID|Data kosong'; end if;
  select * into v_old from public.items where id = p_id for update;
  if not found then raise exception 'BARANG_TIDAK_ADA|Barang % tidak ditemukan', p_id; end if;
  v_cat := coalesce(p->>'category_code', v_old.category_code);
  if v_cat not in ('1','4') then raise exception 'DATA_TIDAK_VALID|category_code harus 1 atau 4'; end if;
  if p ? 'item_code' and nullif(trim(coalesce(p->>'item_code', '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|item_code tidak boleh kosong';
  end if;
  if p ? 'name' and nullif(trim(coalesce(p->>'name', '')), '') is null then
    raise exception 'DATA_TIDAK_VALID|name tidak boleh kosong';
  end if;
  begin
    update public.items set
      category_code = v_cat,
      location_code = case when v_cat = '1' then '100' else '800' end,
      item_code     = coalesce(nullif(trim(coalesce(p->>'item_code', '')), ''), item_code),
      barcode       = case when p ? 'barcode' then nullif(trim(coalesce(p->>'barcode', '')), '') else barcode end,
      name          = coalesce(nullif(trim(coalesce(p->>'name', '')), ''), name),
      unit          = coalesce(nullif(trim(coalesce(p->>'unit', '')), ''), unit),
      stok_minimum  = case when p ? 'stok_minimum' then nullif(p->>'stok_minimum', '')::numeric else stok_minimum end
    where id = p_id returning * into v_new;
  exception when unique_violation then
    get stacked diagnostics v_cons = constraint_name;
    if v_cons = 'items_barcode_uq' then
      raise exception 'BARCODE_SUDAH_ADA|Barcode sudah dipakai barang lain';
    end if;
    raise exception 'KODE_SUDAH_ADA|Kode barang sudah ada';
  end;
  perform public._audit('items', p_id::text, 'ubah', to_jsonb(v_old), to_jsonb(v_new), null, p_actor);
  return to_jsonb(v_new);
end; $$;

-- ---------- 11) HAK AKSES FUNGSI: hanya service_role ----------
do $$ declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    execute 'grant execute on function ' || r.sig || ' to service_role';
  end loop;
end $$;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ============================================================
--  Pengaman superadmin terakhir (review akhir, 8 November 2026)
--  Cek di API (countByRole) tidak atomik. Trigger ini memastikan dua perubahan bersamaan
--  tidak meninggalkan nol superadmin aktif: kunci advisory membuat transaksi kedua menunggu,
--  lalu pengecekannya melihat perubahan pertama yang sudah commit.
-- ============================================================
create or replace function public._jaga_superadmin_terakhir()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.role = 'superadmin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'superadmin' or not new.active) then
    perform pg_advisory_xact_lock(hashtext('stokhub_superadmin'));
    if not exists (select 1 from public.users where role = 'superadmin' and active) then
      raise exception 'SUPERADMIN_TERAKHIR|Harus ada minimal satu superadmin aktif.';
    end if;
  end if;
  return null;
end; $$;
revoke all on function public._jaga_superadmin_terakhir() from public;

create trigger trg_jaga_superadmin_terakhir
  after update or delete on public.users
  for each row execute function public._jaga_superadmin_terakhir();

