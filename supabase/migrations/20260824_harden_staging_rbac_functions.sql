-- Moves policy helper functions out of the REST-exposed public schema.
create schema if not exists private;
revoke all on schema private from public;

alter function public.is_platform_owner() set schema private;
alter function public.has_branch_access(uuid) set schema private;
alter function public.can_manage_branch(uuid) set schema private;

revoke all on function private.is_platform_owner() from public, anon, authenticated;
revoke all on function private.has_branch_access(uuid) from public, anon, authenticated;
revoke all on function private.can_manage_branch(uuid) from public, anon, authenticated;

drop policy if exists branches_select_scoped on public.branches;
drop policy if exists branches_owner_write on public.branches;
drop policy if exists roles_select_self_or_owner on public.app_user_roles;
drop policy if exists roles_owner_write on public.app_user_roles;
drop policy if exists employee_profiles_select_scoped on public.employee_profiles;
drop policy if exists employee_profiles_manage_scoped on public.employee_profiles;
drop policy if exists attendance_events_select_scoped on public.attendance_events;
drop policy if exists attendance_events_write_scoped on public.attendance_events;

create policy branches_select_scoped on public.branches for select using (private.has_branch_access(id));
create policy branches_owner_write on public.branches for all using (private.is_platform_owner()) with check (private.is_platform_owner());
create policy roles_select_self_or_owner on public.app_user_roles for select using (user_id = auth.uid() or private.is_platform_owner());
create policy roles_owner_write on public.app_user_roles for all using (private.is_platform_owner()) with check (private.is_platform_owner());
create policy employee_profiles_select_scoped on public.employee_profiles for select using (auth_user_id = auth.uid() or private.has_branch_access(branch_id));
create policy employee_profiles_manage_scoped on public.employee_profiles for all using (private.can_manage_branch(branch_id)) with check (private.can_manage_branch(branch_id));
create policy attendance_events_select_scoped on public.attendance_events for select using (
  exists (select 1 from public.employee_profiles profile where profile.id = employee_id and (profile.auth_user_id = auth.uid() or private.has_branch_access(profile.branch_id)))
);
create policy attendance_events_write_scoped on public.attendance_events for all using (
  exists (select 1 from public.employee_profiles profile where profile.id = employee_id and (profile.auth_user_id = auth.uid() or private.can_manage_branch(profile.branch_id)))
) with check (
  exists (select 1 from public.employee_profiles profile where profile.id = employee_id and (profile.auth_user_id = auth.uid() or private.can_manage_branch(profile.branch_id)))
);
