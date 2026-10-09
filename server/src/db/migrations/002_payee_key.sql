-- The payee key (normalised counterparty, else the first words of the bank text) is stamped on
-- each transaction so "remember for this payee" can reach its other transactions in one update.
alter table transactions add column payee_key text;
create index transactions_user_payee on transactions(user_id, payee_key);
