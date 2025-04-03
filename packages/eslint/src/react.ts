import reactPlugin from 'eslint-plugin-react';

export function react() {
    return [
        reactPlugin.configs.flat.recommended, // This is not a plugin object, but a shareable config object
        reactPlugin.configs.flat['jsx-runtime'], // Add this if you are using React 17+
    ];
}
