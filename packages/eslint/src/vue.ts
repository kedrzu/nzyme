import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export function vue() {
    return tseslint.config({
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        extends: [pluginVue.configs['flat/recommended']],
        rules: {
            'vue/multi-word-component-names': 'off',
            // Not needed in vue 3
            'vue/require-v-for-key': 'off',
            'vue/require-default-prop': 'off',
            'vue/one-component-per-file': 'off',
            // allow importing h from vue for jsx
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '(^_)|(^h$)',
                },
            ],
        },
    });
}
