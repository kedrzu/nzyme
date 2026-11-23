import { expect, test } from 'bun:test';

import { cleanLastfmText } from './cleanLastfmText.js';

test('strips tags and the Read more link, decodes entities and collapses whitespace', () => {
    const html =
        'Rock &amp; roll<br/>band from <i>Tokyo</i>,&nbsp;&quot;loud&quot; &#8211; &#x263A;\n\n ' +
        '<a href="https://www.last.fm/music/X">Read more on Last.fm</a>';

    expect(cleanLastfmText(html)).toBe('Rock & roll band from Tokyo, "loud" – ☺');
});

test('cuts text over 600 characters at a word boundary with an ellipsis', () => {
    const text = `${'word '.repeat(119)}lastword more`;

    const cleaned = cleanLastfmText(text);

    expect(cleaned).toBe(`${'word '.repeat(119).trimEnd()}…`);
    expect(cleanLastfmText('Short text.')).toBe('Short text.');
});
