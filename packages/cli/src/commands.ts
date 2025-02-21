import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { RenameCjsCommand } from './commands/RenameCjsCommand.js';

export default {
    monorepo: MonorepoCommand,
    'rename-cjs': RenameCjsCommand,
};
