import Aura from '@primevue/themes/aura';
import { defineNuxtConfig } from 'nuxt/config';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2024-11-01',
    devtools: { enabled: true },
    modules: ['@primevue/nuxt-module'],
    ssr: false,
    primevue: {
        options: {
            theme: {
                preset: Aura,
                options: {
                    darkModeSelector: '.dark',
                },
            },
        },
    },
    app: {
        head: {
            link: [
                { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
                { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
                {
                    rel: 'stylesheet',
                    href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Lato:wght@400;700&display=swap',
                },
            ],
        },
    },
    devServer: {
        port: 3012,
    },
    typescript: {
        typeCheck: true,
        strict: true,
    },
    components: false,
    imports: {
        autoImport: false,
    },
    nitro: {
        experimental: {
            websocket: true,
        },
    },
    css: ['primeicons/primeicons.css'],
    vite: {
        server: {
            hmr: false,
        },
    },
});
