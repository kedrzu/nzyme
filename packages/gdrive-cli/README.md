# @nzyme/gdrive-cli

Google Drive commands for agents: search, list, read Docs as Markdown and Sheets as CSV, download with
export, upload with conversion, replace contents, edit metadata, trash and restore.
`defineDriveCommands({ auth, permissions, files })` defines the commands (`auth`, `accounts`, `search`,
`ls`, `info`, `drives`, `read`, `download`, `upload`, `mkdir`, `update`, `meta`, `trash`, `restore`). The
`permissions` switches (`browse` and `download` on by default; `upload`, `edit` and `delete` off) decide
which commands are registered at all. No command deletes a file permanently, empties the trash or changes
sharing.
