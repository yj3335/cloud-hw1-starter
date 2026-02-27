import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

const sqsClient = new SQSClient({ region: "us-east-1" });
const sesClient = new SESClient({ region: "us-east-1" });
const stsClient = new STSClient({ region: "us-east-1" });

const SQS_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/916055948433/cc-spring-2026-assignment1-diningrequestsqueue";
const OPENSEARCH_ENDPOINT = "https://search-restaurants-z6cygdgpmpfetb5obfbovj3eny.aos.us-east-1.on.aws"; 
const OPENSEARCH_USERNAME = "admin";
const OPENSEARCH_PASSWORD = "CC-spring-2026";
const SES_SENDER_EMAIL = "yashjain778@gmail.com";
const CROSS_ACCOUNT_ROLE_ARN = "arn:aws:iam::212208751162:role/CrossAccountDynamoDBAccess";
const DYNAMO_TABLE_NAME = "yelp-restaurants";
const DYNAMO_PARTITION_KEY = "businessId"; 
const DYNAMO_REGION = "us-east-1";

export const handler = async (event) => {
    console.log("LF2 invoked");

    try {
        // pull message from SQS
        const receiveCommand = new ReceiveMessageCommand({
            QueueUrl: SQS_QUEUE_URL,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 0
        });

        const sqsResponse = await sqsClient.send(receiveCommand);
        console.log("SQS Response:", JSON.stringify(sqsResponse));

        if (!sqsResponse.Messages || sqsResponse.Messages.length === 0) {
            console.log("No messages in queue");
            return { statusCode: 200, body: "No messages to process" };
        }

        const message = sqsResponse.Messages[0];
        const requestData = JSON.parse(message.Body);
        console.log("Request data:", JSON.stringify(requestData));

        const { Location, Cuisine, DiningDate, DiningTime, NumberOfPeople, Email } = requestData;

        // query opensearch for restaurant IDs by cuisine
        const restaurantIds = await getRestaurantIdsFromOpenSearch(Cuisine);
        console.log("Restaurant IDs from OpenSearch:", restaurantIds);

        if (restaurantIds.length === 0) {
            console.log("No restaurants found for cuisine:", Cuisine);
            await deleteMessageFromQueue(message.ReceiptHandle);
            return { statusCode: 200, body: "No restaurants found" };
        }

        // pick 3 random restaurants
        const shuffled = restaurantIds.sort(() => 0.5 - Math.random());
        const selectedIds = shuffled.slice(0, 3);
        console.log("Selected restaurant IDs:", selectedIds);

        // get details from dynamodb
        const dynamoClient = await getCrossAccountDynamoClient();
        const restaurants = [];
        for (const id of selectedIds) {
            const restaurant = await getRestaurantFromDynamo(dynamoClient, id);
            if (restaurant) {
                restaurants.push(restaurant);
            }
        }
        console.log("Restaurant details:", JSON.stringify(restaurants));

        if (restaurants.length === 0) {
            console.log("Could not fetch restaurant details from DynamoDB");
            await deleteMessageFromQueue(message.ReceiptHandle);
            return { statusCode: 200, body: "No restaurant details found" };
        }

        // send email via SES
        await sendEmail(Email, Cuisine, NumberOfPeople, DiningDate, DiningTime, restaurants, Location);

        // delete message from SQS
        await deleteMessageFromQueue(message.ReceiptHandle);

        console.log("Successfully processed request");
        return { statusCode: 200, body: "Processed successfully" };

    } catch (error) {
        console.error("Error:", error);
        return { statusCode: 500, body: "Error processing request" };
    }
};

// dynamodb access
async function getCrossAccountDynamoClient() {
    const assumeRoleCommand = new AssumeRoleCommand({
        RoleArn: CROSS_ACCOUNT_ROLE_ARN,
        RoleSessionName: "LF2-DynamoDB-Session"
    });

    const stsResponse = await stsClient.send(assumeRoleCommand);
    console.log("Successfully assumed cross-account role");

    const dynamoClient = new DynamoDBClient({
        region: DYNAMO_REGION,
        credentials: {
            accessKeyId: stsResponse.Credentials.AccessKeyId,
            secretAccessKey: stsResponse.Credentials.SecretAccessKey,
            sessionToken: stsResponse.Credentials.SessionToken
        }
    });

    return DynamoDBDocumentClient.from(dynamoClient);
}

async function getRestaurantFromDynamo(dynamoClient, restaurantId) {
    try {
        const command = new GetCommand({
            TableName: DYNAMO_TABLE_NAME,
            Key: {
                [DYNAMO_PARTITION_KEY]: restaurantId
            }
        });

        const response = await dynamoClient.send(command);
        return response.Item || null;
    } catch (error) {
        console.error("DynamoDB error for ID:", restaurantId, error);
        return null;
    }
}

// opensearch
async function getRestaurantIdsFromOpenSearch(cuisine) {
    const formattedCuisine = cuisine.charAt(0).toUpperCase() + cuisine.slice(1).toLowerCase();
    
    const url = `${OPENSEARCH_ENDPOINT}/restaurants/_search`;
    const query = {
        size: 20,
        query: {
            match: {
                Cuisine: formattedCuisine
            }
        }
    };

    const credentials = Buffer.from(`${OPENSEARCH_USERNAME}:${OPENSEARCH_PASSWORD}`).toString('base64');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(query)
        });

        const data = await response.json();
        console.log("OpenSearch response:", JSON.stringify(data));

        const hits = data.hits?.hits || [];
        return hits.map(hit => hit._source.RestaurantID);
    } catch (error) {
        console.error("OpenSearch error:", error);
        return [];
    }
}

// ses
async function sendEmail(toEmail, cuisine, numPeople, date, time, restaurants, location) {
    let restaurantList = restaurants.map((r, i) => {
        const name = r.name || "Unknown";
        const address = r.address || "Address not available";
        return `${i + 1}. ${name}, located at ${address}`;
    }).join('\n');

    const emailBody =
        `Hello! Here are my ${cuisine} restaurant suggestions for ${numPeople} people in ${location}, ` +
        `for ${date} at ${time}:\n\n${restaurantList}\n\nEnjoy your meal!`;

    const command = new SendEmailCommand({
        Source: SES_SENDER_EMAIL,
        Destination: {
            ToAddresses: [toEmail]
        },
        Message: {
            Subject: {
                Data: `Your ${cuisine} Restaurant Suggestions`
            },
            Body: {
                Text: {
                    Data: emailBody
                }
            }
        }
    });

    const response = await sesClient.send(command);
    console.log("Email sent:", response.MessageId);
}

// queue helpers
async function deleteMessageFromQueue(receiptHandle) {
    const command = new DeleteMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        ReceiptHandle: receiptHandle
    });
    await sqsClient.send(command);
    console.log("Message deleted from SQS");
}
