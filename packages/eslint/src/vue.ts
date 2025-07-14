import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';

export function vue() {
    return defineConfig({
        files: ['**/*.vue', '**/*.ts', '**/*.tsx'],
        extends: [pluginVue.configs['flat/recommended']],
        rules: {
            'vue/multi-word-component-names': 'off',
            // Not needed in vue 3
            'vue/require-v-for-key': 'off',
            'vue/html-self-closing': 'off',
            'vue/require-default-prop': 'off',
            'vue/one-component-per-file': 'off',
            'vue/singleline-html-element-content-newline': 'off',
        },
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
            },
        },
    });
}
