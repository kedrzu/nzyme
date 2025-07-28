import { ZchemaCommand } from './ZchemaCommand.js';

/**
 * Command to watch for changes and automatically regenerate schemas
 */
export class WatchCommand extends ZchemaCommand {
    static override paths = [['watch']];

    static override usage = ZchemaCommand.Usage({
        category: 'Schema',
        description: 'Watch for changes and regenerate schemas automatically',
    });

    // Override watch to always be true
    override watch = true;

    /**
     * Execute the watch command
     */
    override async run() {
        this.logger.info('🚀 Starting zchema in watch mode...');
        return await super.run();
    }
}
