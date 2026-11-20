import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { parseDocument, stringify, Document } from 'yaml';

/** A local document file as the sync sees it. */
export interface DocFile {
    /** The Outline document id; absent for a file not pushed yet. */
    id?: string;
    title: string;
    /** The Markdown body exactly as sent to Outline: no title, no frontmatter. */
    text: string;
    /** Frontmatter keys other than `outline`, carried through untouched (a `shared:` key from older versions too). */
    extra: Record<string, unknown>;
}

export interface DocIssue {
    /**
     * `invalid-frontmatter`: the frontmatter could not be read, so it holds neither the id nor the other keys.
     * `missing-title`: the title was derived from the file name.
     */
    kind: 'invalid-frontmatter' | 'missing-title';
    message: string;
}

export interface ParsedDocFile {
    doc: DocFile;
    issues: DocIssue[];
}

interface Frontmatter {
    id?: string;
    extra: Record<string, unknown>;
}

interface SplitFile {
    /** The YAML between the `---` lines; absent when the file has none. */
    yaml?: string;
    body: string;
    issues: DocIssue[];
}

/**
 * Reads a local document file. Never throws on bad content: problems come back as `issues`, and the
 * body is returned intact either way. `fileName` names the document when there is no `# ` line.
 * @__NO_SIDE_EFFECTS__
 */
export function parseDocFile(content: string, fileName: string): ParsedDocFile {
    const split = splitFrontmatter(content);
    const issues = [...split.issues];
    const frontmatter = split.yaml == null ? emptyFrontmatter() : parseFrontmatter(split.yaml, issues);
    const { title, text } = splitTitle(split.body, fileName, issues);
    return {
        doc: { id: frontmatter.id, title, text, extra: frontmatter.extra },
        issues,
    };
}

/**
 * Writes a local document file. Deterministic, so a file written by the sync and read back
 * serialises to the same bytes. No frontmatter block is written when there is nothing to put in it.
 * A newline in the title becomes a space, as Outline titles are one line.
 * @__NO_SIDE_EFFECTS__
 */
export function serializeDocFile(doc: DocFile): string {
    const title = `# ${doc.title.replace(/\s*[\r\n]+\s*/g, ' ')}\n`;
    const body = doc.text === '' ? title : `${title}\n${doc.text}`;
    return `${serializeFrontmatter(doc)}${body}`;
}

function emptyFrontmatter(): Frontmatter {
    return { extra: {} };
}

function splitFrontmatter(content: string): SplitFile {
    const lines = content.split('\n');
    if (lines[0]?.trimEnd() !== '---') {
        return { body: content, issues: [] };
    }
    const closing = lines.findIndex((line, index) => index > 0 && line.trimEnd() === '---');
    if (closing === -1) {
        return {
            body: content,
            issues: [
                {
                    kind: 'invalid-frontmatter',
                    message: 'The frontmatter block opened with --- is never closed.',
                },
            ],
        };
    }
    return {
        yaml: lines.slice(1, closing).join('\n'),
        body: lines.slice(closing + 1).join('\n'),
        issues: [],
    };
}

function parseFrontmatter(source: string, issues: DocIssue[]): Frontmatter {
    const invalid = (message: string): Frontmatter => {
        issues.push({ kind: 'invalid-frontmatter', message });
        return emptyFrontmatter();
    };

    const document = parseDocument(source);
    const [error] = document.errors;
    if (error) {
        return invalid(`The frontmatter is not valid YAML: ${error.message}`);
    }
    if (document.contents == null) {
        return emptyFrontmatter();
    }

    const data: unknown = document.toJS();
    if (!isPlainObject(data)) {
        return invalid('The frontmatter must be a list of `key: value` lines.');
    }
    const { outline, ...extra } = data;
    if (outline != null && typeof outline !== 'string') {
        return invalid('`outline` must be a document id.');
    }
    return { id: outline ?? undefined, extra };
}

function splitTitle(body: string, fileName: string, issues: DocIssue[]): { title: string; text: string } {
    const withoutLeadingBlanks = body.replace(/^(?:[ \t]*\r?\n)+/, '');
    const lineEnd = withoutLeadingBlanks.indexOf('\n');
    const firstLine = lineEnd === -1 ? withoutLeadingBlanks : withoutLeadingBlanks.slice(0, lineEnd);
    if (!firstLine.startsWith('# ')) {
        issues.push({
            kind: 'missing-title',
            message: 'The file does not start with a `# Title` line; the title comes from the file name.',
        });
        return { title: titleFromFileName(fileName), text: body };
    }
    const rest = lineEnd === -1 ? '' : withoutLeadingBlanks.slice(lineEnd + 1);
    // One blank line separates the title from the text; serializeDocFile writes exactly that one.
    return { title: firstLine.slice(2).replace(/\r$/, ''), text: rest.replace(/^\r?\n/, '') };
}

function titleFromFileName(fileName: string): string {
    return fileName.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim();
}

function serializeFrontmatter(doc: DocFile): string {
    const ordered: Record<string, unknown> = {};
    if (doc.id != null) {
        ordered['outline'] = doc.id;
    }
    Object.assign(ordered, doc.extra);
    if (Object.keys(ordered).length === 0) {
        return '';
    }

    const yaml = stringify(new Document(ordered), { lineWidth: 0, flowCollectionPadding: false });
    return `---\n${yaml}---\n`;
}
