/* Architect's Desk · monthly cost model (on-demand, 730 h). Prices come from data/regions/<region>.json.
   A null price means the Price List has no on-demand price for it in that region: the line is marked
   unavailable (never priced with another region's rate). */
(function () {
  const H = 730;
  const n = (v) => (isFinite(+v) ? +v : 0);
  const fmt = (v) => { if (v == null) return "n/a"; const s = v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toPrecision(3); return "$" + (+s).toString(); };
  const perM = (v) => (v == null ? "n/a" : fmt(v * 1e6) + "/M");
  const perK = (v) => (v == null ? "n/a" : fmt(v * 1e3) + "/1K");
  let REGION = "this region";
  function line(label, qty, price, basis) {
    if (price == null) return { label, amount: 0, na: true, basis: "Not available in " + REGION };
    return { label, amount: Math.max(0, qty * price), basis };
  }
  function cost(node, P) {
    const p = node.props || {};
    REGION = (P.meta && P.meta.region) || "this region";
    switch (node.type) {
      case "route53": return [
        line("Hosted zones", n(p.zones), P.r53ZoneMo, `${n(p.zones)} × ${fmt(P.r53ZoneMo)}/zone-mo`),
        line("Standard queries", n(p.queriesM) * 1e6, P.r53Query, `${n(p.queriesM)}M × ${perM(P.r53Query)}`)];
      case "cloudfront": return [
        line("Data out (US/EU/CA)", n(p.gbOut), P.cfDtoGb, `${n(p.gbOut)} GB × ${fmt(P.cfDtoGb)}/GB (first 10 TB tier)`),
        line("HTTPS requests", n(p.reqM) * 1e6, P.cfHttpsReq, `${n(p.reqM)}M × ${perM(P.cfHttpsReq)}`)];
      case "waf": return [
        line("Web ACL", 1, P.wafAclMo, `1 × ${fmt(P.wafAclMo)}/mo`),
        line("Rules", n(p.rules), P.wafRuleMo, `${n(p.rules)} × ${fmt(P.wafRuleMo)}/mo`),
        line("Requests", n(p.reqM) * 1e6, P.wafReq, `${n(p.reqM)}M × ${perM(P.wafReq)}`)];
      case "nat": return [
        line("NAT gateway hours", H, P.natHr, `730 h × ${fmt(P.natHr)}/h`),
        line("Data processed", n(p.gb), P.natGb, `${n(p.gb)} GB × ${fmt(P.natGb)}/GB`)];
      case "alb": {
        const r = [line("ALB hours", H, P.albHr, `730 h × ${fmt(P.albHr)}/h`),
          line("LCU hours", n(p.lcu) * H, P.albLcuHr, `${n(p.lcu)} LCU × 730 h × ${fmt(P.albLcuHr)}`)];
        if (p.public) r.push(line("Data out to internet", n(p.gbOut), P.dtoInternetGb, `${n(p.gbOut)} GB × ${fmt(P.dtoInternetGb)}/GB (first paid tier)`));
        return r; }
      case "nlb": return [
        line("NLB hours", H, P.nlbHr, `730 h × ${fmt(P.nlbHr)}/h`),
        line("NLCU hours", n(p.lcu) * H, P.nlbLcuHr, `${n(p.lcu)} NLCU × 730 h × ${fmt(P.nlbLcuHr)}`)];
      case "ec2": case "asg": case "eks": {
        const c = n(p.count), hr = P.ec2[p.itype];
        const r = [];
        if (node.type === "eks") r.push(line("EKS control plane", H, P.eksClusterHr, `730 h × ${fmt(P.eksClusterHr)}/h (standard support)`));
        r.push(line(`${p.itype} × ${c}`, c * H, hr, `${c} × 730 h × ${fmt(hr)}/h Linux on-demand`));
        r.push(line("EBS gp3", c * n(p.ebs), P.ebsGp3GbMo, `${c} × ${n(p.ebs)} GB × ${fmt(P.ebsGp3GbMo)}/GB-mo`));
        if (p.publicIp) r.push(line("Public IPv4", c * H, P.publicIpv4Hr, `${c} × 730 h × ${fmt(P.publicIpv4Hr)}/h`));
        return r; }
      case "ecs": {
        const t = n(p.tasks);
        return [line("Fargate vCPU", t * n(p.vcpu) * H, P.fargateVcpuHr, `${t} tasks × ${p.vcpu} vCPU × 730 h × ${fmt(P.fargateVcpuHr)}`),
          line("Fargate memory", t * n(p.mem) * H, P.fargateGbHr, `${t} tasks × ${p.mem} GB × 730 h × ${fmt(P.fargateGbHr)}`)]; }
      case "lambda": {
        const gbs = n(p.reqM) * 1e6 * (n(p.ms) / 1000) * (n(p.mem) / 1024);
        return [line("Requests", n(p.reqM) * 1e6, P.lambdaReq, `${n(p.reqM)}M × ${perM(P.lambdaReq)}`),
          line("Compute (x86)", gbs, P.lambdaGbSec, `${Math.round(gbs).toLocaleString()} GB-s × ${fmt(P.lambdaGbSec)}`)]; }
      case "apigw": {
        const pr = p.kind === "REST" ? P.apigwRestReq : P.apigwHttpReq;
        return [line(`${p.kind} API requests`, n(p.reqM) * 1e6, pr, `${n(p.reqM)}M × ${perM(pr)} (first tier)`)]; }
      case "s3": return [
        line("Standard storage", n(p.gb), P.s3StdGbMo, `${n(p.gb)} GB × ${fmt(P.s3StdGbMo)}/GB-mo`),
        line("PUT/LIST requests", n(p.putK) * 1e3, P.s3PutReq, `${n(p.putK)}K × ${perK(P.s3PutReq)}`),
        line("GET requests", n(p.getM) * 1e6, P.s3GetReq, `${n(p.getM)}M × ${perK(P.s3GetReq)}`)];
      case "rds": {
        const tbl = (P.rds[p.engine] || {})[p.cls] || [null, null], m = p.multiAz ? 1 : 0;
        return [line(`${p.cls} ${p.multiAz ? "Multi-AZ" : "Single-AZ"}`, H, tbl[m], `730 h × ${fmt(tbl[m])}/h ${p.engine}`),
          line("gp3 storage", n(p.gb), P.rdsGp3GbMo[m], `${n(p.gb)} GB × ${fmt(P.rdsGp3GbMo[m])}/GB-mo`),
          { label: "Backup storage", amount: 0, basis: `Free up to 100% of provisioned storage; beyond that ${fmt(P.rdsBackupGbMo)}/GB-mo` }]; }
      case "aurora": {
        const hr = P.aurora[p.cls], k = n(p.instances);
        return [line(`${p.cls} × ${k}`, k * H, hr, `${k} × 730 h × ${fmt(hr)}/h (Aurora Standard)`),
          line("Storage", n(p.gb), P.auroraGbMo, `${n(p.gb)} GB × ${fmt(P.auroraGbMo)}/GB-mo`),
          line("I/O requests", n(p.ioM) * 1e6, P.auroraIoReq, `${n(p.ioM)}M × ${perM(P.auroraIoReq)}`)]; }
      case "dynamodb": {
        const r = [line("Write request units", n(p.writeM) * 1e6, P.ddbWrite, `${n(p.writeM)}M × ${perM(P.ddbWrite)}`),
          line("Read request units", n(p.readM) * 1e6, P.ddbRead, `${n(p.readM)}M × ${perM(P.ddbRead)}`),
          line("Storage", Math.max(0, n(p.gb) - 25), P.ddbGbMo, `${n(p.gb)} GB, first 25 GB free, then ${fmt(P.ddbGbMo)}/GB-mo`)];
        if (p.pitr) r.push(line("PITR backup", n(p.gb), P.ddbPitrGbMo, `${n(p.gb)} GB × ${fmt(P.ddbPitrGbMo)}/GB-mo`));
        return r; }
      case "elasticache": {
        const hr = P.cacheValkey[p.ntype];
        return [line(`${p.ntype} × ${n(p.nodes)}`, n(p.nodes) * H, hr, `${n(p.nodes)} × 730 h × ${fmt(hr)}/h (Valkey)`)]; }
      case "sqs": return [line("Requests", n(p.reqM) * 1e6, P.sqsReq, `${n(p.reqM)}M × ${perM(P.sqsReq)} (first 1M/mo free not deducted)`)];
      case "sns": return [line("Publish requests", n(p.reqM) * 1e6, P.snsReq, `${n(p.reqM)}M × ${perM(P.snsReq)} (first 1M free not deducted)`)];
      case "eventbridge": return [line("Custom events", n(p.eventsM) * 1e6, P.ebEvent, `${n(p.eventsM)}M × ${perM(P.ebEvent)}`)];
      case "kms": return [line("Customer managed keys", n(p.keys), P.kmsKeyMo, `${n(p.keys)} × ${fmt(P.kmsKeyMo)}/mo`),
        line("API requests", n(p.reqM) * 1e6, P.kmsReq, `${n(p.reqM)}M × ${perM(P.kmsReq)}`)];
      case "secrets": return [line("Secrets", n(p.secrets), P.secretMo, `${n(p.secrets)} × ${fmt(P.secretMo)}/mo`),
        line("API calls", n(p.callsK) * 1e3, P.secretReq, `${n(p.callsK)}K × ${perK(P.secretReq)}`)];
      case "cloudwatch": return [line("Custom metrics", n(p.metrics), P.cwMetricMo, `${n(p.metrics)} × ${fmt(P.cwMetricMo)}/metric-mo`),
        line("Alarms", n(p.alarms), P.cwAlarmMo, `${n(p.alarms)} × ${fmt(P.cwAlarmMo)} (standard)`),
        line("Log ingestion", n(p.logsGb), P.cwLogsIngestGb, `${n(p.logsGb)} GB × ${fmt(P.cwLogsIngestGb)}/GB`),
        line("Log storage", n(p.logsStoreGb), P.cwLogsStoreGbMo, `${n(p.logsStoreGb)} GB × ${fmt(P.cwLogsStoreGbMo)}/GB-mo`)];
      default: return [];
    }
  }
  function total(lines) { return lines.reduce((s, l) => s + l.amount, 0); }
  function unavailable(lines) { return lines.filter((l) => l.na); }
  window.AD = window.AD || {};
  Object.assign(window.AD, { cost, costTotal: total, costUnavailable: unavailable, fmtPrice: fmt });
})();
