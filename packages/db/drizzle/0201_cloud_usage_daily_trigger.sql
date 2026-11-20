-- An error here must never fail the event insert: the event is the record of usage Autumn already billed.

CREATE FUNCTION public.cloud_usage_daily_add(e public.cloud_usage_events, sign integer)
RETURNS void
LANGUAGE sql
AS $$
	INSERT INTO public.cloud_usage_daily AS d
		(organization_id, day, user_id, vcpus, gb_minutes, seconds, events)
	SELECT e.organization_id, (e.sent_at AT TIME ZONE 'America/Los_Angeles')::date, e.user_id, b.vcpus,
		sign * e.amount, sign * extract(epoch FROM e.window_to - e.window_from), sign
	FROM public.cloud_workspace_boots b
	WHERE b.id = e.boot_id
	ON CONFLICT ON CONSTRAINT cloud_usage_daily_key DO UPDATE SET
		gb_minutes = d.gb_minutes + excluded.gb_minutes,
		seconds = d.seconds + excluded.seconds,
		events = d.events + excluded.events;
$$;
--> statement-breakpoint

CREATE FUNCTION public.cloud_usage_daily_apply()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.feature = 'box_gb_minutes' AND OLD.sent_at IS NOT NULL THEN
		PERFORM public.cloud_usage_daily_add(OLD, -1);
	END IF;
	IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.feature = 'box_gb_minutes' AND NEW.sent_at IS NOT NULL THEN
		PERFORM public.cloud_usage_daily_add(NEW, 1);
	END IF;
	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	RAISE WARNING 'cloud_usage_daily not updated: organization % day % sqlstate %',
		coalesce(NEW.organization_id, OLD.organization_id),
		(coalesce(NEW.sent_at, OLD.sent_at) AT TIME ZONE 'America/Los_Angeles')::date,
		SQLSTATE;
	RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER cloud_usage_daily
AFTER INSERT OR UPDATE OR DELETE ON public.cloud_usage_events
FOR EACH ROW
EXECUTE FUNCTION public.cloud_usage_daily_apply();
