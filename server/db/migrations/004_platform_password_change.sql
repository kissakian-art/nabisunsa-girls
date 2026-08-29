-- Letting a platform administrator change their own password, and making
-- that change mean something.
--
-- Sessions here are signed tokens with no server-side record, which is what
-- lets a request be authenticated without a database round trip. The cost is
-- that nothing can be taken back: a token stays valid until it expires, so
-- until now, changing a password did not end a session opened with the old
-- one, and deactivating an administrator did not end theirs either. Both
-- left up to four hours of continued access to a console that can suspend
-- every school on the platform — exactly the window that matters when the
-- reason for the change is that someone else has the password.
--
-- This column closes it. A token records when it was issued; a session
-- issued before the account's last password change is refused. That costs
-- one row read per console request, which is nothing next to the queries
-- those pages already run, and it is deliberately NOT done for school
-- sessions, where the portal's whole design is to avoid that read.
--
-- NULL means the password has never been changed since the account was
-- created, so every existing token stays valid — the right behaviour for a
-- migration that must not sign out the person applying it.

ALTER TABLE platform_users
  ADD COLUMN password_changed_at DATETIME NULL
    COMMENT 'Sessions issued before this are refused. NULL = never changed.'
    AFTER password_hash;
