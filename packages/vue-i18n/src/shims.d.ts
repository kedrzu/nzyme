/// <reference types="./routes/routeShims.d.ts" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    /* eslint-disable */
    const component: DefineComponent<{}, {}, any>;
    export default component;
}

declare module '*.md' {
    import type { DefineComponent } from 'vue';
    /* eslint-disable */
    const component: DefineComponent<{}, {}, any>;
    export default component;
}

declare module '*.module.scss' {
    const classes: { [key: string]: string | undefined };
    export default classes;
}

declare module '*.svg' {
    const src: string;
    export default src;
}

declare module '*.svg?component' {
    import { FunctionalComponent, HTMLAttributes, SVGAttributes } from 'vue';
    const src: FunctionalComponent<HTMLAttributes & SVGAttributes>;
    export default src;
}

declare module '*.svg?url' {
    const src: string;
    export default src;
}

declare module '*.svg?raw' {
    const src: string;
    export default src;
}
