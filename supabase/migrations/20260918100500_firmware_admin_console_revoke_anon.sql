-- The previous migration only revoked EXECUTE from PUBLIC, not from anon
-- directly. Supabase's default privileges grant anon EXECUTE on new
-- functions in the public schema independent of the PUBLIC pseudo-role, so
-- that omission left is_admin() and publish_firmware_release() callable by
-- unauthenticated requests -- inconsistent with every other admin-sensitive
-- function in this project (e.g. claim_device, unclaim_device), which all
-- revoke from anon explicitly. publish_firmware_release() already checks
-- is_admin() internally and would reject an anon caller either way (auth.uid()
-- is null for anon, so the membership check fails closed), so this was not
-- independently exploitable -- but grant hygiene should match the rest of
-- the project, not rely solely on the internal check.

revoke execute on function is_admin(uuid) from anon;
revoke execute on function publish_firmware_release(bigint) from anon;
