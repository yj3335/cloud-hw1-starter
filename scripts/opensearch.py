import boto3
import requests

HOST = "https://search-restaurants-z6cygdgpmpfetb5obfbovj3eny.aos.us-east-1.on.aws"
MASTER_USER = "admin"
MASTER_PASS = "CC-spring-2026"

headers = {"Content-Type": "application/json"}
auth = (MASTER_USER, MASTER_PASS)

# create the index restaurants with a "Restaurant" type mapping
print("Creating index")
index_url = f"{HOST}/restaurants"
mapping = {
    "mappings": {
        "properties": {
            "RestaurantID": {"type": "keyword"},
            "Cuisine":      {"type": "keyword"}
        }
    }
}
r = requests.put(index_url, auth=auth, json=mapping, headers=headers)
print("Index creation response:", r.status_code, r.json())

# pull all restaurants from dynamodb
print("\nReading from DynamoDB")
dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
table = dynamodb.Table("yelp-restaurants")

response = table.scan()
restaurants = response["Items"]

while "LastEvaluatedKey" in response:
    response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
    restaurants.extend(response["Items"])

print(f"Found {len(restaurants)} restaurants in DynamoDB")

# index each restaurant into opensearch
print("\nIndexing into OpenSearch")
success = 0
errors = 0

for restaurant in restaurants:
    doc = {
        "RestaurantID": restaurant["businessId"],
        "Cuisine":      restaurant["cuisine"]
    }
    url = f"{HOST}/restaurants/_doc/{restaurant['businessId']}"
    resp = requests.put(url, auth=auth, json=doc, headers=headers)
    
    if resp.status_code in (200, 201):
        success += 1
    else:
        errors += 1
        print(f"Error on {restaurant['businessId']}: {resp.json()}")

print(f"\n{success} restaurants indexed, {errors} errors.")

