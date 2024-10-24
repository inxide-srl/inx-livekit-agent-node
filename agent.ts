// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, WorkerOptions, cli, defineAgent, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import dotenv from 'dotenv';
import formData from 'form-data';
import Mailgun, {
  type Interfaces,
  type MailgunClientOptions,
  type MessagesSendResult,
} from 'mailgun.js';
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
- Always respond in Italian, unless the customer asks you to use another language.
- Always send a resume to customer's e-mail with the collected data at the call termination

Personality:
- Be polite, patient, and helpful.
- Maintain a friendly, professional tone.
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
      turnDetection: { type: 'server_vad', prefix_padding_ms: 750 },
      instructions: context,
      voice: 'shimmer',
    });

    const agent = new multimodal.MultimodalAgent({
      model,
      fncCtx: {
        sendSummary: {
          description: 'On end call, send an summary e-mail',
          parameters: z.object({
            intent: z.string().describe('The customer call intent'),
            data: z.string().describe('Required keys/values to handle the intent'),
          }),
          execute: async ({ intent, data }) => {
            console.debug(`Executing send summary e-mail for intent ${intent}`, { intent, data });

            const mailgun = new Mailgun(formData);

            const options: MailgunClientOptions = {
              username: 'api',
              key: process.env.MAILGUN_API_KEY || '',
            };

            const mg: Interfaces.IMailgunClient = mailgun.client(options);

            return mg.messages
              .create('sandboxfd5de195b2fb47bbab38bf311db9eec8.mailgun.org', {
                from: 'Assistente Alegas <mailgun@sandboxfd5de195b2fb47bbab38bf311db9eec8.mailgun.org>',
                to: ['andrea.mason85@gmail.com'],
                subject: 'Recap della tua richiesta',
                text: `Questo è il recap della tua richiesta
              Intent: ${intent}
              Data: ${data}`,
                html: `<h1>Questo è il recap della tua richiesta!</h1>
              <p> Intent: ${intent}</p>
              <p>Data: ${data}</p>`,
              })
              .then((result: MessagesSendResult) => {
                console.log(result);
                return result.message;
              });
          },
        },
      },
    });

    const session = await agent
      .start(ctx.room, participant)
      .then((session) => session as openai.realtime.RealtimeSession);;

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
