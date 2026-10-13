const { chromium } = require('playwright-core');
const fs = require('fs');
const { OUT, BASE, ORIGIN, CHROME } = require('./config'); fs.mkdirSync(OUT + '/exports', { recursive: true });
const opts = ['A'];
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  for (const o of opts) {
    console.log('Option ' + o);
    const base = BASE;
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    const p = await ctx.newPage();
    const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(e.message));
    await p.goto(base); await p.waitForSelector('body.ready');
    await p.waitForTimeout(700);
    ok(await p.isVisible('#onboard'), 'onboarding shows on first visit');
    for (let i = 0; i < 4; i++) await p.click('[data-ob=next]');
    ok(await p.isHidden('#onboard'), 'onboarding completes');
    const st0 = await p.evaluate(() => ({ n: __AD.state.nodes.length, e: __AD.state.edges.length, t: __AD.state.template }));
    ok(st0.t === 'threeTier' && st0.n > 10, `3-tier loaded (${st0.n} nodes, ${st0.e} edges)`);
    const total = async () => p.evaluate(() => document.querySelector('#hud-total').textContent);
    // templates
    for (const key of ['serverless', 'staticSite', 'microservices', 'pipeline', 'blank', 'threeTier']) {
      await p.click('#btn-templates'); await p.click(`[data-template=${key}]`); await p.waitForTimeout(150);
      const s = await p.evaluate(() => ({ t: __AD.state.template, n: __AD.state.nodes.length, f: __AD.review.findings.length, o: __AD.review.overall }));
      ok(s.t === key, `template ${key}: ${s.n} nodes, total ${await total()}, score ${s.o}, ${s.f} findings`);
    }
    await p.click('#btn-fit'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${o}-desktop-3tier.png` });
    // drag from palette
    const n1 = await p.evaluate(() => __AD.state.nodes.length);
    const item = await p.locator('.pal-item[data-type=lambda]').boundingBox();
    const stage = await p.locator('#stage').boundingBox();
    await p.mouse.move(item.x + item.width / 2, item.y + item.height / 2); await p.mouse.down();
    await p.mouse.move(stage.x + 200, stage.y + 120, { steps: 8 }); await p.mouse.move(stage.x + 220, stage.y + 130, { steps: 3 }); await p.mouse.up();
    const n2 = await p.evaluate(() => __AD.state.nodes.length);
    ok(n2 === n1 + 1, 'drag Lambda from palette onto canvas');
    // connect: drag from new node port to the S3 node
    const ids = await p.evaluate(() => { const s = __AD.state; return { a: s.nodes[s.nodes.length - 1].id, b: s.nodes.find(n => n.type === 's3').id }; });
    const e1 = await p.evaluate(() => __AD.state.edges.length);
    const port = await p.locator(`[data-port=${ids.a}]`).boundingBox();
    const tgt = await p.locator(`.node[data-id=${ids.b}] .node-card`).boundingBox();
    await p.mouse.move(port.x + port.width / 2, port.y + port.height / 2); await p.mouse.down();
    await p.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 10 }); await p.mouse.up();
    ok(await p.evaluate(() => __AD.state.edges.length) === e1 + 1, 'connect Lambda → S3 by dragging the port');
    // move node by dragging
    const before = await p.evaluate((id) => __AD.state.nodes.find(n => n.id === id).x, ids.a);
    const nb = await p.locator(`.node[data-id=${ids.a}] .node-card`).boundingBox();
    await p.mouse.move(nb.x + 30, nb.y + 30); await p.mouse.down(); await p.mouse.move(nb.x + 110, nb.y + 60, { steps: 6 }); await p.mouse.up();
    const after = await p.evaluate((id) => __AD.state.nodes.find(n => n.id === id).x, ids.a);
    ok(after !== before && after % 20 === 0, `drag node moves and snaps (${before} → ${after})`);
    // edit property
    const asg = await p.evaluate(() => __AD.state.nodes.find(n => n.type === 'asg').id);
    const t0 = await total();
    await p.click(`.node[data-id=${asg}] .node-card`);
    ok(await p.isVisible('#pane-props'), 'selecting a node opens Properties');
    await p.fill('#pf-count', '6'); await p.press('#pf-count', 'Tab'); await p.waitForTimeout(100);
    const t1 = await total();
    ok(t0 !== t1, `ASG count 4 → 6 changes total ${t0} → ${t1}`);
    await p.selectOption('#pf-itype', 'm7g.large'); await p.waitForTimeout(100);
    ok(await total() !== t1, `instance type change updates total → ${await total()}`);
    // undo / redo
    await p.keyboard.press('Escape'); await p.locator('#canvas').focus();
    await p.keyboard.press('Control+z');
    ok(await p.evaluate(() => __AD.state.nodes.find(n => n.type === 'asg').props.itype) === 'm7i.large', 'Ctrl+Z undoes the type change');
    await p.keyboard.press('Control+Shift+z');
    ok(await p.evaluate(() => __AD.state.nodes.find(n => n.type === 'asg').props.itype) === 'm7g.large', 'Ctrl+Shift+Z redoes it');
    // analysis + fix
    await p.click('#btn-templates'); await p.click('[data-template=threeTier]'); await p.waitForTimeout(150);
    await p.click('#tab-review');
    const hasRds = await p.evaluate(() => __AD.review.findings.some(f => f.id.startsWith('rds-single')));
    ok(hasRds, 'review flags Single-AZ RDS');
    const s0 = await p.evaluate(() => __AD.review.overall);
    const idx = await p.evaluate(() => __AD.review.findings.findIndex(f => f.id.startsWith('rds-single')));
    await p.click(`#pane-review [data-fix="${idx}"]`); await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({ m: __AD.state.nodes.find(n => n.type === 'rds').props.multiAz, o: __AD.review.overall, g: [...document.querySelectorAll('.ghost text')].map(t => t.textContent) }));
    ok(r.m === true && r.o > s0 && r.g.includes('Standby'), `one-click "Enable Multi-AZ": score ${s0} → ${r.o}, standby ghost drawn`);
    // security flags: open SSH + public DB + unencrypted
    await p.evaluate(() => { const s = __AD.state; const rds = s.nodes.find(n => n.type === 'rds'); rds.props.public = true; rds.props.encrypted = false; s.nodes.find(n => n.type === 'asg').props.sshOpen = true; __AD.load(JSON.parse(JSON.stringify(s))); });
    const sec = await p.evaluate(() => __AD.review.findings.filter(f => f.pillar === 'sec').map(f => f.id.replace(/-n\d+$/, '')));
    ok(['db-public', 'db-enc', 'ssh-open'].every(k => sec.includes(k)), 'security flags: ' + sec.join(', '));
    await p.click('[data-fixall]'); await p.waitForTimeout(150);
    const af = await p.evaluate(() => ({ fixable: __AD.review.findings.filter(f => f.fix).length, o: __AD.review.overall, n: __AD.review.findings.length }));
    ok(af.fixable === 0, `"Apply all fixes" leaves ${af.n} non-fixable notes, score ${af.o}`);
    await p.keyboard.press('Control+z');
    ok(await p.evaluate(() => __AD.review.findings.filter(f => f.fix).length) > 0, 'undo reverts apply-all');
    // WAF missing on public ALB without CloudFront
    await p.evaluate(() => { const s = JSON.parse(JSON.stringify(__AD.state)); s.nodes = s.nodes.filter(n => !['cloudfront', 'waf'].includes(n.type)); __AD.load(s); });
    ok(await p.evaluate(() => __AD.review.findings.some(f => f.id === 'no-waf')), 'flags public ALB without WAF');
    // exports
    await p.click('#btn-templates'); await p.click('[data-template=threeTier]'); await p.waitForTimeout(150);
    const dl = async (act, name) => { await p.click('#btn-export'); const [d] = await Promise.all([p.waitForEvent('download'), p.click(`[data-act=${act}]`)]); const path = `${OUT}/exports/${o}-${name}`; await d.saveAs(path); return fs.statSync(path).size; };
    ok(await dl('png', '3tier.png') > 20000, 'PNG export');
    ok(await dl('svg', '3tier.svg') > 10000, 'SVG export');
    ok(await dl('json', '3tier.json') > 1000, 'JSON save');
    ok(await dl('tf', '3tier.tf') > 2000, 'Terraform export');
    await p.click('#btn-templates'); await p.click('[data-template=microservices]'); await p.waitForTimeout(100);
    await dl('tf', 'micro.tf'); await p.click('#btn-templates'); await p.click('[data-template=pipeline]'); await p.waitForTimeout(100); await dl('tf', 'pipeline.tf');
    // load JSON
    await p.setInputFiles('#file-open', `${OUT}/exports/${o}-3tier.json`); await p.waitForTimeout(200);
    ok(await p.evaluate(() => __AD.state.template) === 'threeTier', 'Open JSON restores the 3-tier diagram');
    // delete key
    const nd = await p.evaluate(() => __AD.state.nodes.length);
    const s3 = await p.evaluate(() => __AD.state.nodes.find(n => n.type === 's3').id);
    await p.click(`.node[data-id=${s3}] .node-card`); await p.keyboard.press('Delete');
    ok(await p.evaluate(() => __AD.state.nodes.length) === nd - 1, 'Delete key removes the selected node');
    await p.keyboard.press('Control+z');
    // share link
    await p.click('#btn-share'); await p.waitForTimeout(300);
    const url = p.url();
    ok(/#d=z/.test(url), 'share link puts compressed state in the hash (' + url.length + ' chars)');
    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p2 = await ctx2.newPage();
    const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.goto(url); await p2.waitForSelector('body.ready'); await p2.waitForTimeout(300);
    ok(await p2.evaluate(() => __AD.state.nodes.length) === nd, 'share link opens the same diagram in a fresh browser');
    await ctx2.close();
    // autosave
    await p.evaluate(() => { const s = __AD.state; s.title = 'Autosave check'; __AD.load(JSON.parse(JSON.stringify(s))); });
    await p.waitForTimeout(600); await p.goto(base); await p.waitForSelector('body.ready');
    ok(await p.evaluate(() => __AD.state.title) === 'Autosave check', 'localStorage autosave survives reload');
    // zoom & keyboard
    const k0 = await p.evaluate(() => __AD.view.k); await p.locator('#canvas').focus(); await p.keyboard.press('+');
    ok(await p.evaluate(() => __AD.view.k) > k0, 'zoom with + key');
    await p.keyboard.press('?'); ok(await p.isVisible('#m-help'), '? opens help'); await p.keyboard.press('Escape');
    ok(errs.length === 0, `desktop console errors: ${errs.length} ${errs.slice(0, 3).join(' | ')}`);
    // final desktop screenshot of fresh 3-tier state
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nl.architect.onboarded', '1'); });
    await p.goto(base); await p.waitForSelector('body.ready'); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/${o}-desktop-3tier.png` });
    await ctx.close();
    // mobile
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mp = await m.newPage(); const merrs = []; mp.on('console', x => x.type() === 'error' && merrs.push(x.text())); mp.on('pageerror', e => merrs.push(e.message));
    await mp.goto(base); await mp.waitForSelector('body.ready'); await mp.waitForTimeout(500);
    ok(await mp.evaluate(() => document.body.classList.contains('view-only')), 'mobile opens in review mode');
    ok(await mp.isVisible('#viewnote') && await mp.isHidden('#onboard'), 'mobile shows the "best on desktop" note, no onboarding');
    const ow = await mp.evaluate(() => document.documentElement.scrollWidth); ok(ow <= 390, 'no horizontal overflow at 390 (' + ow + ')');
    await mp.screenshot({ path: `${OUT}/${o}-mobile.png` });
    const rds = await mp.evaluate(() => __AD.state.nodes.find(n => n.type === 'rds').id);
    await mp.tap(`.node[data-id=${rds}] .node-card`).catch(() => {}); await mp.waitForTimeout(200);
    ok(await mp.evaluate(() => !document.querySelector('#pane-props').hidden && document.querySelector('#pf-cls').disabled), 'tap shows read-only properties');
    ok(merrs.length === 0, `mobile console errors: ${merrs.length} ${merrs.join(' | ')}`);
    await m.close();
  }
  await b.close();
  console.log(fails ? `FAILED: ${fails}` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
