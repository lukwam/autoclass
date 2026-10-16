"""Regenerate docs/prices.json from the Cloud Billing Catalog API.

    python scripts/update_prices.py            # uses `gcloud auth print-access-token`
    BILLING_API_KEY=... python scripts/update_prices.py

Prices are list prices in USD for regional and multi-region buckets. The
`updated` date only changes when a price does, so a scheduled run that finds
nothing new leaves the file untouched.
"""

import datetime
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

CLOUD_STORAGE_SERVICE = "services/95FF-2EF5-5EA1"
OUTPUT = Path(__file__).resolve().parent.parent / "docs" / "prices.json"
CLASSES = ("Standard", "Nearline", "Coldline", "Archive")

# "Autoclass Nearline Storage Iowa" / "Autoclass Nearline Storage US Multi-region"
AUTOCLASS_RE = re.compile(rf"^Autoclass ({'|'.join(CLASSES)}) Storage (.+)$")
CLASS_A_RE = re.compile(r"^(Regional|Multi-Region) Autoclass Standard Class A Operations$")


def fetch_skus() -> list[dict]:
    """Return every Cloud Storage SKU."""
    headers = {}
    params = {"currencyCode": "USD", "pageSize": "5000"}
    if key := os.environ.get("BILLING_API_KEY"):
        params["key"] = key
    else:
        token = subprocess.run(
            ["gcloud", "auth", "print-access-token"], check=True, capture_output=True, text=True
        ).stdout.strip()
        headers["Authorization"] = f"Bearer {token}"

    skus: list[dict] = []
    while True:
        url = f"https://cloudbilling.googleapis.com/v1/{CLOUD_STORAGE_SERVICE}/skus?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as response:
            page = json.load(response)
        skus.extend(page.get("skus", []))
        if not page.get("nextPageToken"):
            return skus
        params["pageToken"] = page["nextPageToken"]


def unit_price(sku: dict) -> float:
    """The price of the highest tier (past any free tier) in USD per usage unit."""
    price = sku["pricingInfo"][0]["pricingExpression"]["tieredRates"][-1]["unitPrice"]
    return int(price.get("units", 0)) + price.get("nanos", 0) / 1e9


def build(skus: list[dict]) -> dict:
    """Assemble per-location storage prices and per-location-type operation prices.

    Autoclass Standard storage costs the same as regular Standard storage, so
    it doubles as the price of the bucket without Autoclass.
    """
    locations: dict[str, dict] = {}
    class_a: dict[str, float] = {}

    for sku in skus:
        description = sku["description"]
        regions = sku.get("serviceRegions", [])
        if match := AUTOCLASS_RE.match(description):
            storage_class, name = match.groups()
            if "Dual-region" in name or len(regions) != 1:
                continue
            multi = name.endswith("Multi-region")
            location = locations.setdefault(
                regions[0],
                {"name": name.removesuffix(" Multi-region"), "type": "multi-region" if multi else "region"},
            )
            location.setdefault("autoclass", {})[storage_class.lower()] = unit_price(sku)
        elif match := CLASS_A_RE.match(description):
            class_a["multi-region" if match.group(1) == "Multi-Region" else "region"] = unit_price(sku)

    complete = {
        location_id: {"name": location["name"], "type": location["type"]}
        | {storage_class.lower(): location["autoclass"][storage_class.lower()] for storage_class in CLASSES}
        for location_id, location in locations.items()
        if len(location.get("autoclass", {})) == len(CLASSES)
    }
    return {
        "updated": datetime.date.today().isoformat(),
        "currency": "USD",
        "management_fee_per_1000_objects": 0.0025,  # per 30 days; not exposed precisely by the catalog API
        "class_a_per_operation": class_a,
        "locations": dict(sorted(complete.items(), key=lambda item: (item[1]["type"], item[0]))),
    }


def main() -> None:
    prices = build(fetch_skus())
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text())
        if {**previous, "updated": None} == {**prices, "updated": None}:
            print(f"Prices unchanged since {previous['updated']}")
            return
    OUTPUT.write_text(json.dumps(prices, indent=2) + "\n")
    print(f"Wrote {len(prices['locations'])} locations to {OUTPUT}")


if __name__ == "__main__":
    main()
