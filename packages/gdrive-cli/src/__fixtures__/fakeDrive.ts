/**
 * A recording fake of the Google Drive API, behind google-auth's fake Google (its token endpoint and
 * access token check), for running the Drive commands in-process.
 */
import type { drive_v3 } from '@googleapis/drive';

import { startFakeGoogle } from '@nzyme/google-auth/__fixtures__/googleTestCli.js';

import { driveService } from '../driveService.js';

/** A file the fake holds. */
export interface FakeDriveFile {
    id: string;
    name: string;
    mimeType: string;
    parents?: string[];
    /** The bytes `alt=media` returns. */
    content?: string;
    /** What an export returns, by the requested MIME type. */
    exports?: Record<string, string>;
    trashed?: boolean;
    starred?: boolean;
    description?: string;
    modifiedTime?: string;
    shortcutDetails?: drive_v3.Schema$File['shortcutDetails'];
}

/** Options of {@link startFakeDrive}. */
export interface FakeDriveOptions {
    /** The account's address, in `about`. */
    email: string;
    files?: FakeDriveFile[];
    drives?: drive_v3.Schema$Drive[];
    /** The `nextPageToken` every file listing answers with. */
    nextPageToken?: string;
}

/**
 * A request the fake received, its path relative to `/drive/v3`. A media upload keeps its `/upload`
 * prefix: `/upload/drive/v3/files` is recorded as `/upload/files`.
 */
export interface FakeDriveRequest {
    method: string;
    path: string;
    query: URLSearchParams;
    /** The JSON body of a metadata write. */
    body?: unknown;
    /** The parts of a media upload. */
    upload?: FakeDriveUpload;
}

/** A media upload: its JSON metadata (a multipart upload only), the media type and the contents. */
export interface FakeDriveUpload {
    metadata?: drive_v3.Schema$File;
    mimeType: string;
    content: string;
}

const API_PREFIX = '/drive/v3';
const UPLOAD_PREFIX = `/upload${API_PREFIX}`;
const MODIFIED_TIME = '2026-11-20T10:00:00.000Z';

/**
 * Starts the fake. `requests` records every Drive API call, `grants` every token request, and
 * `violations` every call no Drive command may make: any `DELETE` (permanent deletion, emptying the
 * trash), any request to `/permissions` (sharing) and `emptyTrash`.
 */
export function startFakeDrive(options: FakeDriveOptions) {
    const requests: FakeDriveRequest[] = [];
    const violations: string[] = [];
    const files = (options.files ?? []).map(file => ({ ...file }));
    let created = 0;
    let version = 1;
    const google = startFakeGoogle({ email: options.email, scopes: driveService.scopes, api: answer });

    return { endpoints: google.endpoints, grants: google.grants, requests, violations, files, stop: google.stop };

    async function answer(request: Request) {
        const url = new URL(request.url);
        const isUpload = url.pathname.startsWith(UPLOAD_PREFIX);
        if (!isUpload && !url.pathname.startsWith(API_PREFIX)) {
            return notFound();
        }

        const path = isUpload
            ? `/upload${url.pathname.slice(UPLOAD_PREFIX.length)}`
            : url.pathname.slice(API_PREFIX.length);
        const upload = isUpload ? await readUpload(request) : undefined;
        const body = isUpload ? undefined : await readJson(request);
        requests.push({ method: request.method, path, query: url.searchParams, body, upload });

        if (request.method === 'DELETE' || path.includes('/permissions') || path.includes('emptyTrash')) {
            const violation = `${request.method} ${path}`;
            violations.push(violation);
            return Response.json({ error: { code: 403, message: violation } }, { status: 403 });
        }

        const [resource, id, action] = url.pathname.slice(isUpload ? UPLOAD_PREFIX.length : API_PREFIX.length).split('/').filter(Boolean);
        if (upload) {
            return answerUpload(request.method, id, upload);
        }

        switch (`${request.method} ${resource}`) {
            case 'GET about':
                return Response.json({ user: { emailAddress: options.email } });
            case 'GET drives':
                return answerDrives(id);
            case 'GET files':
                return id ? answerFile(id, action, url.searchParams) : answerList(url.searchParams.get('q') ?? '');
            case 'POST files':
                return Response.json(createFile(body));
            case 'PATCH files':
                return id ? updateFile(id, body, url.searchParams) : notFound();
            default:
                return notFound();
        }
    }

    function answerList(q: string) {
        const parent = /'([^']+)' in parents/.exec(q)?.[1];
        const name = /name = '([^']+)'/.exec(q)?.[1];
        const listed = files.filter(
            file =>
                (parent === undefined || file.parents?.includes(parent)) &&
                (name === undefined || file.name === name) &&
                (!q.includes('trashed = false') || !file.trashed),
        );
        return Response.json({ files: listed.map(toDriveFile), nextPageToken: options.nextPageToken });
    }

    function answerFile(id: string, action: string | undefined, query: URLSearchParams) {
        const file = findFile(id);
        if (!file) {
            return notFound();
        }

        if (action === 'export') {
            const exported = file.exports?.[query.get('mimeType') ?? ''];
            return exported === undefined
                ? Response.json({ error: { code: 400, message: 'Export format not supported' } }, { status: 400 })
                : new Response(exported);
        }

        if (query.get('alt') === 'media') {
            return new Response(file.content ?? '');
        }

        return Response.json(toDriveFile(file));
    }

    function answerDrives(id: string | undefined) {
        const drives = options.drives ?? [];
        if (!id) {
            return Response.json({ drives });
        }

        const shared = drives.find(entry => entry.id === id);
        return shared ? Response.json(shared) : notFound();
    }

    function answerUpload(method: string, id: string | undefined, upload: FakeDriveUpload) {
        if (method === 'POST') {
            return Response.json(createFile(upload.metadata, upload));
        }

        const file = id ? findFile(id) : undefined;
        if (method !== 'PATCH' || !file) {
            return notFound();
        }

        file.content = upload.content;
        version++;
        return Response.json({ ...toDriveFile(file), version: String(version) });
    }

    function createFile(body: unknown, upload?: FakeDriveUpload) {
        created++;
        const metadata = isRecord(body) ? body : {};
        const file: FakeDriveFile = {
            id: `new-${created}`,
            name: typeof metadata.name === 'string' ? metadata.name : 'Untitled',
            mimeType: typeof metadata.mimeType === 'string' ? metadata.mimeType : (upload?.mimeType ?? 'application/octet-stream'),
            parents: Array.isArray(metadata.parents) ? metadata.parents.map(String) : ['root'],
            content: upload?.content,
        };
        files.push(file);
        return toDriveFile(file);
    }

    function updateFile(id: string, body: unknown, query: URLSearchParams) {
        const file = findFile(id);
        if (!file) {
            return notFound();
        }

        const changes = isRecord(body) ? body : {};
        if (typeof changes.name === 'string') {
            file.name = changes.name;
        }

        if (typeof changes.description === 'string') {
            file.description = changes.description;
        }

        if (typeof changes.starred === 'boolean') {
            file.starred = changes.starred;
        }

        if (typeof changes.trashed === 'boolean') {
            file.trashed = changes.trashed;
        }

        const removed = query.get('removeParents')?.split(',') ?? [];
        const added = query.get('addParents')?.split(',') ?? [];
        file.parents = [...(file.parents ?? []).filter(parent => !removed.includes(parent)), ...added];
        return Response.json(toDriveFile(file));
    }

    function findFile(id: string) {
        return files.find(file => file.id === id);
    }
}

function toDriveFile(file: FakeDriveFile): drive_v3.Schema$File {
    const { content, exports: _exports, ...metadata } = file;
    return {
        modifiedTime: MODIFIED_TIME,
        ...metadata,
        size: content === undefined ? undefined : String(Buffer.byteLength(content)),
        webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
    };
}

async function readJson(request: Request): Promise<unknown> {
    const text = await request.text();
    return text ? JSON.parse(text) : undefined;
}

/** A multipart upload (the JSON metadata part, then the media part) or a plain media upload. */
async function readUpload(request: Request): Promise<FakeDriveUpload> {
    const contentType = request.headers.get('content-type') ?? '';
    const text = await request.text();
    const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
    if (!boundary) {
        return { mimeType: contentType, content: text };
    }

    const parts = text
        .split(`--${boundary}`)
        .slice(1, -1)
        .map(part => {
            const split = part.indexOf('\r\n\r\n');
            return {
                type: /content-type: ([^\r\n]+)/i.exec(part.slice(0, split))?.[1] ?? '',
                content: part.slice(split + 4).replace(/\r\n$/, ''),
            };
        });
    const [metadata, media] = parts;
    return {
        metadata: metadata ? JSON.parse(metadata.content) : undefined,
        mimeType: media?.type ?? '',
        content: media?.content ?? '',
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function notFound() {
    return Response.json({ error: { code: 404, message: 'File not found.' } }, { status: 404 });
}
