-- The user's own headline for a transaction. When null the apps fall back to the description,
-- the payee, then the bank's text.
alter table transactions add column user_title text;
