// Writes <OUT>/tf/<template>/main.tf for every template (plus "threeTierFixed": 3-tier after Apply all fixes).
// Validate each with: terraform init -backend=false && terraform validate
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const { BASE, CHROME, OUT } = require('./config'); const TF = path.join(OUT, 'tf');
(async () => {
  const b = await chromium.launch({ executablePath: CHROME }); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE + '?noonboard'); await p.waitForSelector('body.ready'); await p.waitForFunction(() => window.__AD && __AD.prices);
  const keys = await p.evaluate(() => Object.keys(__AD.templates));
  const write = (k, tf) => { fs.mkdirSync(path.join(TF, k), { recursive: true }); fs.writeFileSync(path.join(TF, k, 'main.tf'), tf); };
  for (const k of keys) write(k, await p.evaluate((k) => { __AD.load(__AD.templates[k].make(), { fresh: true }); return __AD.terraform(); }, k));
  await p.evaluate(() => __AD.load(__AD.templates.threeTier.make(), { fresh: true })); await p.click('#tab-review'); await p.click('[data-fixall]'); await p.waitForTimeout(200);
  write('threeTierFixed', await p.evaluate(() => __AD.terraform()));
  console.log('wrote', keys.length + 1, 'configurations to', TF, '| console errors:', errs.length); await b.close(); process.exit(errs.length ? 1 : 0);
})();
