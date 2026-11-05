// This repo only ever holds made up data. Fails when a tracked file holds a
// postcode that could exist or a phone number outside the ranges set aside for
// fiction, so a real one cannot arrive by accident. Run: node workbench/guards/check-dummy-data.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SKIPPED = /(package-lock\.json|\.ico|\.png|\.svg)$/;

// With a space in any case, or without one in capitals. A spaceless match in any
// case would flag every hex colour.
const POSTCODE = /\b[A-Za-z]{1,2}\d{1,2}[A-Za-z]? \d[A-Za-z]{2}\b|\b[A-Z]{1,2}\d{1,2}[A-Z]?\d[A-Z]{2}\b/g;
// No real inward code holds one of these letters after its digit.
const IMPOSSIBLE_INWARD = /[CIKMOV]/i;
const INWARD_LETTERS = 2;

const PHONE = /(?:\+44[\s()0]*|\b0)[1-9](?:[\s-]?\d){8,9}\b/g;
// Ofcom's numbers for drama: https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama
const FICTIONAL_PHONE = /^(?:44|0)(?:7700900|1632960|207946|113496|131496|161496|117496|121496|115496|191498)\d+$/;

const problems = [];
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file !== '' && !SKIPPED.test(file));

for (const file of files) {
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((text, index) => {
      for (const [postcode] of text.matchAll(POSTCODE)) {
        if (!IMPOSSIBLE_INWARD.test(postcode.slice(-INWARD_LETTERS))) {
          problems.push(`${file}:${String(index + 1)} postcode that could exist: ${postcode}`);
        }
      }
      for (const [phone] of text.matchAll(PHONE)) {
        const digits = phone.replace(/\D/g, '').replace(/^440/, '44');
        if (!FICTIONAL_PHONE.test(digits)) {
          problems.push(`${file}:${String(index + 1)} phone number outside the fiction ranges: ${phone}`);
        }
      }
    });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${String(problems.length)} problem(s). This repo holds made up data only.`);
  process.exit(1);
}
console.log(`Checked ${String(files.length)} files: no real looking postcodes or phone numbers.`);
