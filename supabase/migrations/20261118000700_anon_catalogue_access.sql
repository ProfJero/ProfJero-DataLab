-- Public catalogue policies (plans, templates, platform settings) evaluate
-- private.is_platform_admin(); anonymous visitors need EXECUTE on it (it returns false for them).
grant execute on function private.is_platform_admin() to anon;
