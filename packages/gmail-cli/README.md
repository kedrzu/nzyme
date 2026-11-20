# @nzyme/gmail-cli

Gmail commands for agents: search and read threads as Markdown, Markdown drafts with attachments, and
label rules. `defineGmailCommands({ auth, labels, files, reply })` defines the commands (`auth`, `accounts`,
`search`, `thread`, `message`, `thread label`, `labels list`, `labels create`, `labels cleanup`,
`attachment save`, `draft create`, `draft update`, `draft list`, `draft get`, `draft discard`). No command
sends mail or deletes a message: a discarded draft moves to the Trash, and `labels cleanup` deletes only
labels no message carries.
