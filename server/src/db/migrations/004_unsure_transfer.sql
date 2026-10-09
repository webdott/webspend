-- Set when the other account matches one of the user's own by its last digits only, so the
-- transaction may be a transfer to self. Cleared when it pairs or the user re-marks it.
alter table transactions add column unsure_transfer boolean not null default false;
