import type { ExtractPropTypes } from 'vue';

import { useInstance } from './useInstance.js';

export function useProps<P extends object = Record<string, unknown>>(): P;
export function useProps<P>(propsDef: P): ExtractPropTypes<P>;
export function useProps() {
    return useInstance().props;
}
