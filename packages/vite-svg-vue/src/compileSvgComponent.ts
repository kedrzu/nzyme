import { optimize } from 'svgo';
import type { Config, CustomPlugin, XastCdata, XastChild, XastElement, XastParent, XastRoot } from 'svgo';

/**
 * svgo configuration applied to every SVG component. `path` is always the compiled file and
 * `datauri` would turn the output into a URL, so neither is configurable.
 */
export type SvgComponentSvgoConfig = Omit<Config, 'path' | 'datauri'>;

/** Options of {@link compileSvgComponent}. */
export interface CompileSvgComponentOptions {
    /** Path of the SVG file: named in errors and passed to svgo plugins (`prefixIds`). */
    path: string;
    /** svgo config; `preset-default` when omitted. `removeScripts` is always appended to its plugins. */
    svgo?: SvgComponentSvgoConfig;
}

interface SvgParts {
    attributes: Record<string, string>;
    innerHTML: string;
}

/**
 * Compiles SVG markup into an ES module whose default export is a Vue functional component
 * rendering one `<svg>` vnode: the root attributes as props, everything inside as static
 * `innerHTML`. Attributes the caller passes win over the file's, `class` and `style` merge.
 *
 * Scripts, `on*` event attributes, `javascript:`/`vbscript:` URLs, comments and processing
 * instructions are removed and CDATA becomes escaped text whatever svgo config is passed, because
 * the markup reaches the DOM through `innerHTML`.
 *
 * @throws Error naming the path when the source is not parsable or its root is not a single `<svg>`.
 * @__NO_SIDE_EFFECTS__
 */
export function compileSvgComponent(source: string, options: CompileSvgComponentOptions): string {
    const { path, svgo } = options;

    let parts: SvgParts;
    try {
        const optimized = optimize(source, {
            ...svgo,
            path,
            plugins: [...(svgo?.plugins ?? ['preset-default']), 'removeScripts'],
        });
        parts = splitSvgRoot(optimized.data);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot compile SVG component ${path}: ${reason}`, { cause: error });
    }

    return [
        `import { h, mergeProps } from 'vue';`,
        `const attrs = ${JSON.stringify(parts.attributes)};`,
        `const innerHTML = ${JSON.stringify(parts.innerHTML)};`,
        `const SvgComponent = (_props, { attrs: callerAttrs }) => h('svg', mergeProps(attrs, callerAttrs, { innerHTML }));`,
        `SvgComponent.inheritAttrs = false;`,
        `export default SvgComponent;`,
        '',
    ].join('\n');
}

/**
 * Re-parses optimized markup with svgo and only the root plugin, so the stringified result is
 * exactly `<svg>…</svg>` or `<svg/>` and the inner markup is the slice between the tags.
 */
function splitSvgRoot(svg: string): SvgParts {
    const captured: Partial<SvgParts> = {};
    const plugin: CustomPlugin = {
        name: 'nzyme-svg-vue-root',
        fn: () => ({
            root: {
                enter: node => {
                    const element = getSvgElement(node);
                    node.children = [element];
                },
                exit: node => {
                    const element = getSvgElement(node);
                    captured.attributes = element.attributes;
                    element.attributes = {};
                },
            },
            element: {
                enter: sanitizeElement,
            },
            // svgo prints comments, processing instructions and CDATA verbatim, but the HTML parser
            // behind `innerHTML` ends `<!-->`, `<?…>` and, under an HTML element, `<![CDATA[…` at the
            // first `>`, so markup hidden inside them would come alive. CDATA becomes a text node,
            // which svgo prints escaped.
            comment: {
                enter: removeNode,
            },
            instruction: {
                enter: removeNode,
            },
            cdata: {
                enter: cdataToText,
            },
        }),
    };

    const { data } = optimize(svg, { multipass: false, plugins: [plugin] });

    if (!captured.attributes) {
        throw new Error('svgo did not visit the SVG root');
    }

    if (data === '<svg/>') {
        return { attributes: captured.attributes, innerHTML: '' };
    }

    const openTag = '<svg>';
    const closeTag = '</svg>';
    if (!data.startsWith(openTag) || !data.endsWith(closeTag)) {
        throw new Error('Unexpected svgo output around the SVG root');
    }

    return {
        attributes: captured.attributes,
        innerHTML: data.slice(openTag.length, -closeTag.length),
    };
}

/** The only element of the document — doctype, XML instructions, comments and text around it are dropped. */
function getSvgElement(root: XastRoot): XastElement {
    const elements = root.children.filter(isElement);
    const [element] = elements;
    if (elements.length !== 1 || !element) {
        throw new Error(`Expected exactly one root element, found ${elements.length}`);
    }

    if (element.name !== 'svg') {
        throw new Error(`Expected <svg> as the root element, found <${element.name}>`);
    }

    return element;
}

function isElement(node: XastChild): node is XastElement {
    return node.type === 'element';
}

/**
 * The last line of defence against script execution through `innerHTML`: `removeScripts` matches
 * names case-sensitively, misses event attributes outside its SVG list (`onpointerdown`) and
 * `javascript:` URLs set through `<set>`/`<animate>`, all of which a browser still runs.
 */
function sanitizeElement(node: XastElement, parent: XastParent) {
    if (getLocalName(node.name) === 'script') {
        removeNode(node, parent);
        return;
    }

    node.attributes = Object.fromEntries(
        Object.entries(node.attributes).filter(([name, value]) => isSafeAttribute(name, value)),
    );
}

function isSafeAttribute(name: string, value: string) {
    const localName = getLocalName(name);
    if (localName.startsWith('on') || localName === 'srcdoc') {
        return false;
    }

    // Browsers drop whitespace inside a URL scheme, so `java\tscript:` still executes.
    const compact = value.replace(/\s/g, '').toLowerCase();
    return !compact.includes('javascript:') && !compact.includes('vbscript:');
}

function getLocalName(name: string) {
    return name.slice(name.lastIndexOf(':') + 1).toLowerCase();
}

function removeNode(node: XastChild, parent: XastParent) {
    parent.children = parent.children.filter(child => child !== node);
}

function cdataToText(node: XastCdata, parent: XastParent) {
    parent.children = parent.children.map(child => (child === node ? { type: 'text', value: node.value } : child));
}
