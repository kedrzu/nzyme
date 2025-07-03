declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    /* eslint-disable */
    const component: DefineComponent<{}, {}, any>;
    export default component;
}

declare module '*.module.scss' {
    const classes: { [key: string]: string };
    export default classes;
}
