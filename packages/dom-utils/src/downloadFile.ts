export interface DownloadFileOptions {
    /**
     * The content to download.
     */
    content: BlobPart;
    /**
     * The filename for the downloaded file.
     */
    filename: string;
    /**
     * The MIME type of the file.
     * @default 'application/octet-stream'
     */
    type?: string;
}

/**
 * Triggers a file download in the browser.
 *
 * @param options - The download options
 */
export function downloadFile(options: DownloadFileOptions): void {
    const { content, filename, type = 'application/octet-stream' } = options;

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}
