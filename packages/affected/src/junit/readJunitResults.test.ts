import { expect, test } from 'bun:test';

import { parseJunitResults } from './readJunitResults.js';

test('bun test: files from the testcase attribute, nested describe suites included', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="6" failures="1" skipped="2">
  <testsuite name="a.test.ts" file="a.test.ts" tests="4" failures="0" skipped="2">
    <testsuite name="grp" file="a.test.ts" line="2" tests="3" failures="0" skipped="1">
      <testcase name="in" classname="grp" file="a.test.ts" line="2" />
      <testcase name="sk" classname="grp" file="a.test.ts" line="2"><skipped /></testcase>
    </testsuite>
    <testcase name="td" classname="" file="a.test.ts" line="3"><skipped message="TODO" /></testcase>
  </testsuite>
  <testsuite name="c.test.ts" file="c.test.ts" tests="2" failures="1" skipped="0">
    <testcase name="x" classname="" file="c.test.ts" line="2" />
    <testcase name="y" classname="" file="c.test.ts" line="3">
      <failure type="Error" message="unhandled">Error: unhandled</failure>
    </testcase>
  </testsuite>
  <testsuite name="s.test.ts" file="s.test.ts" tests="1" failures="0" skipped="1">
    <testcase name="later" classname="" file="s.test.ts" line="1"><skipped /></testcase>
  </testsuite>
</testsuites>`;

    expect(parseJunitResults(xml)).toEqual([
        { file: 'a.test.ts', status: 'passed' },
        { file: 'c.test.ts', status: 'failed' },
        { file: 's.test.ts', status: 'skipped' },
    ]);
});

test('vitest: the file is the name of the outermost testsuite; an error fails it', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="3" failures="1" errors="0">
    <testsuite name="src/Button.stories.tsx" tests="2" failures="0" errors="0" skipped="0">
        <testcase classname="src/Button.stories.tsx" name="Primary" time="0.1"></testcase>
        <testcase classname="src/Button.stories.tsx" name="Disabled" time="0.1"></testcase>
    </testsuite>
    <testsuite name="src/Card.stories.tsx" tests="1" failures="0" errors="0" skipped="0">
        <testcase classname="src/Card.stories.tsx" name="Default" time="0.1">
            <error message="boom" type="Error">Error: boom</error>
        </testcase>
    </testsuite>
</testsuites>`;

    expect(parseJunitResults(xml)).toEqual([
        { file: 'src/Button.stories.tsx', status: 'passed' },
        { file: 'src/Card.stories.tsx', status: 'failed' },
    ]);
});

test('a testsuite counting failures no testcase shows fails its file', () => {
    const xml = `<testsuite name="hooks.test.ts" file="hooks.test.ts" tests="1" failures="1">
    <testcase name="ok" file="hooks.test.ts" />
</testsuite>`;

    expect(parseJunitResults(xml)).toEqual([{ file: 'hooks.test.ts', status: 'failed' }]);
});
