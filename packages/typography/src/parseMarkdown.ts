import { remark } from 'remark';

import { remarkSanitize } from './remarkSanitize.js';

const parser = remark().use(remarkSanitize);

/**
 * Parses markdown string into an AST and runs all transformers.
 */
export function parseMarkdown(markdown: string) {
    const ast = parser.parse(markdown);
    return parser.runSync(ast);
}
