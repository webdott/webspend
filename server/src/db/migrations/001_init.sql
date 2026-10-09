-- WebSpend schema, version one.
-- Every record carries a user_id so the database is multi-user in shape from day one.
-- Money is bigint minor units (kobo, cents). Never a decimal.

create table users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null unique,
  default_currency      text not null default 'NGN',
  show_usd_equivalent   boolean not null default true,
  theme                 text not null default 'auto',
  monthly_budget_minor  bigint,
  created_at            timestamptz not null default now()
);

-- One row per session token. The token itself is never stored, only its SHA-256.
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  client        text not null default 'web',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now()
);

-- Mailbox credentials sit apart from everything else so encryption and deletion have one home.
create table mailbox_tokens (
  user_id        uuid primary key references users(id) on delete cascade,
  provider       text not null default 'gmail',
  refresh_token  text not null,
  access_token   text,
  expires_at     timestamptz,
  last_polled_at timestamptz,
  last_error     text,
  updated_at     timestamptz not null default now()
);

create table accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  bank                text not null,
  name                text not null,
  account_number      text,
  currency            text not null default 'NGN',
  is_own              boolean not null default true,
  tracked             boolean not null default false,
  tracking_from       timestamptz,
  last_balance_minor  bigint,
  last_balance_at     timestamptz,
  last_alert_at       timestamptz,
  created_at          timestamptz not null default now()
);
create index accounts_user on accounts(user_id);

create table categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table payee_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  payee_key    text not null,
  category_id  uuid not null references categories(id) on delete cascade,
  updated_at   timestamptz not null default now(),
  unique (user_id, payee_key)
);

create table imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete cascade,
  format        text not null,
  rows_total    integer not null default 0,
  rows_added    integer not null default 0,
  rows_skipped  integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Every bank email seen, parsed or not, so nothing is processed twice and a parser fix can be re-run.
create table raw_alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  account_id      uuid references accounts(id) on delete set null,
  message_id      text not null,
  received_at     timestamptz not null,
  sender          text not null,
  subject         text not null,
  body_text       text not null,
  status          text not null,
  detail          text,
  parsed          jsonb,
  transaction_id  uuid,
  created_at      timestamptz not null default now(),
  unique (user_id, message_id)
);
create index raw_alerts_user_status on raw_alerts(user_id, status);

create table transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  account_id            uuid not null references accounts(id) on delete cascade,
  occurred_at           timestamptz not null,
  type                  text not null,
  -- debit or credit, as the bank saw it. Kept so a transfer can be re-marked back to its leg.
  direction             text not null,
  amount_minor          bigint not null check (amount_minor >= 0),
  currency              text not null,
  fx_per_usd            numeric(18, 6),
  counterparty_name     text,
  counterparty_bank     text,
  counterparty_account  text,
  bank_description      text,
  user_description      text,
  category_id           uuid references categories(id) on delete set null,
  source                text not null,
  bank_reference        text,
  raw_alert_id          uuid references raw_alerts(id) on delete set null,
  import_id             uuid references imports(id) on delete set null,
  transfer_group_id     uuid,
  is_fee                boolean not null default false,
  balance_after_minor   bigint,
  created_at            timestamptz not null default now()
);
create index transactions_user_time on transactions(user_id, occurred_at desc);
create index transactions_account_time on transactions(account_id, occurred_at desc);
create index transactions_transfer_group on transactions(transfer_group_id);

alter table raw_alerts
  add constraint raw_alerts_transaction_fk
  foreign key (transaction_id) references transactions(id) on delete set null;

create table gaps (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users(id) on delete cascade,
  account_id              uuid not null references accounts(id) on delete cascade,
  from_at                 timestamptz not null,
  to_at                   timestamptz not null,
  expected_balance_minor  bigint not null,
  actual_balance_minor    bigint not null,
  difference_minor        bigint not null,
  currency                text not null,
  status                  text not null default 'open',
  filled_by_import_id     uuid references imports(id) on delete set null,
  created_at              timestamptz not null default now()
);
create index gaps_user_status on gaps(user_id, status);

-- Units of each currency per one US dollar on a given day.
create table fx_rates (
  day         date not null,
  currency    text not null,
  per_usd     numeric(18, 6) not null,
  source      text not null,
  fetched_at  timestamptz not null default now(),
  primary key (day, currency)
);
