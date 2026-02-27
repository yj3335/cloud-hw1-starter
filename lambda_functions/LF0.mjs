import { LexRuntimeV2Client, RecognizeTextCommand } from "@aws-sdk/client-lex-runtime-v2";

const lexClient = new LexRuntimeV2Client({ region: "us-east-1" });

const BOT_ID = "I0Z6Z4TY81";
const BOT_ALIAS_ID = "TSTALIASID";
const LOCALE_ID = "en_US";

export const handler = async (event) => {
  console.log("Event:", JSON.stringify(event));

  const body = JSON.parse(event.body || '{}');
  const messages = body.messages || [];
  const userMessage = messages[0]?.unstructured?.text || '';

  console.log("User message:", userMessage);

  // session ID so Lex remembers the conversation
  const sessionId = "user-" + (event.requestContext?.identity?.sourceIp || "default").replace(/\./g, "-");

  try {
      const command = new RecognizeTextCommand({
          botId: BOT_ID,
          botAliasId: BOT_ALIAS_ID,
          localeId: LOCALE_ID,
          sessionId: sessionId,
          text: userMessage
      });

      const lexResponse = await lexClient.send(command);
      console.log("Lex response:", JSON.stringify(lexResponse));

      const botMessage = lexResponse.messages?.[0]?.content || "Sorry, I didn't understand that.";

      return buildResponse(200, {
          messages: [{
              type: "unstructured",
              unstructured: {
                  id: "1",
                  text: botMessage,
                  timestamp: new Date().toISOString()
              }
          }]
      });

  } catch (error) {
      console.error("Error calling Lex:", error);
      return buildResponse(500, {
          messages: [{
              type: "unstructured",
              unstructured: {
                  id: "1",
                  text: "Something went wrong. Please try again.",
                  timestamp: new Date().toISOString()
              }
          }]
      });
  }
};

function buildResponse(statusCode, body) {
  return {
      statusCode: statusCode,
      headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'OPTIONS,POST'
      },
      body: JSON.stringify(body)
  };
}