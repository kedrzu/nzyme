import { expect, onTestFinished, test, vi } from 'vitest';
import { render } from 'vitest-browser-vue';
import { createSSRApp, h } from 'vue';
import type { SVGAttributes } from 'vue';
import { renderToString } from 'vue/server-renderer';

import ArrowLeft from './fixtures/arrow-left.svg?component';
import Loader from './fixtures/loader.svg?component';
import Malicious from './fixtures/malicious.svg?component';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

test('renders one <svg> root whose static children, SMIL included, are SVG elements', async () => {
    const { container } = await render(Loader);

    const svg = getSvgRoot(container);
    const circles = svg.querySelectorAll('circle');
    const animations = svg.querySelectorAll('animate');
    expect(circles).toHaveLength(2);
    expect(animations).toHaveLength(2);
    for (const element of [...circles, ...animations]) {
        expect(element.namespaceURI).toBe(SVG_NAMESPACE);
    }

    const [animation] = animations;
    expect(animation).toBeInstanceOf(SVGAnimateElement);
    expect(animation?.getAttribute('attributeName')).toBe('r');
});

test('puts caller attributes, class, style and listeners on the root, the caller winning over the file', async () => {
    const onClick = vi.fn();
    const { container } = await render(ArrowLeft, {
        attrs: {
            fill: 'red',
            class: 'large',
            style: { color: 'blue' },
            'aria-label': 'Back',
            onClick,
        },
    });

    const svg = getSvgRoot(container);
    expect(svg.getAttribute('fill')).toBe('red');
    expect(svg.getAttribute('aria-label')).toBe('Back');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('class')?.split(' ')).toEqual(['icon', 'large']);
    expect(svg.getAttribute('style')).toBe('color: blue;');
    expect(svg.querySelectorAll('path')).toHaveLength(1);

    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
});

test('hydrates its server-rendered markup without a mismatch and keeps the children', async () => {
    const attrs: SVGAttributes = { class: 'spinner', 'aria-hidden': 'true' };
    const html = await renderToString(createSSRApp({ render: () => h(Loader, attrs) }));
    expect(html).toContain('<animate');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);

    const warnings: string[] = [];
    const consoleWarn = vi.spyOn(console, 'warn');
    const consoleError = vi.spyOn(console, 'error');
    const app = createSSRApp({ render: () => h(Loader, attrs) });
    app.config.warnHandler = message => warnings.push(message);
    app.mount(container);
    onTestFinished(() => {
        app.unmount();
        container.remove();
        consoleWarn.mockRestore();
        consoleError.mockRestore();
    });

    expect(warnings).toEqual([]);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    const svg = getSvgRoot(container);
    expect(svg.getAttribute('class')).toBe('spinner');
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    expect(svg.querySelectorAll('animate')).toHaveLength(2);
});

test('renders the malicious fixture with no script, event handler, comment or markup smuggled through CDATA', async () => {
    const { container } = await render(Malicious);

    const svg = getSvgRoot(container);
    const elements = [svg, ...svg.querySelectorAll('*')];
    expect(svg.querySelectorAll('script, img, iframe[srcdoc]')).toHaveLength(0);
    for (const element of elements) {
        expect(element.getAttributeNames().filter(name => name.toLowerCase().startsWith('on'))).toEqual([]);
    }

    // The HTML parser turns `<?…>` into a comment too.
    expect(document.createTreeWalker(svg, NodeFilter.SHOW_COMMENT).nextNode()).toBeNull();

    // The CDATA payload is inert text.
    expect(svg.querySelector('foreignObject p')?.textContent).toContain('<img src=x onerror=');
});

function getSvgRoot(container: Element) {
    expect(container.children).toHaveLength(1);
    const svg = container.firstElementChild;
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(svg?.namespaceURI).toBe(SVG_NAMESPACE);
    return svg!;
}
