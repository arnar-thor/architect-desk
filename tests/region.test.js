const { chromium } = require('playwright-core'); const fs = require('fs');
const { OUT, BASE: base, ORIGIN, CHROME, TMP } = require('./config'); const path = require('path'); fs.mkdirSync(OUT + '/exports', { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const p = await ctx.newPage(); const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '?noonboard'); await p.waitForSelector('body.ready');
  const ready = (r) => p.waitForFunction((r) => __AD.prices && __AD.prices.meta.region === r && __AD.state.region === r, r);
  const tot = () => p.evaluate(() => document.querySelector('#hud-total').textContent);
  await ready('us-east-1');
  const opts = await p.$$eval('#region-ov option', (o) => o.map((x) => x.value));
  ok(opts.length === 36 && opts.includes('us-gov-east-1') && opts.includes('us-gov-west-1'), `region selector lists ${opts.length} regions incl. both GovCloud`);
  const tE = await tot(); ok(tE === '$747', 'us-east-1 3-tier total ' + tE);
  ok(await p.textContent('#tb-region') === 'us-east-1', 'title block shows us-east-1');
  await p.screenshot({ path: `${OUT}/A-desktop-us-east-1.png` });
  // switch to GovCloud West
  await p.selectOption('#region-ov', 'us-gov-west-1'); await ready('us-gov-west-1'); await p.waitForTimeout(150);
  const tG = await tot(); ok(tG !== tE, `us-gov-west-1 total ${tG} differs from ${tE}`);
  ok(await p.textContent('#tb-region') === 'us-gov-west-1', 'title block shows us-gov-west-1');
  const azl = await p.evaluate(() => __AD.state.nodes.filter(n => n.type === 'az').map(n => n.label));
  ok(azl.every(l => /us-gov-west-1[ab]$/.test(l)), 'AZ labels follow region: ' + azl.join(', '));
  const src = await p.evaluate(() => ({ m: __AD.prices.meta, ec2: __AD.prices.ec2['m7i.large'], cf: __AD.prices.cfDtoGb }));
  ok(src.ec2 === 0.12705 && Object.keys(src.m.offerPublicationDates).length >= 20 && /us-gov-west-1\/index\.csv/.test(src.m.source), `GovCloud prices sourced (m7i.large $${src.ec2}/h, ${Object.keys(src.m.offerPublicationDates).length} offer dates)`);
  const cfNa = await p.evaluate(() => __AD.review.findings.filter(f => f.region).map(f => f.title));
  ok(cfNa.some(t => /CloudFront.*not available in us-gov-west-1/.test(t)), 'CloudFront flagged unavailable in GovCloud: ' + cfNa.join(' | '));
  ok(await p.isVisible('#pane-overview .na-note'), 'cost panel shows "not available" note');
  const cfCost = await p.evaluate(() => { const n = __AD.state.nodes.find(n => n.type === 'cloudfront'); return AD.costTotal(AD.cost(n, __AD.prices)); });
  ok(cfCost === 0, 'unavailable CloudFront contributes $0 (no us-east-1 fallback)');
  await p.screenshot({ path: `${OUT}/A-desktop-us-gov-west-1.png` });
  await p.click('#tab-cost'); await p.waitForTimeout(100);
  const naLine = await p.isVisible('#pane-cost .na-tag'); ok(naLine, 'Cost tab marks the CloudFront line "Not available"');
  await p.screenshot({ path: `${OUT}/A-desktop-us-gov-west-1-cost.png` });
  await p.click('#tab-overview');
  // instance class not offered: db.m7g.large in GovCloud West
  await p.evaluate(() => { const s = JSON.parse(JSON.stringify(__AD.state)); s.nodes.find(n => n.type === 'rds').props.cls = 'db.m7g.large'; __AD.load(s); });
  await ready('us-gov-west-1');
  const f = await p.evaluate(() => __AD.review.findings.find(f => f.region && /Orders DB/.test(f.title)));
  ok(f && f.fix, 'db.m7g.large flagged in us-gov-west-1 with fix: ' + (f && f.fix && f.fix.label));
  await p.click('#tab-review'); const idx = await p.evaluate(() => __AD.review.findings.findIndex(f => f.region && /Orders DB/.test(f.title)));
  await p.click(`#pane-review [data-fix="${idx}"]`); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !__AD.review.findings.some(f => f.region && /Orders DB/.test(f.title))), 'one-click switch resolves it (now ' + await p.evaluate(() => __AD.state.nodes.find(n => n.type === 'rds').props.cls) + ')');
  // commercial region gap: me-south-1 has no m7i.large
  await p.evaluate(() => __AD.setRegion('me-south-1')); await ready('me-south-1');
  ok(await p.evaluate(() => __AD.review.findings.some(f => f.region && /App tier ASG/.test(f.title))), 'me-south-1: m7i.large ASG flagged unavailable');
  ok(await p.evaluate(() => !__AD.review.findings.some(f => f.region && /CloudFront/.test(f.title))), 'me-south-1: CloudFront (global) still available');
  // undo region change
  await p.locator('#canvas').focus(); await p.keyboard.press('Control+z'); await ready('us-gov-west-1');
  ok(true, 'Ctrl+Z restores us-gov-west-1');
  // terraform
  const tf = await p.evaluate(() => __AD.terraform()); fs.mkdirSync(path.join(OUT, 'tf', 'gov'), { recursive: true }); fs.writeFileSync(path.join(OUT, 'tf', 'gov', 'main.tf'), tf);
  ok(/region = "us-gov-west-1"/.test(tf) && /"us-gov-west-1a"/.test(tf), 'Terraform uses provider region and us-gov-west-1a AZs');
  // json save/load
  await p.click('#btn-export'); const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=json]')]);
  const jp = `${OUT}/exports/A-gov.json`; await d.saveAs(jp); ok(JSON.parse(fs.readFileSync(jp)).region === 'us-gov-west-1', 'JSON save includes region');
  await p.evaluate(() => __AD.setRegion('eu-west-1')); await ready('eu-west-1');
  await p.setInputFiles('#file-open', jp); await ready('us-gov-west-1'); ok(true, 'Open JSON restores us-gov-west-1');
  // share link
  await p.click('#btn-share'); await p.waitForTimeout(300); const url = p.url(); const gt = await tot();
  const c2 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(url); await p2.waitForFunction(() => window.__AD && __AD.prices && __AD.prices.meta.region === 'us-gov-west-1');
  ok(await p2.evaluate(() => document.querySelector('#hud-total').textContent) === gt && !e2.length, 'share link reopens in us-gov-west-1 with the same total ' + gt);
  await c2.close();
  // autosave
  await p.waitForTimeout(500); await p.goto(base + '?noonboard'); await p.waitForSelector('body.ready'); await ready('us-gov-west-1');
  ok(true, 'autosave reload keeps us-gov-west-1');
  // compare
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nl.architect.onboarded', '1'); }); await p.goto(base); await p.waitForSelector('body.ready'); await ready('us-east-1');
  await p.click('#pane-overview [data-compare]'); await p.waitForSelector('.cmp li'); await p.waitForTimeout(200);
  const rows = await p.$$eval('.cmp li', (l) => l.map((x) => x.querySelector('b').textContent + ' ' + x.querySelector('.cmp-v').childNodes[0].textContent + (x.classList.contains('partial') ? ' (partial)' : '')));
  ok(rows.length === 36, `compare lists ${rows.length} regions`);
  console.log('    cheapest:', rows.slice(0, 4).join(', '), '… dearest full:', rows.filter(r => !/partial/.test(r)).slice(-2).join(', '));
  console.log('    partial:', rows.filter(r => /partial/.test(r)).join(', '));
  const nums = rows.filter(r => !/partial/.test(r)).map(r => +r.split(' ')[1].replace(/[$,]/g, ''));
  ok(nums.every((v, i) => i === 0 || v >= nums[i - 1]), 'compare is sorted cheapest first');
  await p.screenshot({ path: `${OUT}/A-compare-regions.png` });
  await p.click('.cmp [data-region="us-gov-east-1"]'); await ready('us-gov-east-1'); ok(true, 'clicking a region in compare switches to it');
  fs.writeFileSync(`${OUT}/exports/region-totals-3tier.json`, JSON.stringify(await p.evaluate(() => __AD.regionTotals()), null, 1));
  ok(errs.length === 0, 'desktop console errors: ' + errs.length + ' ' + errs.join(' | '));
  await ctx.close();
  // mobile, GovCloud
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await m.newPage(); const me = []; mp.on('console', x => x.type() === 'error' && me.push(x.text())); mp.on('pageerror', e => me.push(e.message));
  await mp.goto(url); await mp.waitForFunction(() => window.__AD && __AD.prices && __AD.prices.meta.region === 'us-gov-west-1');
  ok(await mp.evaluate(() => document.documentElement.scrollWidth) <= 390, 'mobile 390 no overflow in GovCloud');
  await mp.screenshot({ path: `${OUT}/A-mobile-us-gov-west-1.png`, fullPage: false });
  ok(me.length === 0, 'mobile console errors: ' + me.length + ' ' + me.join(' | '));
  await m.close(); await b.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
