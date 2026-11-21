-- Custom SQL migration file, put your code below! --
-- The instant a billing day starts: Pacific midnight, 08:00 UTC in winter and 07:00 UTC in summer.
-- cloud_billing_day(cloud_billing_day_start(d)) = d for every date.
CREATE OR REPLACE FUNCTION public.cloud_billing_day_start(day date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
	SELECT day::timestamp AT TIME ZONE 'America/Los_Angeles';
$$;
