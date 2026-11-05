import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Writes the `Pulumi.yaml` of a workspace by replacing it atomically.
 *
 * Stacks deploying in parallel share one workDir, so while one stack writes this file, the Pulumi CLI of
 * another may be reading it. Pulumi's own `saveProjectSettings` truncates the file before writing it, and
 * under Node a CLI reading in that window finds it empty and fails with `expected project to be an object,
 * was '<nil>'`. A rename means a reader only ever gets the complete old file or the complete new one.
 */
export async function writeProjectSettings(workDir: string, projectName: string) {
    const filePath = path.join(workDir, 'Pulumi.yaml');
    const tempPath = `${filePath}.${randomUUID()}.tmp`;

    // JSON is valid YAML, so nothing needs to be dumped for this flat object.
    await fs.writeFile(tempPath, JSON.stringify({ name: projectName, runtime: 'nodejs' }));
    await fs.rename(tempPath, filePath);
}
