import fs from 'fs';
import { renderHtml } from '../../../src/usecase/render-html.js';
const doc = JSON.parse(fs.readFileSync(new URL('../../../db/seed/governance-in-testing.json', import.meta.url),'utf8'));
fs.writeFileSync(new URL('./rendered.html', import.meta.url), renderHtml(doc));
console.log('ok');
