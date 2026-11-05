# HomeSage Voice

A phone agent for an estate agency. Buyers ring up and ask about homes for sale in plain English; the agent answers from the listings in the [HomeSage API](../README.md), books viewings, logs valuation requests from people thinking of selling, and takes messages for the team.

[Vapi](https://vapi.ai) handles the phone line, speech recognition, the voice and turn taking. This repo is the server behind it: the tools the agent calls, the viewing diary, and a record of every booking, lead and call.

## How a call works

```
Caller ── phone ──> Vapi (speech to text, LLM, text to speech)
                      │
                      │ tool calls, end of call report        POST /vapi/webhook
                      v
               homesage-voice  ───── POST /chat (SSE) ─────>  HomeSage API
                      │                                        router, SQL + vector search,
                      │                                        cited answer
                      ├── SQLite: viewings, valuation requests, messages, calls
                      └── notify webhook (Slack, Make, n8n, Zapier)
```

1. The caller asks, say, "Have you got any three bed houses in Inverurie with a garden under three hundred thousand?"
2. Vapi's model calls `search_properties` with the question made standalone. The caller hears "Let me check our listings for you" while it runs.
3. This server asks HomeSage's `/chat`, reads the stream to the end, strips the `[P-1234]` citations so nothing is read aloud, and hands back the answer plus a short ref for each home it cited.
4. The model says two or three short sentences and offers a viewing. `get_viewing_slots` and `book_viewing` only accept homes that came up in this call, so nothing can be booked for a home the caller never heard about.
5. When the call ends, Vapi sends a report with the transcript and summary, which is stored.

## What the agent can do

| Tool                | What it does                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `search_properties` | Answers any question about homes for sale from HomeSage, with HomeSage's guarantees: every fact comes from a real listing |
| `get_viewing_slots` | Offers free viewing times for a home from this call, two a day, from tomorrow. Also tells the model today's date          |
| `book_viewing`      | Books a free slot for that home and tells the office. Two callers cannot take the same slot                               |
| `request_valuation` | Logs a would be seller's details and timeframe for a valuer to call back, and tells the office                            |
| `take_message`      | Takes a message about anything else, such as offers or sales in progress                                                  |
| `transferCall`      | Puts the caller through to the office, only when `TRANSFER_PHONE_NUMBER` is set                                           |
| `endCall`           | Ends the call when the caller is done                                                                                     |

The tools are defined once, in [`src/app/agent-tools/tool-definitions.ts`](src/app/agent-tools/tool-definitions.ts). The server checks arguments with those Zod schemas, and the sync script sends the same schemas to Vapi as JSON Schema, so the two can never disagree.

The agent's instructions are in [`assistant/system-prompt.md`](assistant/system-prompt.md). They carry over HomeSage's rules for the data: no EPC ratings, no facts the listing does not state, seller answers reported as what the seller said, and no negative claims from a missing flag. On top of that, the agent never values a home, never advises on offers or mortgages, and never promises anything a tool did not confirm.

## Run it

You need Node 24, HomeSage running locally, a [Vapi](https://dashboard.vapi.ai) account, and a way to give this server a public https address. [ngrok](https://ngrok.com) is the quickest.

### 1. Start HomeSage

Follow the [main README](../README.md) until `curl http://localhost:3000/health` is green and a question on `POST /chat` gets an answer. HomeSage rate limits each IP to 20 chat requests a minute by default (`THROTTLE_LIMIT`), and every call from this server comes from one IP, which is plenty for a demo.

### 2. Start this server

```
npm install
cp .env.example .env        # then fill in the blanks, see below
npm run start:dev           # http://localhost:3100
curl http://localhost:3100/health
```

`/health` is 200 only when both the database and HomeSage are up, and names the one that is not.

Two values have no default. Make each one a long random string:

```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

| Variable               | What it is                                                                       |
| ---------------------- | -------------------------------------------------------------------------------- |
| `VOICE_WEBHOOK_SECRET` | Shared with Vapi, which sends it on every webhook. Requests without it get a 403 |
| `ADMIN_TOKEN`          | Bearer token for the `/admin` endpoints                                          |

Everything else in `.env.example` has a working default: the agency's name, the viewing diary (Monday to Saturday, 10am to 5pm, 30 minute slots, two weeks ahead), and an optional `NOTIFY_WEBHOOK_URL`.

### 3. Give it a public address

```
ngrok http 3100
```

Put the `https://…` address ngrok prints into `PUBLIC_URL` in `.env`. A free ngrok address changes every time it restarts, so run the sync again (next step) when it does.

### 4. Create the assistant in Vapi

Put your Vapi private API key in `VAPI_API_KEY`, then:

```
npm run vapi:preview        # prints exactly what will be sent, secret masked
npm run vapi:sync           # creates the assistant, or updates the one with the same name
```

Run `vapi:sync` again whenever you change the prompt, the tools or `PUBLIC_URL`. Changes you make to the voice or transcriber in the Vapi dashboard are kept, because the sync only sends the voice when `VAPI_VOICE_PROVIDER` and `VAPI_VOICE_ID` are set.

By default the secret is sent to Vapi as an `X-Vapi-Secret` header on the webhook. Vapi now prefers a stored credential: create a Bearer Token credential in the Vapi dashboard holding the same secret (header `Authorization` with the Bearer prefix, or header `X-Vapi-Secret` without it), put its id in `VAPI_CREDENTIAL_ID`, and sync again. The server accepts either header.

### 5. Talk to it

- **In the browser:** open the assistant in the Vapi dashboard and use its talk or test call button. A web call has no caller ID, so the agent asks for a number before it books anything.
- **On a phone:** attach the assistant to a phone number in the Vapi dashboard. For a UK number, buy one from Twilio or Telnyx and import it into Vapi.

Things to try, all answerable from the HomeSage data:

- "What have you got in AB15 with three bedrooms and a garden, under three hundred thousand?"
- "Any flats in Aberdeen city centre with allocated parking?"
- "Houses in Inverurie with oil heating?" then "Can I see the first one on Saturday morning?"
- "I'm thinking of selling my house in Westhill in the next few months."
- "What's the EPC rating?" The agent should say the details do not cover that.
- "What should I offer?" The agent should not say, and should offer to take a message.

### 6. See what happened

```
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3100/admin/viewings
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3100/admin/valuations
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3100/admin/messages
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3100/admin/calls
```

Each takes `?limit=` (default 50) and lists the newest first. With `NOTIFY_WEBHOOK_URL` set to a Slack incoming webhook, the office also gets a message the moment a viewing is booked, a valuation is requested or a message is taken.

## Checks

```
npm run lint
npm run format:check
npm run typecheck
npm test                    # unit tests
npm run test:e2e            # the whole server, driven like Vapi drives it, against a fake HomeSage
```

The end to end tests start the app with an in memory database, a fake HomeSage that streams `/chat` events in HomeSage's format, and a fake notify webhook, then play a call through the webhook: search, viewing times, booking, a double booking, a valuation with and without caller ID, a message, bad arguments, several tool calls in one message, and the end of call report. CI runs all of the above on every push.

## Layout

```
assistant/system-prompt.md      what the agent is told; {AGENCY_NAME} and {TRANSFER_RULE} are filled by the sync
src/
  app/
    agent-tools/                the tools, their shared definitions, and the dispatcher
    homesage/                   the /chat client and SSE reader, and citation stripping
    viewings/                   the viewing diary and bookings
    leads/                      valuation requests and messages
    calls/                      per call memory and the call log
    notify/                     the office webhook
    vapi/                       the webhook controller, message schemas and secret check
    admin/  health/
  infra/                        config (validated at boot) and the SQLite store
  platform/                     clock and secret comparison
tools/vapi-sync/                builds the Vapi assistant and creates or updates it
test/                           end to end tests and the fake servers
```

## Before this goes in front of a real agency

- **The data.** Every listing in this repo is made up, including the ones a caller hears about. A real agency would load its own listings.
- **Callers' details.** The database holds names, numbers and transcripts. The greeting says the call may be recorded and that the caller is speaking to an AI. A real deployment needs a privacy notice, a retention period, and the agency's agreement as data controller under UK GDPR.
- **One instance.** Which homes each live call has heard about is kept in memory, which suits a single server. Running several would need that moved to Redis or the database.
- **A real diary.** Viewings go into this server's own diary and the office hears about them by webhook. A live agency would want them in their CRM (Reapit, Alto, Jupix and so on) or at least a shared calendar.
- **No sales data beyond listings.** HomeSage has no listing status, so the agent cannot say whether a home is under offer. The prompt stops it promising a home is still available.
