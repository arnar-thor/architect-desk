/* Architect's Desk · component catalog. Original glyphs (24x24, stroke = currentColor). */
(function () {
  const G = {
    users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="16.5" cy="9" r="2.4"/><path d="M15.5 13.6c2.6-.3 4.6 1.3 5 4.4"/>',
    route53: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.6 2.4 2.6 13.6 0 16M12 4c-2.6 2.4-2.6 13.6 0 16"/>',
    cloudfront: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" stroke-dasharray="3 2.4"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>',
    waf: '<path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M8.5 12h7M12 8.5v7"/>',
    s3: '<ellipse cx="12" cy="6.5" rx="7" ry="2.5"/><path d="M5 6.5l1.6 11c.2 1.4 2.6 2.5 5.4 2.5s5.2-1.1 5.4-2.5L19 6.5"/><path d="M7.5 12c2.8 1 6.2 1 9 0"/>',
    igw: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M12 4v4"/>',
    nat: '<rect x="3.5" y="6" width="17" height="12" rx="3"/><path d="M8 12h8M13 9l3 3-3 3"/>',
    alb: '<circle cx="5.5" cy="12" r="2.2"/><circle cx="18.5" cy="6" r="2"/><circle cx="18.5" cy="12" r="2"/><circle cx="18.5" cy="18" r="2"/><path d="M7.7 12h8.8M7.4 10.8l9.2-4M7.4 13.2l9.2 4"/>',
    nlb: '<rect x="3.5" y="9.5" width="5" height="5" rx="1"/><path d="M8.5 12h4M12.5 6v12M12.5 6h4M12.5 12h4M12.5 18h4"/><rect x="16.5" y="4.5" width="3" height="3"/><rect x="16.5" y="10.5" width="3" height="3"/><rect x="16.5" y="16.5" width="3" height="3"/>',
    ec2: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3"/>',
    asg: '<rect x="3.5" y="7.5" width="8" height="8" rx="1.5"/><rect x="12.5" y="7.5" width="8" height="8" rx="1.5" stroke-dasharray="2 1.6"/><path d="M7.5 3.5h9M14 1.8l2.5 1.7L14 5.2M7.5 20.5h9M10 18.8l-2.5 1.7 2.5 1.7"/>',
    ecs: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    eks: '<path d="M12 3l7.5 3.8 1.8 8.1-5.2 6.4H7.9l-5.2-6.4 1.8-8.1z"/><circle cx="12" cy="12" r="2.6"/><path d="M12 6v3.4M12 14.6V18M6.9 9.2l2.9 1.6M17.1 9.2l-2.9 1.6M8 16.2l2.2-2.4M16 16.2l-2.2-2.4"/>',
    lambda: '<path d="M6 20l5.2-10.5L9 4.5H6M11.2 9.5L16 20h3"/>',
    apigw: '<path d="M8 5l-4 7 4 7M16 5l4 7-4 7"/><path d="M9.5 12h5M12 9.5v5"/>',
    rds: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>',
    aurora: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M12 10l1.2 2.6 2.6 1.2-2.6 1.2L12 17.6 10.8 15l-2.6-1.2 2.6-1.2z"/>',
    dynamodb: '<path d="M4 7.5L12 4l8 3.5-8 3.5z"/><path d="M4 12l8 3.5 8-3.5M4 16.5L12 20l8-3.5"/>',
    elasticache: '<path d="M13 3L6 13h5l-1 8 7-10h-5z"/>',
    sqs: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 10v4M10.5 10v4M14 10v4"/><path d="M17 12h2"/>',
    sns: '<circle cx="6" cy="12" r="2.4"/><path d="M8.4 12H13M13 12l5-5M13 12h6M13 12l5 5"/><circle cx="19" cy="6" r="1.4"/><circle cx="20" cy="12" r="1.4"/><circle cx="19" cy="18" r="1.4"/>',
    eventbridge: '<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    kms: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17.5 12v3.5M20.5 12v2.5"/><circle cx="8" cy="12" r="1.2"/>',
    secrets: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.6"/>',
    cloudwatch: '<path d="M3 18h18"/><path d="M5 15l4-5 4 3 6-7"/><circle cx="19" cy="6" r="1.5"/>',
    vpc: '<rect x="3.5" y="5" width="17" height="14" rx="2" stroke-dasharray="3 2"/><path d="M8 12h8"/>',
    az: '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="1.5 2.5"/><path d="M9 14.5l3-6 3 6M10 12.5h4"/>',
    subnet: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M3.5 10h17"/>'
  };

  const ec2Types = ["t3.micro","t3.small","t3.medium","t3.large","t4g.small","t4g.medium","m6i.large","m6i.xlarge","m7i.large","m7i.xlarge","m7g.large","c7i.large","c7i.xlarge","r7i.large","r7i.xlarge"];
  const rdsClasses = ["db.t3.micro","db.t3.medium","db.t4g.medium","db.m6g.large","db.m7g.large","db.r6g.large","db.r7g.large","db.r6g.xlarge"];
  const auroraClasses = ["db.t3.medium","db.t4g.medium","db.r6g.large","db.r7g.large","db.r6g.xlarge"];
  const cacheTypes = ["cache.t4g.micro","cache.t4g.small","cache.t4g.medium","cache.m7g.large","cache.r7g.large"];
  const AZ = { k: "az", label: "Availability Zone", type: "select", options: ["a", "b", "c"], def: "a", hint: "Set automatically when you drop it inside an AZ" };
  const AZS = { k: "azs", label: "Spread across AZs", type: "select", options: [1, 2, 3], def: 2 };

  // cat: edge | network | compute | data | integration | security | ops | group
  const C = {
    users:  { name: "Users", full: "Internet users", cat: "edge", glyph: "users", props: [], about: "Where traffic comes from. No AWS charge." },
    route53:{ name: "Route 53", full: "Amazon Route 53", cat: "edge", glyph: "route53", props: [
      { k: "zones", label: "Hosted zones", type: "num", def: 1, min: 0, max: 50 },
      { k: "queriesM", label: "DNS queries / month", type: "num", def: 5, unit: "M", min: 0, step: 1 } ] },
    cloudfront:{ name: "CloudFront", full: "Amazon CloudFront", cat: "edge", glyph: "cloudfront", props: [
      { k: "gbOut", label: "Data out to viewers", type: "num", def: 200, unit: "GB/mo", min: 0, step: 10 },
      { k: "reqM", label: "HTTPS requests", type: "num", def: 10, unit: "M/mo", min: 0, step: 1 } ] },
    waf:    { name: "WAF", full: "AWS WAF web ACL", cat: "security", glyph: "waf", props: [
      { k: "rules", label: "Rules / rule groups", type: "num", def: 5, min: 0, max: 100 },
      { k: "reqM", label: "Requests inspected", type: "num", def: 10, unit: "M/mo", min: 0 } ] },
    igw:    { name: "Internet GW", full: "Internet gateway", cat: "network", glyph: "igw", vpc: true, props: [], about: "No hourly charge. Data transfer out is billed where it leaves (load balancer or instance)." },
    nat:    { name: "NAT Gateway", full: "NAT gateway", cat: "network", glyph: "nat", vpc: true, props: [ AZ,
      { k: "gb", label: "Data processed", type: "num", def: 100, unit: "GB/mo", min: 0, step: 10 } ] },
    alb:    { name: "ALB", full: "Application Load Balancer", cat: "network", glyph: "alb", vpc: true, props: [
      { k: "public", label: "Internet-facing", type: "bool", def: true },
      { k: "lcu", label: "Avg LCUs", type: "num", def: 2, min: 0, step: 0.5 },
      { k: "gbOut", label: "Data out to internet", type: "num", def: 100, unit: "GB/mo", min: 0, step: 10 } ] },
    nlb:    { name: "NLB", full: "Network Load Balancer", cat: "network", glyph: "nlb", vpc: true, props: [
      { k: "public", label: "Internet-facing", type: "bool", def: false },
      { k: "lcu", label: "Avg NLCUs", type: "num", def: 1, min: 0, step: 0.5 } ] },
    ec2:    { name: "EC2", full: "Amazon EC2 instance", cat: "compute", glyph: "ec2", vpc: true, compute: true, props: [ AZ,
      { k: "itype", label: "Instance type", type: "select", options: ec2Types, def: "t3.medium" },
      { k: "count", label: "Instances", type: "num", def: 1, min: 1, max: 100 },
      { k: "ebs", label: "EBS gp3 per instance", type: "num", def: 30, unit: "GB", min: 0, step: 10 },
      { k: "ebsEnc", label: "EBS encrypted", type: "bool", def: true },
      { k: "publicIp", label: "Public IPv4", type: "bool", def: false },
      { k: "sshOpen", label: "SSH open to 0.0.0.0/0", type: "bool", def: false } ] },
    asg:    { name: "Auto Scaling", full: "EC2 Auto Scaling group", cat: "compute", glyph: "asg", vpc: true, compute: true, props: [ AZS,
      { k: "itype", label: "Instance type", type: "select", options: ec2Types, def: "m7i.large" },
      { k: "count", label: "Desired instances", type: "num", def: 2, min: 1, max: 200 },
      { k: "ebs", label: "EBS gp3 per instance", type: "num", def: 30, unit: "GB", min: 0, step: 10 },
      { k: "ebsEnc", label: "EBS encrypted", type: "bool", def: true },
      { k: "sshOpen", label: "SSH open to 0.0.0.0/0", type: "bool", def: false } ] },
    ecs:    { name: "ECS Fargate", full: "Amazon ECS service on Fargate", cat: "compute", glyph: "ecs", vpc: true, compute: true, props: [ AZS,
      { k: "tasks", label: "Running tasks", type: "num", def: 2, min: 1, max: 500 },
      { k: "vcpu", label: "vCPU per task", type: "select", options: [0.25, 0.5, 1, 2, 4], def: 0.5 },
      { k: "mem", label: "Memory per task", type: "select", options: [0.5, 1, 2, 4, 8, 16], def: 1, unit: "GB" } ] },
    eks:    { name: "EKS", full: "Amazon EKS cluster + managed nodes", cat: "compute", glyph: "eks", vpc: true, compute: true, props: [ AZS,
      { k: "itype", label: "Node type", type: "select", options: ec2Types, def: "m7i.large" },
      { k: "count", label: "Nodes", type: "num", def: 3, min: 1, max: 200 },
      { k: "ebs", label: "EBS gp3 per node", type: "num", def: 50, unit: "GB", min: 0, step: 10 } ] },
    lambda: { name: "Lambda", full: "AWS Lambda function", cat: "compute", glyph: "lambda", props: [
      { k: "reqM", label: "Invocations", type: "num", def: 5, unit: "M/mo", min: 0 },
      { k: "ms", label: "Avg duration", type: "num", def: 120, unit: "ms", min: 1, step: 10 },
      { k: "mem", label: "Memory", type: "select", options: [128, 256, 512, 1024, 2048, 4096], def: 512, unit: "MB" } ] },
    apigw:  { name: "API Gateway", full: "Amazon API Gateway", cat: "integration", glyph: "apigw", props: [
      { k: "kind", label: "API type", type: "select", options: ["HTTP", "REST"], def: "HTTP" },
      { k: "reqM", label: "Requests", type: "num", def: 5, unit: "M/mo", min: 0 } ] },
    s3:     { name: "S3", full: "Amazon S3 bucket (Standard)", cat: "data", glyph: "s3", props: [
      { k: "gb", label: "Storage", type: "num", def: 100, unit: "GB", min: 0, step: 10 },
      { k: "putK", label: "PUT/LIST requests", type: "num", def: 100, unit: "K/mo", min: 0, step: 10 },
      { k: "getM", label: "GET requests", type: "num", def: 1, unit: "M/mo", min: 0 },
      { k: "blockPublic", label: "Block Public Access", type: "bool", def: true },
      { k: "versioning", label: "Versioning", type: "bool", def: true } ] },
    rds:    { name: "RDS", full: "Amazon RDS database", cat: "data", glyph: "rds", vpc: true, props: [ AZ,
      { k: "engine", label: "Engine", type: "select", options: ["PostgreSQL", "MySQL"], def: "PostgreSQL" },
      { k: "cls", label: "Instance class", type: "select", options: rdsClasses, def: "db.m7g.large" },
      { k: "multiAz", label: "Multi-AZ (standby)", type: "bool", def: false },
      { k: "gb", label: "gp3 storage", type: "num", def: 100, unit: "GB", min: 20, step: 10 },
      { k: "backupDays", label: "Backup retention", type: "num", def: 7, unit: "days", min: 0, max: 35 },
      { k: "encrypted", label: "Encrypted at rest", type: "bool", def: true },
      { k: "public", label: "Publicly accessible", type: "bool", def: false } ] },
    aurora: { name: "Aurora", full: "Amazon Aurora cluster (Standard)", cat: "data", glyph: "aurora", vpc: true, props: [
      { k: "engine", label: "Engine", type: "select", options: ["PostgreSQL", "MySQL"], def: "PostgreSQL" },
      { k: "cls", label: "Instance class", type: "select", options: auroraClasses, def: "db.r7g.large" },
      { k: "instances", label: "Instances (writer + readers)", type: "num", def: 2, min: 1, max: 16 },
      { k: "gb", label: "Storage", type: "num", def: 100, unit: "GB", min: 1, step: 10 },
      { k: "ioM", label: "I/O requests", type: "num", def: 50, unit: "M/mo", min: 0, step: 5 },
      { k: "encrypted", label: "Encrypted at rest", type: "bool", def: true },
      { k: "public", label: "Publicly accessible", type: "bool", def: false } ] },
    dynamodb:{ name: "DynamoDB", full: "Amazon DynamoDB table (on-demand)", cat: "data", glyph: "dynamodb", props: [
      { k: "writeM", label: "Write request units", type: "num", def: 5, unit: "M/mo", min: 0 },
      { k: "readM", label: "Read request units", type: "num", def: 20, unit: "M/mo", min: 0 },
      { k: "gb", label: "Storage", type: "num", def: 10, unit: "GB", min: 0 },
      { k: "pitr", label: "Point-in-time recovery", type: "bool", def: true } ] },
    elasticache:{ name: "ElastiCache", full: "Amazon ElastiCache for Valkey (nodes)", cat: "data", glyph: "elasticache", vpc: true, props: [
      { k: "ntype", label: "Node type", type: "select", options: cacheTypes, def: "cache.t4g.medium" },
      { k: "nodes", label: "Nodes", type: "num", def: 2, min: 1, max: 20 },
      { k: "multiAz", label: "Multi-AZ with failover", type: "bool", def: true } ] },
    sqs:    { name: "SQS", full: "Amazon SQS standard queue", cat: "integration", glyph: "sqs", props: [
      { k: "reqM", label: "Requests", type: "num", def: 10, unit: "M/mo", min: 0 },
      { k: "dlq", label: "Dead-letter queue", type: "bool", def: true } ] },
    sns:    { name: "SNS", full: "Amazon SNS topic", cat: "integration", glyph: "sns", props: [
      { k: "reqM", label: "Publish requests", type: "num", def: 2, unit: "M/mo", min: 0 } ] },
    eventbridge:{ name: "EventBridge", full: "Amazon EventBridge bus", cat: "integration", glyph: "eventbridge", props: [
      { k: "eventsM", label: "Custom events", type: "num", def: 2, unit: "M/mo", min: 0 } ] },
    kms:    { name: "KMS", full: "AWS KMS customer managed keys", cat: "security", glyph: "kms", props: [
      { k: "keys", label: "Keys", type: "num", def: 2, min: 0 },
      { k: "reqM", label: "API requests", type: "num", def: 1, unit: "M/mo", min: 0 } ] },
    secrets:{ name: "Secrets Mgr", full: "AWS Secrets Manager", cat: "security", glyph: "secrets", props: [
      { k: "secrets", label: "Secrets", type: "num", def: 3, min: 0 },
      { k: "callsK", label: "API calls", type: "num", def: 100, unit: "K/mo", min: 0, step: 10 } ] },
    cloudwatch:{ name: "CloudWatch", full: "Amazon CloudWatch metrics, alarms and logs", cat: "ops", glyph: "cloudwatch", props: [
      { k: "metrics", label: "Custom metrics", type: "num", def: 20, min: 0 },
      { k: "alarms", label: "Alarms", type: "num", def: 10, min: 0 },
      { k: "logsGb", label: "Logs ingested", type: "num", def: 20, unit: "GB/mo", min: 0 },
      { k: "logsStoreGb", label: "Logs stored", type: "num", def: 60, unit: "GB", min: 0 } ] },
    vpc:    { name: "VPC", full: "Virtual Private Cloud", cat: "group", glyph: "vpc", container: 1, w: 860, h: 520, props: [
      { k: "cidr", label: "CIDR", type: "text", def: "10.0.0.0/16" },
      { k: "gwEndpoints", label: "S3/DynamoDB gateway endpoints", type: "bool", def: false } ] },
    az:     { name: "AZ", full: "Availability Zone", cat: "group", glyph: "az", container: 2, w: 380, h: 420, props: [
      { k: "zone", label: "Zone", type: "select", options: ["a", "b", "c"], def: "a" } ] },
    subnet: { name: "Subnet", full: "Subnet", cat: "group", glyph: "subnet", container: 3, w: 320, h: 150, props: [
      { k: "tier", label: "Type", type: "select", options: ["public", "private"], def: "private" } ] }
  };
  const CATS = [["edge", "Edge & DNS"], ["network", "Networking"], ["compute", "Compute"], ["data", "Data & storage"], ["integration", "Integration"], ["security", "Security"], ["ops", "Operations"], ["group", "Groups"]];
  window.AD = window.AD || {};
  Object.assign(window.AD, { GLYPHS: G, CATALOG: C, CATS });
})();
