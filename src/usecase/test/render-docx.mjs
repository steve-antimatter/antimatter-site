import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require(process.env.NPMROOT + '/docx');
import { buildDocx } from '../../../src/usecase/render-docx.js';
const rec = JSON.parse(fs.readFileSync(new URL('../../../db/seed/governance-in-testing.json', import.meta.url),'utf8'));
const buf = await D.Packer.toBuffer(buildDocx(D, rec));
fs.writeFileSync(new URL('./Governance_in_Testing.docx', import.meta.url), buf); console.log(buf.length);
