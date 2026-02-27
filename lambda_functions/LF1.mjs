import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({ region: "us-east-1" });
const SQS_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/916055948433/cc-spring-2026-assignment1-diningrequestsqueue";

export const handler = async (event) => {
    console.log("Event:", JSON.stringify(event));

    const intentName = event.sessionState.intent.name;
    console.log("Intent:", intentName);

    if (intentName === 'GreetingIntent') {
        return greetingIntent(event);
    } else if (intentName === 'ThankYouIntent') {
        return thankYouIntent(event);
    } else if (intentName === 'DiningSuggestionsIntent') {
        return diningSuggestionsIntent(event);
    }

    return closeResponse(event, "Sorry, I didn't understand that.");
};

function greetingIntent(event) {
    console.log("Handling GreetingIntent");
    return closeResponse(event, "Hi there, how can I help?");
}

function thankYouIntent(event) {
    console.log("Handling ThankYouIntent");
    return closeResponse(event, "You're welcome!");
}

async function diningSuggestionsIntent(event) {
    const slots = event.sessionState.intent.slots;
    console.log("Slots:", JSON.stringify(slots));

    const location = getSlotValue(slots, 'Location');
    const cuisine = getSlotValue(slots, 'Cuisine');
    const diningDate = getSlotValue(slots, 'DiningDate');
    const diningTime = getSlotValue(slots, 'DiningTime');
    const numPeople = getSlotValue(slots, 'NumberOfPeople');
    const email = getSlotValue(slots, 'Email');

    // Validations
    if (location && !['manhattan', 'brooklyn', 'queens', 'bronx', 'the bronx',
    'staten island', 'new york', 'nyc', 'new york city'].includes(location.toLowerCase())) {
        return elicitSlot(event, 'Location',
            `Sorry, I can't fulfill requests for ${location}. Please enter a valid location NYC location.`
        );
    }

    if (numPeople && (parseInt(numPeople) < 1 || parseInt(numPeople) > 20)) {
        return elicitSlot(event, 'NumberOfPeople',
            "Please enter a valid number of people (1-20)."
        );
    }

    // All good
    if (location && cuisine && diningDate && diningTime && numPeople && email) {
        console.log("All slots filled, pushing to SQS");

        const sqsMessage = {
            Location: location,
            Cuisine: cuisine,
            DiningDate: diningDate,
            DiningTime: diningTime,
            NumberOfPeople: numPeople,
            Email: email
        };

        try {
            const command = new SendMessageCommand({
                QueueUrl: SQS_QUEUE_URL,
                MessageBody: JSON.stringify(sqsMessage)
            });
            await sqsClient.send(command);
            console.log("Message sent to SQS");
        } catch (error) {
            console.error("SQS Error:", error);
        }

        return closeResponse(event,
            `You're all set. Expect my suggestions for ${cuisine} restaurants in ${location} ` +
            `for ${numPeople} people on ${diningDate} at ${diningTime} shortly! ` +
            `I'll send the recommendations to ${email}. Have a good day.`
        );
    }

    return delegateResponse(event);
}

function getSlotValue(slots, slotName) {
    if (slots && slots[slotName] && slots[slotName].value) {
        return slots[slotName].value.interpretedValue 
            || slots[slotName].value.originalValue 
            || null;
    }
    return null;
}

function closeResponse(event, message) {
    return {
        sessionState: {
            dialogAction: {
                type: 'Close'
            },
            intent: {
                name: event.sessionState.intent.name,
                slots: event.sessionState.intent.slots,
                state: 'Fulfilled'
            }
        },
        messages: [
            {
                contentType: 'PlainText',
                content: message
            }
        ]
    };
}

function delegateResponse(event) {
    return {
        sessionState: {
            dialogAction: {
                type: 'Delegate'
            },
            intent: {
                name: event.sessionState.intent.name,
                slots: event.sessionState.intent.slots,
                state: 'InProgress'
            }
        }
    };
}

function elicitSlot(event, slotName, message) {
    // Clear the invalid slot so Lex asks again
    let slots = event.sessionState.intent.slots;
    slots[slotName] = null;

    return {
        sessionState: {
            dialogAction: {
                type: 'ElicitSlot',
                slotToElicit: slotName
            },
            intent: {
                name: event.sessionState.intent.name,
                slots: slots,
                state: 'InProgress'
            }
        },
        messages: [
            {
                contentType: 'PlainText',
                content: message
            }
        ]
    };
}
