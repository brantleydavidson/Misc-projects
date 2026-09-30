-- Personal reading index. Cloud SQL Postgres, reached only through the
-- Cloud Run SQL connector. Do not add authorized networks.

create table if not exists documents (
  id uuid primary key,
  title text not null,
  summary text,
  source_url text,
  source_kind text not null check (source_kind in ('page', 'selection', 'pdf')),
  status text not null check (status in ('pending', 'ready', 'failed')),
  saved_at timestamptz not null default now(),
  error text,
  original_uri text,
  pdf_uri text,
  drive_file_id text,
  drive_status text
);

create table if not exists nodes (
  id uuid primary key,
  document_id uuid not null references documents (id) on delete cascade,
  parent_id uuid references nodes (id) on delete cascade,
  title text not null,
  summary text not null default '',
  body text not null default '',
  position integer not null,
  page_start integer,
  page_end integer
);

create index if not exists nodes_document_id_idx on nodes (document_id);
create index if not exists nodes_parent_id_idx on nodes (parent_id);

create table if not exists loop_runs (
  id uuid primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  considered integer not null,
  changed integer not null,
  skipped integer not null,
  notes text not null
);

create index if not exists loop_runs_started_at_idx on loop_runs (started_at desc);
