-- Starting a service needs an account.
--
-- Browsing stays public: the service pages, the Entertainment platform, the
-- Fashion Hub, the Service Hub and the company information. But the actions
-- that create something belonging to a person (a trip request, a consultancy
-- or data-analysis request, a software consultation booking, a course
-- registration) are now for signed-in people only. The website explains this
-- and brings the visitor back after signing in; this file is what actually
-- enforces it, so an API call without a session is refused whatever the
-- website shows.
--
-- The customer links (travel_trip_view, consult_request_view, ... by token)
-- stay as they are: they are how a customer follows their own request.

-- ============== REQUEST FUNCTIONS: SIGNED-IN ONLY ==============
REVOKE EXECUTE ON FUNCTION public.travel_request_trip(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consult_submit_request(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.data_submit_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.travel_request_trip(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consult_submit_request(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_submit_request(jsonb) TO authenticated;

-- ============== BOOKINGS AND REGISTRATIONS: THEIR OWN ==============
-- A booking or registration is always the signed-in person's (user_id was
-- allowed to be empty before, which let visitors create them).
DROP POLICY IF EXISTS "Users create software bookings" ON public.software_bookings;
CREATE POLICY "Users create software bookings" ON public.software_bookings
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending' AND agreed_price IS NULL
    AND NOT deposit_paid AND deposit_paid_at IS NULL
    AND NOT final_paid AND final_paid_at IS NULL
    AND admin_note IS NULL
  );

DROP POLICY IF EXISTS "Users create own registrations" ON public.course_registrations;
CREATE POLICY "Users create own registrations" ON public.course_registrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');

REVOKE INSERT ON public.software_bookings, public.course_registrations FROM anon;
