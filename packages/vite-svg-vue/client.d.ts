declare module '*.svg?component' {
    import type { FunctionalComponent, HTMLAttributes, SVGAttributes } from 'vue';
    const component: FunctionalComponent<HTMLAttributes & SVGAttributes>;
    export default component;
}
