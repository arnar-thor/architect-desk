"""Build src/data/regions/<code>.json (+ index.json) from pricing/regions/*.json (regional CSV extracts)
and the global CloudFront / Route 53 offers."""
import json, glob, os, csv, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
FETCHED = datetime.date.today().isoformat()
OUT = os.path.join(HERE, "..", "src", "data", "regions"); os.makedirs(OUT, exist_ok=True)
for f in glob.glob(OUT + "/*.json"): os.remove(f)
EC2T = ["t3.micro","t3.small","t3.medium","t3.large","t4g.small","t4g.medium","m6i.large","m6i.xlarge","m7i.large","m7i.xlarge","m7g.large","c7i.large","c7i.xlarge","r7i.large","r7i.xlarge"]
RDST = ["db.t3.micro","db.t3.medium","db.t4g.medium","db.m6g.large","db.m7g.large","db.r6g.large","db.r7g.large","db.r6g.xlarge"]
AURT = ["db.t3.medium","db.t4g.medium","db.r6g.large","db.r7g.large","db.r6g.xlarge"]
CACHET = ["cache.t4g.micro","cache.t4g.small","cache.t4g.medium","cache.m7g.large","cache.r7g.large"]
SCAL = ["ebsGp3GbMo","publicIpv4Hr","natHr","natGb","albHr","albLcuHr","nlbHr","nlbLcuHr","dtoInternetGb","fargateVcpuHr","fargateGbHr","eksClusterHr","lambdaReq","lambdaGbSec","apigwHttpReq","apigwRestReq","s3StdGbMo","s3PutReq","s3GetReq","rdsBackupGbMo","auroraGbMo","auroraIoReq","ddbWrite","ddbRead","ddbGbMo","ddbPitrGbMo","sqsReq","snsReq","ebEvent","wafAclMo","wafRuleMo","wafReq","kmsKeyMo","kmsReq","secretMo","secretReq","cwMetricMo","cwAlarmMo","cwLogsIngestGb","cwLogsStoreGbMo"]
# global offers (download with ./fetch_global_offers.sh): CloudFront first-10TB US/EU rate and HTTPS requests; Route 53 hosted zone + standard queries
cfPub = json.load(open("AmazonCloudFront.json"))["publicationDate"]; r53 = json.load(open("Route53Global.json"))
r53Pub = r53["publicationDate"]
govQ = {}
od = r53["terms"]["OnDemand"]
for sku, p in r53["products"].items():
    ut = p["attributes"].get("usagetype", "")
    for code, pre in (("us-gov-east-1", "UGE1-"), ("us-gov-west-1", "UGW1-")):
        if ut == pre + "Standard-Queries":
            for t in od[sku].values():
                for d in t["priceDimensions"].values():
                    if d["beginRange"] == "0": govQ[code] = float(d["pricePerUnit"]["USD"])
index = []
for f in sorted(glob.glob("regions/*.json")):
    d = json.load(open(f)); R = d["region"]; p = d["p"]; gov = R.startswith("us-gov-")
    g = lambda k: p.get(k)
    o = {"meta": {"region": R, "name": d["name"], "partition": "aws-us-gov" if gov else "aws", "currency": "USD", "hoursPerMonth": 730, "fetched": FETCHED,
                  "source": "AWS Price List Bulk API regional CSV offer files (pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<service>/current/%s/index.csv), on-demand terms" % R,
                  "offerPublicationDates": dict(d["pub"]), "notes": {}, "unavailable": {}},
         "ec2": {t: g("ec2." + t) for t in EC2T},
         "rds": {e: {c: [g("rds.%s.%s.0" % (e, c)), g("rds.%s.%s.1" % (e, c))] for c in RDST} for e in ("MySQL", "PostgreSQL")},
         "rdsGp3GbMo": [g("rdsGp3.0"), g("rdsGp3.1")],
         "aurora": {c: g("aurora." + c) for c in AURT},
         "cacheValkey": {c: g("cache." + c) for c in CACHET}}
    for k in SCAL: o[k] = g(k)
    if gov:
        o["cfDtoGb"] = o["cfHttpsReq"] = None
        o["meta"]["unavailable"]["cloudfront"] = "Amazon CloudFront is not offered in AWS GovCloud (US); the Price List has no GovCloud CloudFront offer."
    else:
        o["cfDtoGb"], o["cfHttpsReq"] = 0.085, 0.000001
        o["meta"]["offerPublicationDates"]["AmazonCloudFront"] = cfPub
        o["meta"]["notes"]["cloudfront"] = "CloudFront is global: priced by viewer location (US/Canada/Europe first-10 TB rate), the same whichever region the origin is in."
    o["r53ZoneMo"] = 0.50
    o["r53Query"] = govQ[R] if gov else 0.0000004
    o["meta"]["offerPublicationDates"]["AmazonRoute53"] = r53Pub
    o["meta"]["notes"]["route53"] = ("Hosted-zone fee is Route 53's global rate (the Price List has no GovCloud-specific hosted-zone price); queries use the GovCloud standard-query rate." if gov
                                    else "Route 53 is global: same hosted-zone and query rates in every commercial region.")
    missing = [k for k in SCAL if o[k] is None]
    if missing: o["meta"]["missingKeys"] = missing
    json.dump(o, open(f"{OUT}/{R}.json", "w"), separators=(",", ":"))
    index.append({"code": R, "name": d["name"], "gov": gov})
order = lambda r: (r["gov"], r["code"])
index.sort(key=order)
json.dump({"fetched": FETCHED, "default": "us-east-1", "regions": index}, open(f"{OUT}/index.json", "w"), separators=(",", ":"))
print(len(index), "regions;", sum(os.path.getsize(x) for x in glob.glob(OUT + "/*.json")), "bytes")
