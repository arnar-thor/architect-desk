"""Stream AWS Price List regional CSV offer files for one region and extract the Architect's Desk price keys.
usage: extract_region.py <region-code>  -> writes regions/<region>.json"""
import csv, io, json, os, re, sys, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1]
BASE = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/%s/current/%s/index.csv"
PFX = re.compile(r'^(?:USE\d|USW\d|UG[EW]\d|EU|EU[CWNS]\d|AP[NSE]\d|AFS\d|CA[NW]\d|SAE\d|ME[SC]\d|ILC\d|MXC\d|[a-z]{2}(?:-gov)?-[a-z]+-\d)-')
EC2T = ["t3.micro","t3.small","t3.medium","t3.large","t4g.small","t4g.medium","m6i.large","m6i.xlarge","m7i.large","m7i.xlarge","m7g.large","c7i.large","c7i.xlarge","r7i.large","r7i.xlarge"]
RDST = ["db.t3.micro","db.t3.medium","db.t4g.medium","db.m6g.large","db.m7g.large","db.r6g.large","db.r7g.large","db.r6g.xlarge"]
AURT = ["db.t3.medium","db.t4g.medium","db.r6g.large","db.r7g.large","db.r6g.xlarge"]
CACHET = ["cache.t4g.micro","cache.t4g.small","cache.t4g.medium","cache.m7g.large","cache.r7g.large"]
out = {"region": R, "pub": {}, "missingServices": []}
cand = {}   # key -> list of (beginRange, price)
def put(k, row): cand.setdefault(k, []).append((float(row["StartingRange"] or 0), float(row["PricePerUnit"])))
def rows(svc):
    try: resp = urllib.request.urlopen(BASE % (svc, R), timeout=600)
    except urllib.error.HTTPError as e:
        if e.code in (403, 404): out["missingServices"].append(svc); return
        raise
    f = io.TextIOWrapper(resp, encoding="utf-8")
    for i in range(5):
        line = next(f)
        if line.startswith('"Publication Date"'): out["pub"][svc] = line.split(",")[1].strip().strip('"')
    for row in csv.DictReader(f):
        if row.get("TermType") != "OnDemand": continue
        if row.get("Region Code") and row["Region Code"] != R: continue
        row["ut"] = PFX.sub("", row.get("usageType", ""))
        if svc == "AmazonEC2" and "name" not in out and row.get("Location Type") == "AWS Region": out["name"] = row["Location"]
        yield row

for r in rows("AmazonEC2"):
    ut, it = r["ut"], r.get("Instance Type", "")
    if ut.startswith("BoxUsage:") and it in EC2T and r.get("Operating System") == "Linux" and r.get("Tenancy") == "Shared" \
       and r.get("Pre Installed S/W") == "NA" and r.get("CapacityStatus") == "Used" and r.get("License Model") in ("No License required", ""):
        put("ec2." + it, r)
    elif ut == "EBS:VolumeUsage.gp3": put("ebsGp3GbMo", r)
    elif ut == "NatGateway-Hours": put("natHr", r)
    elif ut == "NatGateway-Bytes": put("natGb", r)
for r in rows("AmazonVPC"):
    if r["ut"] == "PublicIPv4:InUseAddress": put("publicIpv4Hr", r)
    elif r["ut"] == "NatGateway-Hours": put("natHr", r)
    elif r["ut"] == "NatGateway-Bytes": put("natGb", r)
for r in rows("AWSELB"):
    fam, ut = r["Product Family"], r["ut"]
    if fam == "Load Balancer-Application" and ut == "LoadBalancerUsage": put("albHr", r)
    if fam == "Load Balancer-Application" and ut == "LCUUsage": put("albLcuHr", r)
    if fam == "Load Balancer-Network" and ut == "LoadBalancerUsage": put("nlbHr", r)
    if fam == "Load Balancer-Network" and ut == "LCUUsage": put("nlbLcuHr", r)
for r in rows("AWSDataTransfer"):
    if r["ut"] == "DataTransfer-Out-Bytes": put("dtoInternetGb", r)
for r in rows("AmazonECS"):
    if r["ut"] == "Fargate-vCPU-Hours:perCPU": put("fargateVcpuHr", r)
    if r["ut"] == "Fargate-GB-Hours": put("fargateGbHr", r)
for r in rows("AmazonEKS"):
    if r["ut"] == "AmazonEKS-Hours:perCluster": put("eksClusterHr", r)
for r in rows("AWSLambda"):
    if r["ut"] == "Request": put("lambdaReq", r)
    if r["ut"] == "Lambda-GB-Second": put("lambdaGbSec", r)
for r in rows("AmazonApiGateway"):
    if r["ut"] == "ApiGatewayHttpRequest": put("apigwHttpReq", r)
    if r["ut"] == "ApiGatewayRequest": put("apigwRestReq", r)
for r in rows("AmazonS3"):
    if r["ut"] == "TimedStorage-ByteHrs": put("s3StdGbMo", r)
    if r["ut"] == "Requests-Tier1": put("s3PutReq", r)
    if r["ut"] == "Requests-Tier2": put("s3GetReq", r)
for r in rows("AmazonRDS"):
    ut, it, eng, dep = r["ut"], r.get("Instance Type", ""), r.get("Database Engine", ""), r.get("Deployment Option", "")
    if r["Product Family"] == "Database Instance" and "IOOptimized" not in ut and "ExtendedSupport" not in ut and ("InstanceUsage" in ut or "Multi-AZUsage" in ut):
        if eng in ("MySQL", "PostgreSQL") and it in RDST and dep in ("Single-AZ", "Multi-AZ"): put("rds.%s.%s.%d" % (eng, it, dep == "Multi-AZ"), r)
        if eng == "Aurora PostgreSQL" and it in AURT and ut.startswith("InstanceUsage:"): put("aurora." + it, r)
    if ut == "RDS:GP3-Storage" and eng == "MySQL": put("rdsGp3.0", r)
    if ut == "RDS:Multi-AZ-GP3-Storage" and eng == "MySQL": put("rdsGp3.1", r)
    if ut == "RDS:ChargedBackupUsage" and eng == "MySQL": put("rdsBackupGbMo", r)
    if ut == "Aurora:StorageUsage": put("auroraGbMo", r)
    if ut == "Aurora:StorageIOUsage": put("auroraIoReq", r)
for r in rows("AmazonDynamoDB"):
    m = {"WriteRequestUnits": "ddbWrite", "ReadRequestUnits": "ddbRead", "TimedStorage-ByteHrs": "ddbGbMo", "TimedPITRStorage-ByteHrs": "ddbPitrGbMo"}
    if r["ut"] in m: put(m[r["ut"]], r)
for r in rows("AmazonElastiCache"):
    it = r.get("Instance Type", "")
    if r["ut"] == "NodeUsage:" + it and it in CACHET and r.get("Cache Engine") == "Valkey": put("cache." + it, r)
for r in rows("AWSQueueService"):
    if r["ut"] in ("Requests-RBP", "Requests-Tier1") and re.search(r"standard requests (in )?tier ?1\b", r["PriceDescription"], re.I): put("sqsReq", r)
for r in rows("AmazonSNS"):
    if r["ut"] == "Requests-Tier1": put("snsReq", r)
for r in rows("AWSEvents"):
    if r["ut"] == "Event-64K-Chunks" and "custom" in r["PriceDescription"].lower(): put("ebEvent", r)
for r in rows("awswaf"):
    m = {"WebACLV2": "wafAclMo", "RuleV2": "wafRuleMo", "RequestV2-Tier1": "wafReq"}
    if r["ut"] in m: put(m[r["ut"]], r)
for r in rows("awskms"):
    if r["ut"] == "KMS-Keys": put("kmsKeyMo", r)
    if r["ut"] == "KMS-Requests": put("kmsReq", r)
for r in rows("AWSSecretsManager"):
    u = r["ut"].replace("-", "").rstrip("s")
    if u == "AWSSecretsManagerSecret": put("secretMo", r)
    if u == "AWSSecretsManagerAPIRequest": put("secretReq", r)
for r in rows("AmazonCloudWatch"):
    ut, d = r["ut"], r["PriceDescription"]
    if ut == "CW:MetricMonitorUsage": put("cwMetricMo", r)
    if ut == "CW:AlarmMonitorUsage": put("cwAlarmMo", r)
    dl = d.lower()
    if ut == "DataProcessing-Bytes" and "log data ingested" in dl and "infrequent" not in dl and "vended" not in dl: put("cwLogsIngestGb", r)
    if ut == "TimedStorage-ByteHrs" and ("log storage" in dl or "log data stored" in dl): put("cwLogsStoreGbMo", r)
# global services: availability per region from their region files
for svc, key in (("AmazonCloudFront", "cf"), ("AmazonRoute53", "r53")):
    try: urllib.request.urlopen(urllib.request.Request(BASE % (svc, R), method="HEAD"), timeout=60); out[key + "Available"] = True
    except urllib.error.HTTPError: out[key + "Available"] = False; out["missingServices"].append(svc)

# choose: first paid tier (lowest beginRange with price > 0); ddb storage = paid tier after free 25 GB
P = {}
for k, v in cand.items():
    paid = sorted([x for x in v if x[1] > 0])
    if not paid: continue
    P[k] = min(paid, key=lambda x: (x[0], -x[1]))[1] if k not in ("ddbGbMo", "snsReq") else max(x[1] for x in paid)
out["p"] = P
os.makedirs(os.path.join(HERE, "regions"), exist_ok=True)
json.dump(out, open(os.path.join(HERE, "regions", "%s.json" % R), "w"), separators=(",", ":"))
print(R, len(P), "keys; missing services:", out["missingServices"])
