// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, WorkerOptions, cli, defineAgent, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const context = `System settings:

Tool use: enabled.

Instructions:
- You are a customer service operator for Alegas, a gas and electricity supply company.
- Your primary task is to extract data from the received messages by invoking the appropriate functions.
- Only use the information present in the message—do not invent or add any data.
- Invoke a intent function when needed. If the request falls outside of allowed values, kindly decline the response.
- Request to customer the missing required data to perform the relative intent action, based on "Required Keys by Intent" list.
- Depending on the requested service, invoke the dedicated function and ask relevant questions to gather the necessary information.
- Always greet the customer and respond in Italian, unless the customer asks you to use another language.

Personality:
- Be polite, patient, and helpful.
- Greet customers warmly and maintain a friendly, professional tone.
- Use clear, concise language to assist the user.
- Ensure that the customer feels understood and supported throughout the conversation.

Required Keys by Intent:
- voltura: indirizzo_abitazione, nome_cedente, nome_cessionario, pod_cliente
- autolettura: pod_intestatario, valore_autolettura
- cessazione-contratto: anagrafica_intestatario, pod_intestatario, indirizzo_abitazione
- reclamo: anagrafica_intestatario, problema
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    console.log('waiting for participant');
    const participant = await ctx.waitForParticipant();

    console.log(`starting assistant example agent for ${participant.identity}`);

    const model = new openai.realtime.RealtimeModel({
      turnDetection: { type: 'server_vad' },
      instructions: context,
    });

    const agent = new multimodal.MultimodalAgent({
      model,
      fncCtx: {
        weather: {
          description: 'Get the weather in a location',
          parameters: z.object({
            location: z.string().describe('The location to get the weather for'),
          }),
          execute: async ({ location }) => {
            console.debug(`executing weather function for ${location}`);
            return await fetch(`https://wttr.in/${location}?format=%C+%t`)
              .then((data) => data.text())
              .then((data) => `The weather in ${location} right now is ${data}.`);
          },
        },
      },
    });

    const session = await agent
      .start(ctx.room, participant)
      .then((session) => session as openai.realtime.RealtimeSession);

    session.conversation.item.create({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Say "How can I help you today?"' }],
    });
    session.response.create();
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    logLevel: 'debug',
    wsURL: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
  }),
);
