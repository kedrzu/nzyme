import { parse } from '@vue/compiler-sfc';
import type { SFCBlock, SFCStyleBlock } from '@vue/compiler-sfc';

import type { FileFingerprintResult } from './FileFingerprint.js';
import { fingerprintScript } from './fingerprintScript.js';
import type { ScriptLoader } from './fingerprintScript.js';
import { normalizeWhitespace } from './normalizeWhitespace.js';
import { getMd5Hash } from '@nzyme/crypto';
import { extractEsmSpecifiers } from '@nzyme/project-utils/importGraph/extractImportSpecifiers.js';

/**
 * Fingerprints a Vue SFC by what runs when the component is used (`body`) and what runs when its
 * module loads (`top`):
 * - `<template>`, `<script setup>`, scoped or CSS-module `<style>` and custom blocks are `body`;
 * - the import declarations of `<script setup>` are hoisted to the module, so its static, non-type
 *   import specifiers are also `top`;
 * - a global `<style>` (neither `scoped` nor `module`) is injected when the module loads, so it is `top`;
 * - a plain `<script>` is fingerprinted like a script module: its function bodies join `body`, its
 *   rest joins `top`, and its `loadImports` are the SFC's (`<script setup>` runs per instance, not on
 *   load).
 *
 * Blocks other than the plain `<script>` are hashed by their text with whitespace normalised, so a
 * comment-only change in them changes the hash. Block attributes (`lang`, `scoped`, `src`, …) are
 * part of the hash.
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintVue(path: string, content: string): FileFingerprintResult {
    const { descriptor, errors } = parse(content, { filename: path });
    if (errors.length > 0) {
        return 'whole';
    }

    const bodyParts: string[] = [];
    const topParts: string[] = [];
    let loadImports: string[] = [];
    for (const block of [descriptor.template, descriptor.scriptSetup, ...descriptor.customBlocks]) {
        if (block) {
            bodyParts.push(serializeBlock(block));
        }
    }
    for (const block of descriptor.styles) {
        (isGlobalStyle(block) ? topParts : bodyParts).push(serializeBlock(block));
    }

    if (descriptor.scriptSetup) {
        const imports = extractEsmSpecifiers(descriptor.scriptSetup.content)
            .filter(specifier => !specifier.typeOnly && !specifier.dynamic)
            .map(specifier => specifier.specifier);
        topParts.push(JSON.stringify(imports));
    }

    if (descriptor.script) {
        const loader = getScriptLoader(descriptor.script.lang);
        if (!loader) {
            return 'whole';
        }

        const script = fingerprintScript(descriptor.script.content, loader);
        if (script === 'whole') {
            return 'whole';
        }

        bodyParts.push(JSON.stringify([descriptor.script.type, descriptor.script.attrs, script.body]));
        topParts.push(script.top);
        loadImports = script.loadImports;
    }

    return {
        body: getMd5Hash(bodyParts.join('\0')),
        top: getMd5Hash(topParts.join('\0')),
        loadImports,
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

function isGlobalStyle(block: SFCStyleBlock) {
    return !block.scoped && !block.module;
}

function serializeBlock(block: SFCBlock) {
    return JSON.stringify([block.type, block.attrs, normalizeWhitespace(block.content)]);
}
