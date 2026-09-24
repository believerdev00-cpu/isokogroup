-- PLAN MY TRIP: customers can ask for a B&B as well as a hotel. The function is
-- unchanged apart from 'bnb' joining the needs it accepts.
CREATE OR REPLACE FUNCTION public.travel_request_trip(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_arrival date;
  v_departure date;
  v_travelers int;
  v_needs text[];
  v_package uuid;
  t public.travel_trips;
BEGIN
  BEGIN
    v_arrival := (p ->> 'arrival_date')::date;
    v_departure := (p ->> 'departure_date')::date;
    v_travelers := (p ->> 'travelers')::int;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Please check the dates and number of travelers';
  END;
  IF v_arrival IS NULL OR v_departure IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Arrival and departure dates are required';
  END IF;
  IF v_arrival < current_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The arrival date is in the past';
  END IF;
  IF v_departure < v_arrival THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Departure must be on or after arrival';
  END IF;
  IF v_departure > v_arrival + 90 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'For trips longer than 90 days, please contact us directly';
  END IF;
  IF v_travelers IS NULL OR v_travelers < 1 OR v_travelers > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Number of travelers must be between 1 and 100';
  END IF;

  SELECT coalesce(array_agg(DISTINCT n), '{}') INTO v_needs
  FROM jsonb_array_elements_text(coalesce(p -> 'needs', '[]'::jsonb)) n
  WHERE n IN ('airport_pickup', 'hotel', 'bnb', 'transport', 'activities', 'airport_dropoff', 'plan_everything');
  IF cardinality(v_needs) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose what you need help with';
  END IF;

  IF nullif(p ->> 'package_id', '') IS NOT NULL THEN
    SELECT id INTO v_package FROM public.travel_packages
    WHERE id::text = p ->> 'package_id' AND is_active;
  END IF;

  INSERT INTO public.travel_trips (
    user_id, destination, travelling_from, arrival_date, departure_date, travelers, needs, package_id,
    customer_name, customer_phone, customer_email, message
  ) VALUES (
    auth.uid(),
    coalesce(public.svc_text(p, 'destination', 'Destination', 60, false), 'Rwanda'),
    public.svc_text(p, 'travelling_from', 'Travelling from', 80, false),
    v_arrival, v_departure, v_travelers, v_needs, v_package,
    public.svc_text(p, 'name', 'Name', 120),
    public.svc_text(p, 'phone', 'Phone / WhatsApp', 40),
    public.svc_email(p),
    public.svc_text(p, 'message', 'Message', 2000, false)
  ) RETURNING * INTO t;

  RETURN jsonb_build_object('reference', t.reference, 'token', t.access_token);
END $$;
