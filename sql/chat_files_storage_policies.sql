-- Configure Storage bucket and RLS policies for chat attachments.
-- Run this in Supabase SQL editor.

insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do update
set public = excluded.public;

-- Read access for uploaded chat files.
drop policy if exists "chat_files_public_read" on storage.objects;
create policy "chat_files_public_read"
on storage.objects
for select
to public
using (bucket_id = 'chat-files');

-- Allow authenticated users to upload files only into their own top-level folder:
-- e.g. <uid>/<timestamp>-filename.ext
drop policy if exists "chat_files_auth_insert_own_folder" on storage.objects;
create policy "chat_files_auth_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own files in their own folder.
drop policy if exists "chat_files_auth_update_own_folder" on storage.objects;
create policy "chat_files_auth_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete only their own files.
drop policy if exists "chat_files_auth_delete_own_folder" on storage.objects;
create policy "chat_files_auth_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
