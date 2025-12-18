import { remark } from 'remark';

const parser = remark();

// Test what parser.parse and parser.runSync return
const testMarkdown = '\n\nFirst para.';
console.log('Testing parse vs runSync:');
console.log('Input:', JSON.stringify(testMarkdown));

const parsed = parser.parse(testMarkdown);
console.log('\nAfter parse():');
console.log('Type:', parsed.type);
console.log('Children:', parsed.children.length);
console.log('First child position:', parsed.children[0]?.position);

const processed = parser.runSync(parsed);
console.log('\nAfter runSync():');
console.log('Type:', processed.type);
console.log('Children:', processed.children.length);
console.log('First child position:', processed.children[0]?.position);
console.log('Are they the same object?', parsed === processed);
console.log('Are children the same?', parsed.children[0] === processed.children[0]);

