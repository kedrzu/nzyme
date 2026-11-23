import { parse as parseSfc } from '@vue/compiler-sfc';
import { parseSync } from 'oxc-parser';

/** The import forms of a module whose effect a trace cannot attribute to one test. */
export interface ModuleEffects {
    /** Specifiers of `import 'x'` — a module loaded only for what it does when it loads. */
    sideEffectImports: string[];
    /** Whether the module has an `import(…)` whose specifier is computed, not a literal. */
    computedDynamicImport: boolean;
}

/**
 * Finds side-effect imports and computed dynamic imports in a script (`.ts .tsx .mts .js .mjs`) or in
 * the `<script>` blocks of a Vue SFC. Any other file, or one that does not parse, has neither.
 * @__NO_SIDE_EFFECTS__
 */
export function scanModuleEffects(file: string, content: string): ModuleEffects {
    const result: ModuleEffects = { sideEffectImports: [], computedDynamicImport: false };
    for (const script of listScripts(file, content)) {
        const { module, errors } = parseSync(script.name, script.code, { sourceType: 'module' });
        if (errors.length > 0) {
            continue;
        }

        for (const entry of module.staticImports) {
            if (entry.entries.length === 0) {
                result.sideEffectImports.push(entry.moduleRequest.value);
            }
        }
        for (const entry of module.dynamicImports) {
            const specifier = script.code.slice(entry.moduleRequest.start, entry.moduleRequest.end);
            if (!/^(['"`])[^'"`$]*\1$/.test(specifier)) {
                result.computedDynamicImport = true;
            }
        }
    }
    return result;
}

/** Code to scan, with a file name whose extension tells the parser the dialect. */
interface ScriptSource {
    name: string;
    code: string;
}

function listScripts(file: string, content: string): ScriptSource[] {
    const extension = /\.[^./]+$/.exec(file)?.[0];
    switch (extension) {
        case '.ts':
        case '.mts':
        case '.tsx':
        case '.js':
        case '.mjs':
            return [{ name: file, code: content }];
        case '.vue': {
            const { descriptor, errors } = parseSfc(content, { filename: file });
            if (errors.length > 0) {
                return [];
            }
            return [descriptor.script, descriptor.scriptSetup].flatMap(block =>
                block ? [{ name: `${file}.${block.lang ?? 'js'}`, code: block.content }] : [],
            );
        }
        default:
            return [];
    }
}
