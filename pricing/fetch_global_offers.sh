#!/usr/bin/env bash
# Download the two global AWS Price List offers make_regions.py reads (CloudFront publication date; Route 53 GovCloud query rates).
# Saved next to this script as AmazonCloudFront.json and Route53Global.json (git-ignored; ~1 MB together).
set -euo pipefail
cd "$(dirname "$0")"
B=https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws
curl -fsSL -o AmazonCloudFront.json "$B/AmazonCloudFront/current/index.json"
curl -fsSL -o Route53Global.json "$B/AmazonRoute53/current/index.json"
python3 -c "import json;[print(f, json.load(open(f))['publicationDate']) for f in ('AmazonCloudFront.json','Route53Global.json')]"
