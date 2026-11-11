-- ============================================================================
-- Trade Journal schema (Neon Postgres)
--
-- Apply with:  npm run db:migrate      (from GZS-Trading-Journal-Tools)
--
-- Every statement is idempotent, so the file can be re-run safely. Statements
-- are separated by the statement-breakpoint marker comment below, because
-- Neon's SQL-over-HTTP endpoint executes exactly one command per request (a
-- multi-statement string is rejected with 42601 "cannot insert multiple
-- commands into a prepared statement").
--
-- Row ownership: every table keys off user_id, the Clerk user id (`sub`) of
-- the signed-in user. The API sets it from the verified session token; rows
-- are never shared between users.
-- ============================================================================

create table if not exists app_users (
  id          text primary key,
  created_at  timestamptz not null default now()
);
--> statement-breakpoint

-- Instruments are a plain ordered list of symbols in the app.
create table if not exists instruments (
  user_id   text not null references app_users(id) on delete cascade,
  symbol    text not null,
  position  integer not null default 0,
  primary key (user_id, symbol)
);
--> statement-breakpoint

-- Trading sessions (London, New York, ...) with their own colour.
create table if not exists sessions (
  id           text primary key,
  user_id      text not null references app_users(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  start_time   text not null default '00:00',
  end_time     text not null default '00:00',
  color        text not null default '#37d6a0',
  position     integer not null default 0
);
--> statement-breakpoint

-- Trades. Times are wall-clock (no zone) because the app records the local
-- time the trader took the trade; converting to timestamptz would shift it.
create table if not exists trades (
  id             text primary key,
  user_id        text not null references app_users(id) on delete cascade,
  symbol         text not null,
  direction      text not null default 'Long',
  entry_at       timestamp,
  exit_at        timestamp,
  entry_price    numeric(18, 5),
  exit_price     numeric(18, 5),
  quantity       numeric(18, 4) not null default 0,
  pnl            numeric(18, 2) not null default 0,
  strategy       text not null default '',
  tags           text not null default '',
  notes          text not null default '',
  session_id     text not null default '',
  session_name   text not null default '',
  session_color  text not null default '',
  commission     numeric(18, 2) not null default 0,
  swap           numeric(18, 2) not null default 0,
  fees           numeric(18, 2) not null default 0,
  pips           numeric(18, 2),
  status         text not null default 'open',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
--> statement-breakpoint

-- The dashboard and journal table read trades newest-first.
create index if not exists trades_user_entry_idx
  on trades (user_id, entry_at desc nulls last);
--> statement-breakpoint

-- Tombstones. Deleting a trade sets deleted_at instead of removing the row,
-- so other devices learn that the deletion was deliberate and cannot
-- resurrect the trade from their local cache. Rows are purged for real after
-- 30 days (npm run db:purge).
alter table trades add column if not exists deleted_at timestamptz;
--> statement-breakpoint

create index if not exists trades_deleted_idx
  on trades (user_id, deleted_at)
  where deleted_at is not null;
--> statement-breakpoint

-- Chart snapshots live in their own table: a 32 KB JPEG data URL per side
-- would bloat every trade row, every backup and every list query. Keeping
-- them separate means the trades table stays ~1 KB per row, and this table is
-- the single place to swap for object storage later.
create table if not exists trade_snapshots (
  trade_id    text not null references trades(id) on delete cascade,
  kind        text not null check (kind in ('entry', 'exit')),
  data_url    text not null,
  updated_at  timestamptz not null default now(),
  primary key (trade_id, kind)
);
--> statement-breakpoint

-- Balance corrections are an append-only ledger: the balance is
-- base + signed sum of adjustments, never a mutable number.
create table if not exists balance_adjustments (
  id           text primary key,
  user_id      text not null references app_users(id) on delete cascade,
  kind         text not null check (kind in ('add', 'subtract')),
  amount       numeric(18, 2) not null check (amount > 0),
  occurred_on  date not null,
  occurred_at  time not null,
  reason       text not null default 'Other',
  notes        text not null default ''
);
--> statement-breakpoint

create index if not exists balance_adjustments_user_idx
  on balance_adjustments (user_id, occurred_on desc);
--> statement-breakpoint

-- Per-user settings: starting balance and the dashboard card layout.
create table if not exists app_settings (
  user_id           text primary key references app_users(id) on delete cascade,
  balance_base      numeric(18, 2) not null default 100,
  dashboard_layout  jsonb,
  updated_at        timestamptz not null default now()
);
