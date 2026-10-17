-- What the sending bank said would arrive in the other currency, from alerts that quote it
-- (Grey's withdrawal email gives the naira figure). Lets a conversion pair with the credit that
-- lands for exactly that amount instead of guessing from the day's rate.
alter table transactions add column settled_amount_minor bigint;
alter table transactions add column settled_currency text;
