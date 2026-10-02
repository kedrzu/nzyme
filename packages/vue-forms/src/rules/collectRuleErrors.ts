import { concatKeys } from '@nzyme/validation/utils/concatKeys.js';
import { mergeErrors } from '@nzyme/validation/utils/mergeErrors.js';
import { normalizeErrors } from '@nzyme/validation/utils/normalizeErrors.js';
import type { ValidationErrors } from '@nzyme/validation/Validator.js';

import type { FormModel } from '../types.js';
import { getFormNodeState } from './FormNodeState.js';

/**
 * Merges the errors of every `useRules` registration on a node and below it, keyed by dotted path
 * relative to the node. Children contribute their own `ruleErrors` under their key (an alias under
 * the node's own path); a child opaque to routing has no path here, so it is left out.
 * @internal
 * @__NO_SIDE_EFFECTS__
 */
export function collectRuleErrors(node: FormModel): ValidationErrors | null {
    const errors: ValidationErrors = {};

    for (const registration of getFormNodeState(node).registrations) {
        addErrors(errors, registration.errors.value, null);
    }

    for (const field of node.fields) {
        if (getFormNodeState(field).addressable) {
            addErrors(errors, field.ruleErrors, field.key);
        }
    }

    return normalizeErrors(errors);
}

function addErrors(target: ValidationErrors, source: ValidationErrors | null, prefix: string | number | null) {
    if (!source) {
        return;
    }

    for (const [path, messages] of Object.entries(source)) {
        if (messages) {
            // Copy, because mergeErrors keeps the array it is given and pushes into it on the next merge.
            mergeErrors(target, [...messages], prefixPath(prefix, path));
        }
    }
}

function prefixPath(prefix: string | number | null, path: string) {
    if (prefix == null) {
        return path;
    }

    return concatKeys(prefix, path);
}
