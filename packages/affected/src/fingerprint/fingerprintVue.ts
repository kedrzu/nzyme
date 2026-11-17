import { parse } from '@vue/compiler-sfc';
import type { SFCBlock } from '@vue/compiler-sfc';
import { parseSync } from 'oxc-parser';

import type { FileFingerprintResult } from './FileFingerprint.js';
import { fingerprintScript } from './fingerprintScript.js';
import type { ScriptLoader } from './fingerprintScript.js';
import { getMd5Hash } from '@nzyme/crypto';

/**
 * Fingerprints a Vue SFC. `<template>`, `<script setup>`, `<style>` and custom blocks run when the
 * component is used, so all of them go to `body`. A plain `<script>` runs when the module loads and
 * is fingerprinted like a script module: its function bodies join `body`, its rest is `top`.
 *
 * `<script setup>` keeps its types: `defineProps<T>()` and `defineEmits<T>()` compile them into
 * runtime declarations. Only its comments and formatting are ignored; the other blocks ignore
 * formatting only. Block attributes (`lang`, `scoped`, `src`, …) are part of the hash.
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintVue(path: string, content: string): FileFingerprintResult {
    const { descriptor, errors } = parse(content, { filename: path });
    if (errors.length > 0) {
        return 'whole';
    }

    const bodyParts: string[] = [];
    for (const block of [descriptor.template, ...descriptor.styles, ...descriptor.customBlocks]) {
        if (block) {
            bodyParts.push(serializeBlock(block, normalizeWhitespace(block.content)));
        }
    }

    if (descriptor.scriptSetup) {
        const setupCode = stripScriptComments(descriptor.scriptSetup);
        if (setupCode == null) {
            return 'whole';
        }
        bodyParts.push(serializeBlock(descriptor.scriptSetup, setupCode));
    }

    let top = '';
    if (descriptor.script) {
        const loader = getScriptLoader(descriptor.script.lang);
        if (!loader) {
            return 'whole';
        }

        const script = fingerprintScript(descriptor.script.content, loader);
        if (script === 'whole') {
            return 'whole';
        }

        bodyParts.push(serializeBlock(descriptor.script, script.body));
        top = script.top;
    }

    return {
        body: getMd5Hash(bodyParts.join('\0')),
        top: getMd5Hash(top),
    };
}

function getScriptLoader(lang: string | undefined): ScriptLoader | null {
    switch (lang) {
        case undefined:
        case 'js':
            return 'js';
        case 'ts':
            return 'ts';
        case 'tsx':
            return 'tsx';
        default:
            return null;
    }
}

/** The block's code with comments removed and whitespace normalised, or `null` if it does not parse. */
function stripScriptComments(block: SFCBlock) {
    const lang = block.lang === 'ts' || block.lang === 'tsx' ? block.lang : 'jsx';
    const { comments, errors } = parseSync(`setup.${lang}`, block.content, { sourceType: 'module', lang });
    if (errors.length > 0) {
        return null;
    }

    let code = '';
    let position = 0;
    for (const comment of comments) {
        code += block.content.slice(position, comment.start) + ' ';
        position = comment.end;
    }
    code += block.content.slice(position);

    return normalizeWhitespace(code);
}

function serializeBlock(block: SFCBlock, content: string) {
    return JSON.stringify([block.type, block.attrs, content]);
}

function normalizeWhitespace(text: string) {
    return text.replaceAll(/\s+/g, ' ').trim();
}
