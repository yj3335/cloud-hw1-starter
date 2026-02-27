# Cloud Computing Spring 2026 - HW 1

Team Details:
- Binti Padaliya - bap9626
- Yash Jain - yj3335

*NYU Concierge*

Built as part of the Cloud Computing and Big Data course (Spring 2026).

## Architecture ##

1. Frontend: Static website hosted on AWS S3
2. API: AWS API Gateway with Swagger-defined endpoints
3. Chat Processing: Lambda (LF0) forwards user messages to Amazon Lex
4. Chatbot: Amazon Lex handles NLU with three intents — GreetingIntent, ThankYouIntent, and DiningSuggestionsIntent
5. Validation & Logic: Lambda (LF1) serves as a Lex code hook for slot validation and pushes completed requests to SQS
6. Data Pipeline: Yelp API → DynamoDB (full restaurant details) + OpenSearch (RestaurantID + Cuisine for search)
7. Suggestions Module: Lambda (LF2) polls SQS every minute via EventBridge, queries OpenSearch and DynamoDB, and emails recommendations via SES

## How It Works ##

1. User chats with the bot through the S3-hosted frontend
2. API Gateway routes messages to LF0, which forwards them to Lex
3. Lex identifies user intent and collects preferences (location, cuisine, party size, date, time, email)
4. LF1 validates inputs and pushes the request to an SQS queue
5. LF2 (triggered every minute) picks up the request, finds matching restaurants via OpenSearch, fetches details from DynamoDB, and emails the user 3 restaurant suggestions via SES

## Supported Locations ##
Manhattan, Brooklyn, Queens, Bronx, Staten Island
