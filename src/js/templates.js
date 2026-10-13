/* Architect's Desk · starter templates (coordinates in world units, grid = 20). */
(function () {
  let seq = 0;
  function T(build) {
    return function () {
      seq = 0; const nodes = [], edges = [];
      const ids = {};
      const mk = (key, type, x, y, props, label, w, h) => {
        const def = AD.CATALOG[type]; const p = {};
        def.props.forEach((d) => { p[d.k] = d.def; });
        Object.assign(p, props || {});
        const n = { id: "n" + (++seq), type, x, y, label: label || def.name, props: p };
        if (def.container) { n.w = w || def.w; n.h = h || def.h; }
        nodes.push(n); ids[key] = n.id; return n;
      };
      const ln = (a, b) => edges.push({ id: "e" + (++seq), from: ids[a], to: ids[b] });
      const meta = build(mk, ln);
      return { v: 1, title: meta.title, template: meta.key, nodes, edges };
    };
  }
  // shared two-AZ VPC skeleton
  function vpc2(mk, x, y, opt) {
    opt = opt || {};
    mk("vpc", "vpc", x, y, {}, opt.vpcLabel || "VPC 10.0.0.0/16", 840, 720);
    const rows = opt.rows || [["public", "Public subnet"], ["private", "Private app subnet"], ["private", "Private data subnet"]];
    ["a", "b"].forEach((z, i) => {
      const ax = x + 120 + i * 360;
      mk("az" + z, "az", ax, y + 120, { zone: z }, "Availability Zone us-east-1" + z, 340, 580);
      rows.forEach((r, j) => mk("sn" + z + j, "subnet", ax + 20, y + 170 + j * 175, { tier: r[0] }, r[1], 300, 155));
    });
  }
  const TEMPLATES = {
    threeTier: { name: "3-tier web app", blurb: "ALB, Auto Scaling app tier, RDS and a cache across two AZs", make: T((mk, ln) => {
      mk("users", "users", 20, 400, {}, "Users");
      mk("r53", "route53", 180, 240, {}, "Route 53");
      mk("cf", "cloudfront", 180, 400, { gbOut: 300 }, "CloudFront");
      mk("waf", "waf", 180, 560, {}, "WAF");
      vpc2(mk, 340, 40);
      mk("igw", "igw", 360, 400, {}, "Internet gateway");
      mk("alb", "alb", 700, 80, { lcu: 3 }, "Public ALB");
      mk("nat", "nat", 620, 255, { az: "a", gb: 150 }, "NAT gateway");
      mk("asg", "asg", 520, 425, { azs: 2, count: 4, itype: "m7i.large" }, "App tier ASG");
      mk("rds", "rds", 520, 600, { az: "a", multiAz: false, cls: "db.r7g.large", gb: 200 }, "Orders DB");
      mk("cache", "elasticache", 640, 600, { az: "a" }, "Session cache");
      mk("s3", "s3", 1220, 240, { gb: 500 }, "Assets bucket");
      mk("sec", "secrets", 1220, 400, {}, "Secrets");
      mk("cw", "cloudwatch", 1220, 560, {}, "CloudWatch");
      ln("users", "r53"); ln("users", "cf"); ln("waf", "cf"); ln("cf", "alb"); ln("cf", "s3"); ln("igw", "alb");
      ln("alb", "asg"); ln("asg", "rds"); ln("asg", "cache"); ln("asg", "nat"); ln("asg", "sec");
      return { key: "threeTier", title: "3-tier web app" };
    }) },
    serverless: { name: "Serverless API", blurb: "API Gateway, Lambda, DynamoDB and an async worker queue", make: T((mk, ln) => {
      mk("users", "users", 40, 280, {}, "Clients");
      mk("r53", "route53", 220, 120, {}, "Route 53");
      mk("api", "apigw", 220, 280, { kind: "HTTP", reqM: 20 }, "HTTP API");
      mk("fn", "lambda", 420, 280, { reqM: 20, ms: 90, mem: 512 }, "API handler");
      mk("ddb", "dynamodb", 620, 160, { pitr: false, writeM: 8, readM: 40 }, "Orders table");
      mk("q", "sqs", 620, 400, { reqM: 12 }, "Jobs queue");
      mk("worker", "lambda", 820, 400, { reqM: 4, ms: 800, mem: 1024 }, "Worker");
      mk("sns", "sns", 1020, 400, {}, "Notifications");
      mk("cw", "cloudwatch", 820, 160, { metrics: 10, alarms: 8, logsGb: 15 }, "CloudWatch");
      ln("users", "r53"); ln("users", "api"); ln("api", "fn"); ln("fn", "ddb"); ln("fn", "q"); ln("q", "worker"); ln("worker", "sns"); ln("worker", "ddb");
      return { key: "serverless", title: "Serverless API" };
    }) },
    staticSite: { name: "Static site (CloudFront + S3)", blurb: "The norselabs.net pattern: private S3 origin behind CloudFront", make: T((mk, ln) => {
      mk("users", "users", 40, 260, {}, "Visitors");
      mk("r53", "route53", 240, 100, { queriesM: 2 }, "Route 53");
      mk("cf", "cloudfront", 240, 260, { gbOut: 100, reqM: 5 }, "CloudFront");
      mk("waf", "waf", 240, 420, { rules: 3, reqM: 5 }, "WAF");
      mk("s3", "s3", 460, 260, { gb: 5, putK: 5, getM: 0.5 }, "Site bucket (private)");
      ln("users", "r53"); ln("users", "cf"); ln("waf", "cf"); ln("cf", "s3");
      return { key: "staticSite", title: "Static site" };
    }) },
    microservices: { name: "Containerized microservices", blurb: "ECS Fargate services, Aurora, events and a cache", make: T((mk, ln) => {
      mk("users", "users", 20, 400, {}, "Users");
      mk("r53", "route53", 180, 240, {}, "Route 53");
      mk("cf", "cloudfront", 180, 400, {}, "CloudFront");
      mk("waf", "waf", 180, 560, {}, "WAF");
      vpc2(mk, 340, 40, { rows: [["public", "Public subnet"], ["private", "Private service subnet"], ["private", "Private data subnet"]] });
      mk("igw", "igw", 360, 400, {}, "Internet gateway");
      mk("alb", "alb", 700, 80, { lcu: 4 }, "Public ALB");
      mk("nata", "nat", 620, 255, { az: "a", gb: 120 }, "NAT gateway a");
      mk("natb", "nat", 960, 255, { az: "b", gb: 120 }, "NAT gateway b");
      mk("orders", "ecs", 490, 430, { tasks: 4, vcpu: 1, mem: 2 }, "orders svc");
      mk("catalog", "ecs", 650, 430, { tasks: 2, vcpu: 0.5, mem: 1 }, "catalog svc");
      mk("pay", "ecs", 880, 430, { tasks: 2, vcpu: 1, mem: 2 }, "payments svc");
      mk("db", "aurora", 520, 600, { instances: 2 }, "Aurora cluster");
      mk("cache", "elasticache", 880, 600, { az: "b" }, "Cache");
      mk("bus", "eventbridge", 1220, 240, {}, "Event bus");
      mk("q", "sqs", 1220, 400, {}, "Payments queue");
      mk("sec", "secrets", 1220, 560, { secrets: 6 }, "Secrets");
      mk("kms", "kms", 1380, 560, {}, "KMS");
      mk("cw", "cloudwatch", 1380, 400, { metrics: 40, alarms: 20, logsGb: 50 }, "CloudWatch");
      ln("users", "r53"); ln("users", "cf"); ln("waf", "cf"); ln("cf", "alb"); ln("igw", "alb");
      ln("alb", "orders"); ln("alb", "catalog"); ln("alb", "pay"); ln("orders", "db"); ln("catalog", "cache"); ln("catalog", "db");
      ln("orders", "bus"); ln("bus", "q"); ln("q", "pay"); ln("pay", "sec"); ln("db", "kms");
      return { key: "microservices", title: "Containerized microservices" };
    }) },
    pipeline: { name: "Data pipeline", blurb: "S3 landing zone, EventBridge, Lambda transforms and DynamoDB", make: T((mk, ln) => {
      mk("raw", "s3", 40, 240, { gb: 2000, putK: 3000, getM: 3 }, "Raw landing bucket");
      mk("bus", "eventbridge", 240, 240, { eventsM: 3 }, "Object-created events");
      mk("q", "sqs", 440, 240, { reqM: 9, dlq: false }, "Ingest queue");
      mk("tx", "lambda", 640, 240, { reqM: 3, ms: 1500, mem: 2048 }, "Transform");
      mk("cur", "s3", 840, 120, { gb: 800, putK: 3000 }, "Curated bucket");
      mk("ddb", "dynamodb", 840, 360, { writeM: 3, readM: 10, gb: 60 }, "Catalog table");
      mk("kms", "kms", 640, 440, { keys: 1, reqM: 6 }, "Data key");
      mk("cw", "cloudwatch", 440, 440, { metrics: 10, alarms: 6, logsGb: 30 }, "CloudWatch");
      ln("raw", "bus"); ln("bus", "q"); ln("q", "tx"); ln("tx", "cur"); ln("tx", "ddb"); ln("tx", "kms");
      return { key: "pipeline", title: "Data pipeline" };
    }) },
    blank: { name: "Blank canvas", blurb: "Start from scratch", make: () => ({ v: 1, title: "Untitled architecture", template: "blank", nodes: [], edges: [] }) }
  };
  window.AD = window.AD || {};
  window.AD.TEMPLATES = TEMPLATES;
})();
