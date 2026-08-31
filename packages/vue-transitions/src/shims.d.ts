declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    // This is the shape the Vue SFC compiler actually produces for an untyped component, so `{}`
    // and `any` are this shim's contract rather than a shortcut — anything narrower would reject
    // every real single-file component that resolves through it.
    // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-empty-object-type
    const component: DefineComponent<{}, {}, any>;
    export default component;
}

declare module '*.module.scss' {
    const classes: { [key: string]: string };
    export default classes;
}
