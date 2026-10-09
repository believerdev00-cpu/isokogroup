-- Close the functions to roles that were never meant to call them.
--
-- GRANT EXECUTE ... TO authenticated looks like it restricts a function. It
-- does not. PostgreSQL grants EXECUTE on a new function to PUBLIC by default,
-- and every role inherits that, so the grant added a privilege anon already
-- had. Checked on the live database: anon could execute my_conversations,
-- message_start, message_mark_read and in_conversation.
--
-- Nothing leaked, because each one defends itself -- they read auth.uid() and
-- a signed-out caller matches no rows, or is refused outright. But a single
-- layer of defence is not the arrangement these were designed to have, and the
-- same oversight was already found once today on initiative_raised.

-- Signed-in only: a private conversation needs somebody who can be identified.
REVOKE EXECUTE ON FUNCTION public.my_conversations() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.message_start(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.message_mark_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_start(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_mark_read(uuid) TO authenticated;

-- in_conversation stays executable by authenticated, and that is not an
-- oversight. A row-level security policy is evaluated as the querying user, so
-- every participant needs EXECUTE on the function their policy calls. Revoking
-- it denied the policy itself: both participants in a conversation got 403
-- instead of their own messages. anon is removed, which is the part that was
-- actually wrong.
REVOKE EXECUTE ON FUNCTION public.in_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_conversation(uuid) TO authenticated;

-- These two stay open to anon on purpose: writing to the company and leaving a
-- comment are the two things somebody must be able to do without an account.
-- Re-granted explicitly so the intent is recorded rather than inherited.
GRANT EXECUTE ON FUNCTION public.contact_submit_message(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comment_submit(jsonb) TO anon, authenticated;

-- These two are called only from inside comment_submit, which is SECURITY
-- DEFINER and so runs them as its owner. No policy calls them, so unlike
-- in_conversation they need no caller grant.
REVOKE EXECUTE ON FUNCTION public.comment_subject_is_open(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comment_author_badge(text, uuid) FROM PUBLIC, anon, authenticated;
