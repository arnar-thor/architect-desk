/* Architect's Desk · Well-Architected review: findings, one-click fixes, pillar scores. */
(function () {
  const PILLARS = [["ops", "Operational excellence"], ["sec", "Security"], ["rel", "Reliability"], ["perf", "Performance efficiency"], ["cost", "Cost optimization"], ["sus", "Sustainability"]];
  const W = { crit: 35, high: 22, med: 12, low: 6, info: 0 };
  const GRAVITON = { "t3.small": "t4g.small", "t3.medium": "t4g.medium", "m7i.large": "m7g.large", "m6i.large": "m7g.large" };

  function analyze(S, helpers) {
    const N = S.nodes.filter((x) => !AD.CATALOG[x.type].container);
    const of = (...t) => N.filter((x) => t.includes(x.type));
    const has = (...t) => of(...t).length > 0;
    const linked = (a, types) => S.edges.some((e) => {
      const o = e.from === a.id ? e.to : e.to === a.id ? e.from : null;
      if (!o) return false; const on = S.nodes.find((x) => x.id === o); return on && types.includes(on.type);
    });
    const F = [];
    const add = (f) => F.push(f);
    const vpcCompute = of("ec2", "asg", "ecs", "eks");

    // ---- Reliability ----
    if (vpcCompute.length) {
      const azs = new Set(); let multi = false;
      vpcCompute.forEach((c) => { if (c.type === "ec2") azs.add(c.props.az || "a"); else if (+c.props.azs >= 2) multi = true; else azs.add("a"); });
      if (!multi && azs.size < 2) {
        const single = vpcCompute.filter((c) => c.type !== "ec2");
        const ec2 = vpcCompute.filter((c) => c.type === "ec2");
        add({ id: "single-az-compute", pillar: "rel", sev: "high", nodes: vpcCompute.map((c) => c.id),
          title: "Compute runs in a single Availability Zone",
          detail: "If that AZ has a problem, the whole application goes down. Run at least two copies of each tier in different AZs behind a load balancer.",
          fix: { label: single.length ? "Spread across 2 AZs" : "Add a second instance in another AZ",
            apply: (st) => { st.nodes.forEach((c) => { if (["asg", "ecs", "eks"].includes(c.type)) c.props.azs = 2; });
              if (!single.length && ec2[0]) helpers.cloneToOtherAz(st, ec2[0].id); } } });
      }
    }
    of("ec2").forEach((c) => {
      if (!has("asg", "ecs", "eks") && +c.props.count === 1 && !linked(c, ["alb", "nlb"]))
        add({ id: "lone-ec2-" + c.id, pillar: "rel", sev: "med", nodes: [c.id], title: `${c.label || "EC2"} is a lone instance with no load balancer`,
          detail: "A single instance is a single point of failure, and replacing it changes its address. Put it in an Auto Scaling group behind an ALB so failed instances are replaced automatically.",
          fix: { label: "Put behind an ALB", apply: (st) => helpers.addLinked(st, "alb", c.id, "before") } });
    });
    const publicFacingCompute = vpcCompute.length && (has("users", "igw", "route53", "cloudfront"));
    if (vpcCompute.length && publicFacingCompute && !has("alb", "nlb", "apigw")) {
      add({ id: "no-lb", pillar: "rel", sev: "high", nodes: vpcCompute.map((c) => c.id), title: "No load balancer in front of compute",
        detail: "Without a load balancer, clients hit instances directly: no health checks, no failover between AZs, and no clean way to scale out.",
        fix: { label: "Add an Application Load Balancer", apply: (st) => helpers.addLinked(st, "alb", vpcCompute[0].id, "before") } });
    }
    const nats = of("nat");
    if (nats.length) {
      const natAz = new Set(nats.map((x) => x.props.az || "a"));
      const multiAzPrivate = vpcCompute.some((c) => +c.props.azs >= 2) || new Set(of("ec2").map((c) => c.props.az || "a")).size >= 2;
      if (multiAzPrivate && natAz.size < 2)
        add({ id: "single-nat", pillar: "rel", sev: "med", nodes: nats.map((x) => x.id), title: "One NAT gateway serves several AZs",
          detail: "A NAT gateway lives in one AZ. If that AZ fails, private subnets in the other AZs lose outbound internet access. AWS recommends one NAT gateway per AZ" + (helpers.P.natHr != null ? ` (about $${Math.round(helpers.P.natHr * 730)}/month each in this region before data).` : "."),
          fix: { label: "Add a NAT gateway in another AZ", apply: (st) => helpers.cloneToOtherAz(st, nats[0].id) } });
    }
    of("rds").forEach((d) => {
      if (!d.props.multiAz) add({ id: "rds-single-" + d.id, pillar: "rel", sev: "high", nodes: [d.id], title: `${d.label || "RDS"} is Single-AZ`,
        detail: "A Single-AZ database is down during instance failure, AZ outages, and some maintenance. Multi-AZ keeps a synchronous standby in another AZ and fails over automatically, usually in one to two minutes.",
        fix: { label: "Enable Multi-AZ", apply: (st) => { helpers.node(st, d.id).props.multiAz = true; } } });
      if (+d.props.backupDays === 0) add({ id: "rds-nobackup-" + d.id, pillar: "rel", sev: "high", nodes: [d.id], title: `${d.label || "RDS"} has automated backups turned off`,
        detail: "With a retention of 0 days there are no automated backups and no point-in-time recovery. Set retention to at least 7 days.",
        fix: { label: "Keep backups for 7 days", apply: (st) => { helpers.node(st, d.id).props.backupDays = 7; } } });
    });
    of("aurora").forEach((d) => {
      if (+d.props.instances < 2) add({ id: "aurora-single-" + d.id, pillar: "rel", sev: "med", nodes: [d.id], title: `${d.label || "Aurora"} has only a writer instance`,
        detail: "Aurora storage is replicated across three AZs, but with one instance a failure means creating a new one (often around 10 minutes). Add a reader in another AZ to fail over in about a minute or less.",
        fix: { label: "Add a reader replica", apply: (st) => { helpers.node(st, d.id).props.instances = 2; } } });
    });
    of("dynamodb").forEach((d) => { if (!d.props.pitr) add({ id: "ddb-pitr-" + d.id, pillar: "rel", sev: "med", nodes: [d.id], title: `${d.label || "DynamoDB"} has no point-in-time recovery`,
      detail: "PITR lets you restore the table to any second in the last 35 days after a bad write or deletion.",
      fix: { label: "Enable PITR", apply: (st) => { helpers.node(st, d.id).props.pitr = true; } } }); });
    of("s3").forEach((b) => { if (!b.props.versioning) add({ id: "s3-ver-" + b.id, pillar: "rel", sev: "low", nodes: [b.id], title: `${b.label || "S3"} versioning is off`,
      detail: "Versioning keeps prior versions of overwritten or deleted objects, so mistakes and ransomware-style deletes can be undone. Pair it with a lifecycle rule to expire old versions.",
      fix: { label: "Enable versioning", apply: (st) => { helpers.node(st, b.id).props.versioning = true; } } }); });
    of("elasticache").forEach((c) => { if (+c.props.nodes < 2 || !c.props.multiAz) add({ id: "cache-single-" + c.id, pillar: "rel", sev: "low", nodes: [c.id], title: `${c.label || "ElastiCache"} has no automatic failover`,
      detail: "With a single node or Multi-AZ off, a node failure empties the cache and sends every read to the database at once.",
      fix: { label: "2 nodes, Multi-AZ", apply: (st) => { const x = helpers.node(st, c.id); x.props.nodes = Math.max(2, +x.props.nodes); x.props.multiAz = true; } } }); });
    of("sqs").forEach((q) => { if (!q.props.dlq) add({ id: "sqs-dlq-" + q.id, pillar: "rel", sev: "low", nodes: [q.id], title: `${q.label || "SQS"} has no dead-letter queue`,
      detail: "Messages that keep failing will be retried until they expire. A DLQ captures them for inspection instead of blocking or losing them.",
      fix: { label: "Add a dead-letter queue", apply: (st) => { helpers.node(st, q.id).props.dlq = true; } } }); });

    // ---- Security ----
    of("rds", "aurora").forEach((d) => {
      if (d.props.public || d.subnet === "public") add({ id: "db-public-" + d.id, pillar: "sec", sev: "crit", nodes: [d.id], title: `${d.label || "Database"} is reachable from the internet`,
        detail: "Databases belong in private subnets with Publicly accessible off, reachable only from the app tier's security group.",
        fix: { label: "Make private", apply: (st) => { const x = helpers.node(st, d.id); x.props.public = false; helpers.moveToPrivate(st, d.id); } } });
      if (!d.props.encrypted) add({ id: "db-enc-" + d.id, pillar: "sec", sev: "high", nodes: [d.id], title: `${d.label || "Database"} storage is not encrypted`,
        detail: "Turn on encryption at rest with KMS. An existing unencrypted RDS instance can't be switched in place: copy a snapshot with encryption and restore from it.",
        fix: { label: "Encrypt at rest", apply: (st) => { helpers.node(st, d.id).props.encrypted = true; } } });
    });
    of("ec2", "asg").forEach((c) => {
      if (c.props.sshOpen) add({ id: "ssh-open-" + c.id, pillar: "sec", sev: "high", nodes: [c.id], title: `${c.label || c.type.toUpperCase()} allows SSH from anywhere`,
        detail: "A security group rule allowing port 22 from 0.0.0.0/0 invites brute-force attacks. Remove it and use Systems Manager Session Manager, or limit SSH to a known IP range.",
        fix: { label: "Close port 22", apply: (st) => { helpers.node(st, c.id).props.sshOpen = false; } } });
      if (c.props.ebsEnc === false) add({ id: "ebs-enc-" + c.id, pillar: "sec", sev: "med", nodes: [c.id], title: `${c.label || "Instance"} EBS volumes are unencrypted`,
        detail: "Turn on EBS encryption by default for the account and region so every new volume and snapshot is encrypted.",
        fix: { label: "Encrypt EBS", apply: (st) => { helpers.node(st, c.id).props.ebsEnc = true; } } });
    });
    of("ec2").forEach((c) => { if (c.props.publicIp && (has("alb", "nlb"))) add({ id: "ec2-pubip-" + c.id, pillar: "sec", sev: "med", nodes: [c.id], title: `${c.label || "EC2"} has a public IP behind a load balancer`,
      detail: "Instances behind a load balancer don't need public addresses. Move them to private subnets; it also saves" + (helpers.P.publicIpv4Hr != null ? ` $${(helpers.P.publicIpv4Hr * 730).toFixed(2)}` : "") + " per address per month.",
      fix: { label: "Remove public IP", apply: (st) => { helpers.node(st, c.id).props.publicIp = false; helpers.moveToPrivate(st, c.id); } } }); });
    of("s3").forEach((b) => { if (!b.props.blockPublic) add({ id: "s3-public-" + b.id, pillar: "sec", sev: "high", nodes: [b.id], title: `${b.label || "S3"} Block Public Access is off`,
      detail: has("cloudfront") ? "Serve the bucket only through CloudFront with Origin Access Control and keep Block Public Access on." : "Leave Block Public Access on unless the bucket must be public. To serve a site, put CloudFront with Origin Access Control in front.",
      fix: { label: "Block public access", apply: (st) => { helpers.node(st, b.id).props.blockPublic = true; } } }); });
    const publicEntry = of("alb").filter((x) => x.props.public).concat(of("cloudfront", "apigw"));
    const wafProtected = (x) => linked(x, ["waf"]) || (x.type === "alb" && of("cloudfront").some((cf) => linked(cf, ["waf"]) && linked(cf, ["alb"])));
    const unprotected = publicEntry.filter((x) => !wafProtected(x));
    if (unprotected.length) add({ id: "no-waf", pillar: "sec", sev: "med", nodes: unprotected.map((x) => x.id), title: "Public entry point without AWS WAF",
      detail: "Attach a WAF web ACL with the AWS managed Core rule set and a rate-based rule to the outermost public endpoint (CloudFront if you have it, otherwise the ALB or API). WAF attaches to API Gateway REST APIs, not HTTP APIs.",
      fix: { label: (unprotected[0].type === "apigw" && unprotected[0].props.kind === "HTTP") ? "Switch to REST API + attach WAF" : "Attach a WAF web ACL", apply: (st) => helpers.addLinked(st, "waf", unprotected[0].id, "before") } });
    if (of("rds", "aurora").length && !has("secrets")) add({ id: "no-secrets", pillar: "sec", sev: "low", nodes: of("rds", "aurora").map((x) => x.id), title: "Database credentials have no secrets store",
      detail: "Keep database passwords in Secrets Manager (RDS can manage and rotate the master password for you) rather than in code or environment files.",
      fix: { label: "Add Secrets Manager", apply: (st) => helpers.addLinked(st, "secrets", of("rds", "aurora")[0].id, "after") } });

    // ---- Operational excellence ----
    if (N.length >= 3 && !has("cloudwatch")) add({ id: "no-monitoring", pillar: "ops", sev: "med", nodes: [], title: "No monitoring or alarms",
      detail: "Add CloudWatch alarms on the signals users feel (5xx rate, latency, queue age, DB CPU and connections) and route them to the on-call team.",
      fix: { label: "Add CloudWatch", apply: (st) => helpers.addFree(st, "cloudwatch") } });
    if (of("lambda", "sqs", "sns", "eventbridge").length >= 2 && !has("cloudwatch")) {/* covered above */}

    // ---- Performance ----
    const web = vpcCompute.length && publicFacingCompute;
    if ((web || of("s3").some((b) => !b.props.blockPublic)) && !has("cloudfront") && has("users") && helpers.P.cfDtoGb != null)
      add({ id: "no-cdn", pillar: "perf", sev: "low", nodes: [], title: "No CDN in front of the site",
        detail: "CloudFront caches static content at edge locations near users, cutting latency and origin load. Its data-out rate is also lower than serving directly from the region.",
        fix: { label: "Add CloudFront", apply: (st) => { const u = st.nodes.find((x) => x.type === "users"); helpers.addLinked(st, "cloudfront", u.id, "after"); } } });
    of("rds").forEach((d) => { if (!has("elasticache") && !has("dynamodb") && vpcCompute.length && /large|xlarge/.test(d.props.cls))
      add({ id: "no-cache-" + d.id, pillar: "perf", sev: "info", nodes: [d.id], title: "Consider a cache for hot reads",
        detail: "If the same queries repeat, ElastiCache in front of the database cuts latency and lets you run a smaller instance. Measure first; not every workload benefits.", fix: null }); });

    // ---- Cost & sustainability ----
    const P = helpers.P;
    const gOk = (t) => GRAVITON[t] && P.ec2[GRAVITON[t]] != null && P.ec2[t] != null && P.ec2[GRAVITON[t]] < P.ec2[t];
    const grav = of("ec2", "asg", "eks").filter((c) => gOk(c.props.itype));
    if (grav.length) add({ id: "graviton", pillar: "cost", also: "sus", sev: "low", nodes: grav.map((c) => c.id), title: "Graviton (Arm) instances could cost less",
      detail: `Equivalent Graviton types are cheaper per hour in this region (for example ${grav[0].props.itype} ${AD.fmtPrice(P.ec2[grav[0].props.itype])}/h vs ${GRAVITON[grav[0].props.itype]} ${AD.fmtPrice(P.ec2[GRAVITON[grav[0].props.itype]])}/h) and use less energy for the same work. Check that your software runs on Arm64 first.`,
      fix: { label: "Switch to Graviton", apply: (st) => st.nodes.forEach((c) => { if (c.props && gOk(c.props.itype)) c.props.itype = GRAVITON[c.props.itype]; }) } });
    const natGb = nats.reduce((s, x) => s + (+x.props.gb || 0), 0);
    const vpcs = S.nodes.filter((x) => x.type === "vpc");
    if (nats.length && has("s3", "dynamodb") && vpcs.some((v) => !v.props.gwEndpoints)) add({ id: "gw-endpoints", pillar: "cost", sev: natGb > 200 ? "med" : "low", nodes: nats.map((x) => x.id),
      title: "S3/DynamoDB traffic may go through the NAT gateway",
      detail: `Gateway VPC endpoints for S3 and DynamoDB are free and keep that traffic off the NAT gateway (${AD.fmtPrice(helpers.P.natGb)}/GB processed). Add them to the private route tables.`,
      fix: vpcs.length ? { label: "Add gateway endpoints", apply: (st) => st.nodes.forEach((v) => { if (v.type === "vpc") v.props.gwEndpoints = true; }) } : null });
    if (of("ec2").some((c) => +c.props.count >= 4) && !has("asg")) add({ id: "fixed-fleet", pillar: "cost", also: "sus", sev: "low", nodes: of("ec2").filter((c) => +c.props.count >= 4).map((c) => c.id),
      title: "Fixed fleet sized for peak", detail: "A fixed group of instances runs at peak size all day. An Auto Scaling group with target tracking scales in during quiet hours, saving money and energy.", fix: null });
    if (vpcCompute.length === 0 && N.length >= 2 && has("lambda", "s3", "dynamodb", "cloudfront"))
      F.push({ id: "serverless-good", pillar: "sus", sev: "info", positive: true, nodes: [], title: "Mostly managed and serverless", detail: "Managed and serverless services scale to zero and share infrastructure, which is good for both cost and sustainability.", fix: null });

    // ---- region availability ----
    N.forEach((n) => {
      const na = AD.costUnavailable(AD.cost(n, P)); if (!na.length) return;
      const def = AD.CATALOG[n.type]; const why = (P.meta.unavailable || {})[n.type];
      const sel = def.props.find((d) => d.type === "select" && ["itype", "cls", "ntype"].includes(d.k));
      let alt = null;
      if (sel && !why) {
        const avail = (v) => { const t = { ...n, props: { ...n.props, [sel.k]: v } }; return !AD.costUnavailable(AD.cost(t, P)).length; };
        const opts = sel.options; const i = opts.indexOf(n.props[sel.k]);
        alt = opts.slice(i + 1).concat(opts.slice(0, i).reverse()).find(avail) || null;
      }
      add({ id: "region-na-" + n.id, pillar: "ops", sev: "high", nodes: [n.id], region: true,
        title: `${n.label}: ${na.map((l) => l.label).join(", ")} not available in ${P.meta.region}`,
        detail: why ? why + " Choose another region, or run this piece from a commercial region." :
          `The AWS Price List has no on-demand price for this in ${P.meta.name}, so it isn't offered there (or not on-demand). It's left out of the total rather than priced with another region's rate.`,
        fix: alt ? { label: `Switch to ${alt}`, apply: (st) => { helpers.node(st, n.id).props[sel.k] = alt; } } : null });
    });

    // ---- scores ----
    const scores = {};
    PILLARS.forEach(([k]) => { scores[k] = 100; });
    F.forEach((f) => { if (f.positive) return; scores[f.pillar] -= W[f.sev]; if (f.also) scores[f.also] -= Math.round(W[f.sev] / 2); });
    if (!has("cloudwatch") && N.length) scores.ops -= 0;
    Object.keys(scores).forEach((k) => { scores[k] = Math.max(0, Math.min(100, scores[k])); });
    const empty = N.length === 0;
    const overall = empty ? null : Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 6);
    const order = { crit: 0, high: 1, med: 2, low: 3, info: 4 };
    F.sort((a, b) => order[a.sev] - order[b.sev]);
    return { findings: F, scores: empty ? null : scores, overall };
  }
  window.AD = window.AD || {};
  Object.assign(window.AD, { analyze, PILLARS });
})();
