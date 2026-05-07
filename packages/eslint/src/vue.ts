import tsParser from '@typescript-eslint/parser';
import pluginVue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import vueParser from 'vue-eslint-parser';

/** Creates an ESLint config for Vue 3 single-file components with TypeScript parser. */
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
            // These are not working with more advanced vue 3 features like exposed refs
            'vue/no-mutating-props': 'off',
            // Formatting rules handled by oxfmt.
            'vue/html-indent': 'off',
            'vue/html-closing-bracket-newline': 'off',
            'vue/html-closing-bracket-spacing': 'off',
            'vue/html-end-tags': 'off',
            'vue/html-quotes': 'off',
            'vue/max-attributes-per-line': 'off',
            'vue/multiline-html-element-content-newline': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/mustache-interpolation-spacing': 'off',
            'vue/first-attribute-linebreak': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
        },
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
            },
        },
    });
}
