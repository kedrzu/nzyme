import type { BlockContent } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 *
 */
export function streamMarkdown(ast: BlockContent[] = []) {
    const parser = unified().use(remarkParse);

    let buffer = '';
    let index = 0;

    return {
        write,
        replace,
        ast,
    };

    function write(chunk: string) {
        buffer += chunk;

        const root = parser.parse(buffer);

        ast.length = index;
        ast.push(...(root.children as BlockContent[]));

        if (ast.length <= 1) {
            return;
        }

        const prelast = ast[ast.length - 2]!;
        const end = prelast.position?.end.offset;

        if (end == null) {
            return;
        }

        buffer = buffer.slice(end);
        index = ast.length - 1;
    }

    function replace(chunk: string) {
        buffer = '';
        index = 0;
        write(chunk);
    }
}
