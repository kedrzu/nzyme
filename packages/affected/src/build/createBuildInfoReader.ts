import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createXXHash128 } from 'hash-wasm';

/** The source versions TypeScript build infos record, to tell whether a build is current by content. */
export interface BuildInfoReader {
    /**
     * The versions the build infos (`*.tsbuildinfo`) directly in `dir` record for the absolute path
     * `file`; empty when none lists it. A version is what {@link BuildInfoReader.hashText} returns for
     * the text the build saw.
     */
    readVersions(dir: string, file: string): string[];
    /** The version `tsgo` records for a file with this text: the XXH3-128 of the text, in hex. */
    hashText(text: string): string;
}

/**
 * Creates a {@link BuildInfoReader}. Directory listings and build infos are read once per reader, so
 * create one per run: a build during its life is not seen.
 */
export async function createBuildInfoReader(): Promise<BuildInfoReader> {
    const hasher = await createXXHash128();
    const buildInfosInDir = new Map<string, string[]>();
    const buildInfos = new Map<string, BuildInfoVersions>();

    return { readVersions, hashText };

    function readVersions(dir: string, file: string): string[] {
        const versions: string[] = [];
        for (const buildInfo of listBuildInfos(dir)) {
            const version = readBuildInfo(buildInfo).get(file);
            if (version !== undefined) {
                versions.push(version);
            }
        }
        return versions;
    }

    function hashText(text: string): string {
        hasher.init();
        hasher.update(text);
        return hasher.digest('hex');
    }

    function listBuildInfos(dir: string): string[] {
        let files = buildInfosInDir.get(dir);
        if (!files) {
            try {
                files = readdirSync(dir)
                    .filter(name => name.endsWith('.tsbuildinfo'))
                    .map(name => path.join(dir, name));
            } catch {
                files = [];
            }
            buildInfosInDir.set(dir, files);
        }
        return files;
    }

    function readBuildInfo(file: string): BuildInfoVersions {
        let versions = buildInfos.get(file);
        if (!versions) {
            versions = parseBuildInfo(file);
            buildInfos.set(file, versions);
        }
        return versions;
    }
}

/** Source versions of a build info, by absolute path; also by lower-cased path, as tsgo writes on a case-insensitive file system. */
interface BuildInfoVersions {
    get(file: string): string | undefined;
}

function parseBuildInfo(file: string): BuildInfoVersions {
    const exact = new Map<string, string>();
    const folded = new Map<string, string>();
    try {
        const info: unknown = JSON.parse(readFileSync(file, 'utf8'));
        const fileNames = getArray(info, 'fileNames');
        const fileInfos = getArray(info, 'fileInfos');
        for (const [index, name] of fileNames.entries()) {
            const version = getVersion(fileInfos[index]);
            if (typeof name === 'string' && version !== undefined) {
                const absolute = path.resolve(path.dirname(file), name);
                exact.set(absolute, version);
                folded.set(absolute.toLowerCase(), version);
            }
        }
    } catch {
        // An unreadable build info lists nothing.
    }
    return { get: input => exact.get(input) ?? folded.get(input.toLowerCase()) };
}

function getArray(value: unknown, key: string): unknown[] {
    if (typeof value === 'object' && value !== null && key in value) {
        const field: unknown = Reflect.get(value, key);
        return Array.isArray(field) ? field : [];
    }
    return [];
}

/** A `fileInfos` entry: the version string, or an object holding it. */
function getVersion(fileInfo: unknown): string | undefined {
    if (typeof fileInfo === 'string') {
        return fileInfo;
    }
    if (typeof fileInfo === 'object' && fileInfo !== null && 'version' in fileInfo) {
        const version: unknown = fileInfo.version;
        return typeof version === 'string' ? version : undefined;
    }
    return undefined;
}
