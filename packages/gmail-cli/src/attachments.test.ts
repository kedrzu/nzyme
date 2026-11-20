import { expect, test } from 'bun:test';
import { assert } from '@nzyme/utils/assert.js';

import { findAttachment, savedFileName } from './attachments.js';
import type { MessageAttachment } from './attachments.js';

const msg = [
    att('2', 'Screenshot_1.jpg', 131117),
    att('3', 'Screenshot_4.jpg', 141035),
    att('4', 'image.png', 500),
    att('5', 'image.png', 500),
];

test('findAttachment: finds a part by its stable part id', () => {
    expect(findAttachment(msg, '3')?.filename).toBe('Screenshot_4.jpg');
});

test('findAttachment: finds nothing for an unknown id', () => {
    expect(findAttachment(msg, 'ANGjdJ-stale')).toBeUndefined();
});

test('savedFileName: keeps the original name when it is unique in the message', () => {
    expect(savedFileName(attachmentAt(0), msg)).toBe('Screenshot_1.jpg');
});

test('savedFileName: disambiguates parts sharing a name, so neither overwrites the other', () => {
    expect(savedFileName(attachmentAt(2), msg)).toBe('image-part4.png');
    expect(savedFileName(attachmentAt(3), msg)).toBe('image-part5.png');
});

test('savedFileName: makes the name safe on disk', () => {
    expect(savedFileName(att('2', '2025-FP/I/27707.pdf', 1), [])).toBe('2025-FP_I_27707.pdf');
    expect(savedFileName(att('2', '../../.bashrc', 1), [])).toBe('__.._.bashrc');
    expect(savedFileName(att('2', '', 1), [])).toBe('attachment');
});

function attachmentAt(index: number): MessageAttachment {
    const attachment = msg[index];
    assert(attachment);
    return attachment;
}

function att(partId: string, filename: string, size: number): MessageAttachment {
    return {
        partId,
        gmailId: `ANGjdJ-${partId}-fresh`,
        filename,
        mimeType: 'image/jpeg',
        size,
    };
}
