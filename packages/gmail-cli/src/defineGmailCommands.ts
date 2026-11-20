import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { defineGoogleAccountsCommand } from '@nzyme/google-auth/defineGoogleAccountsCommand.js';
import { defineGoogleAuthCommand } from '@nzyme/google-auth/defineGoogleAuthCommand.js';
import { isAbsoluteOrHomePath } from '@nzyme/node-utils/isAbsoluteOrHomePath.js';

import { defineGmailAttachmentSaveCommand } from './defineGmailAttachmentSaveCommand.js';
import { defineGmailDraftCreateCommand } from './defineGmailDraftCreateCommand.js';
import { defineGmailDraftDiscardCommand } from './defineGmailDraftDiscardCommand.js';
import { defineGmailDraftGetCommand } from './defineGmailDraftGetCommand.js';
import { defineGmailDraftListCommand } from './defineGmailDraftListCommand.js';
import { defineGmailDraftUpdateCommand } from './defineGmailDraftUpdateCommand.js';
import { defineGmailLabelsCleanupCommand } from './defineGmailLabelsCleanupCommand.js';
import { defineGmailLabelsCreateCommand } from './defineGmailLabelsCreateCommand.js';
import { defineGmailLabelsListCommand } from './defineGmailLabelsListCommand.js';
import { defineGmailMessageCommand } from './defineGmailMessageCommand.js';
import { defineGmailSearchCommand } from './defineGmailSearchCommand.js';
import { defineGmailThreadCommand } from './defineGmailThreadCommand.js';
import { defineGmailThreadLabelCommand } from './defineGmailThreadLabelCommand.js';
import type { GmailCommandParams, GmailCommandsOptions } from './GmailCommandsOptions.js';
import { gmailService } from './gmailService.js';
import { validateLabelRules } from './labelRules.js';

/**
 * Defines the Gmail commands: sign-in and accounts, search, reading threads and messages, thread labels
 * under the label rules, labels, saving attachments, and Markdown drafts. None can send mail or delete a
 * message; a discarded draft goes to the Trash, and only labels no message carries are deleted.
 * Export them from a plugin module or spread them into a product CLI's `execute({ commands })`. Throws
 * when the label rules or the file options are malformed.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailCommands(options: GmailCommandsOptions): CommandClass[] {
    const { prefix = 'gmail', auth, labels, files, reply } = options;

    const problems = labels ? validateLabelRules(labels) : [];
    const dirs = [...(files?.roots ?? []), ...(files?.attachmentsDir ? [files.attachmentsDir] : [])];
    for (const dir of dirs) {
        if (!isAbsoluteOrHomePath(dir)) {
            problems.push(`files: '${dir}' must be absolute or start with ~`);
        }
    }

    if (problems.length > 0) {
        throw new Error(`Invalid Gmail command options:\n- ${problems.join('\n- ')}`);
    }

    const params: GmailCommandParams = { prefix, service: gmailService, options: auth, labels, files, reply };
    return [
        defineGoogleAuthCommand(params),
        defineGoogleAccountsCommand(params),
        defineGmailSearchCommand(params),
        defineGmailThreadCommand(params),
        defineGmailMessageCommand(params),
        defineGmailThreadLabelCommand(params),
        defineGmailLabelsListCommand(params),
        defineGmailLabelsCreateCommand(params),
        defineGmailLabelsCleanupCommand(params),
        defineGmailAttachmentSaveCommand(params),
        defineGmailDraftCreateCommand(params),
        defineGmailDraftUpdateCommand(params),
        defineGmailDraftListCommand(params),
        defineGmailDraftGetCommand(params),
        defineGmailDraftDiscardCommand(params),
    ];
}
