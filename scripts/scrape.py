import requests
import boto3
import time
from datetime import datetime
from decimal import Decimal

YELP_API_KEY = "6icp3eLQdVmWy5050X-o7F8Wn5XQUyXc-A2ydT0jDb_j14yKet8saEahRcBh4b0mA_6nSm80K0AXmL2KCv060m0iLWvempMIcYb2hLscCW6Qko6qpc5iRRJ3f4SfaXYx"

HEADERS = {"Authorization": f"Bearer {YELP_API_KEY}"}
YELP_URL = "https://api.yelp.com/v3/businesses/search"
CUISINES = ["Chinese", "Italian", "Mexican", "Japanese", "Indian"]

def get_restaurants(cuisine, total=200):
    restaurants = []
    seen_ids = set()
    offset = 0

    while len(restaurants) < total:
        params = {
            "term": f"{cuisine} restaurants",
            "location": "Manhattan, NY",
            "limit": 50,
            "offset": offset
        }
        response = requests.get(YELP_URL, headers=HEADERS, params=params)
        data = response.json()
        businesses = data.get("businesses", [])

        if not businesses:
            break

        for b in businesses:
            if b["id"] not in seen_ids:
                seen_ids.add(b["id"])
                restaurants.append({
                    "businessId": b["id"],
                    "name": b["name"],
                    "address": " ".join(b["location"]["display_address"]),
                    "zipCode": b["location"].get("zip_code", "N/A"),
                    "latitude": str(b["coordinates"].get("latitude", "")),
                    "longitude": str(b["coordinates"].get("longitude", "")),
                    "numberOfReviews": b.get("review_count", 0),
                    "rating": str(b.get("rating", 0)),
                    "cuisine": cuisine
                })

        offset += 50
        time.sleep(0.3)

    return restaurants[:total]

all_restaurants = []
seen_global = set()

for cuisine in CUISINES:
    print(f"Fetching {cuisine} restaurants...")
    results = get_restaurants(cuisine, 200)
    for r in results:
        if r["businessId"] not in seen_global:
            seen_global.add(r["businessId"])
            all_restaurants.append(r)

print(f"\nTotal unique restaurants collected: {len(all_restaurants)}")

# dynamodb
print("\nConnecting to DynamoDB")
dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

print("Creating DynamoDB table if it doesn't exist")
try:
    table = dynamodb.create_table(
        TableName="yelp-restaurants",
        KeySchema=[{"AttributeName": "businessId", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "businessId", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST"
    )
    table.wait_until_exists()
    print("Table created")
except Exception as e:
    print(f"Table already exist: {e}")
    table = dynamodb.Table("yelp-restaurants")

# insert into dynamodb
print("Inserting restaurants into DynamoDB")
with table.batch_writer() as batch:
    for r in all_restaurants:
        r["insertedAtTimestamp"] = datetime.utcnow().isoformat()
        batch.put_item(Item=r)

print(f"{len(all_restaurants)} restaurants in DynamoDB.")