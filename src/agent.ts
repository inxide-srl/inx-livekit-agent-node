import type { JobContext } from '@livekit/agents';
import { WorkerOptions, cli, defineAgent, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { JobType } from '@livekit/protocol';
import { fileURLToPath } from 'node:url';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const agent = new multimodal.MultimodalAgent({
      model: new openai.realtime.RealtimeModel({
        instructions: `System settings:

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
`,
        voice: 'alloy',
        temperature: 0.8,
        maxResponseOutputTokens: Infinity,
        modalities: ['text', 'audio'],
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 510,
          prefix_padding_ms: 800,
        },
      }),
    });

    await agent.start(ctx.room);
  },
});

cli.runApp(
  new WorkerOptions({ agent: fileURLToPath(import.meta.url), workerType: JobType.JT_ROOM }),
);
