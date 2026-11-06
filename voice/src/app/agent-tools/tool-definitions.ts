import * as z from 'zod';

// This file is the single definition of every tool the phone agent can call:
// the server validates arguments with these schemas, and the Vapi sync script
// turns the same schemas into the JSON Schema the model sees. It imports only
// zod, so the sync script can run it directly with Node's type stripping.

const MAX_QUESTION_LENGTH = 500;
const MAX_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 1_000;
const MAX_ADDRESS_LENGTH = 200;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_LENGTH = 25;

/** The names Vapi calls the tools by. */
export const TOOL_NAME = {
  SEARCH_PROPERTIES: 'search_properties',
  GET_VIEWING_SLOTS: 'get_viewing_slots',
  BOOK_VIEWING: 'book_viewing',
  REQUEST_VALUATION: 'request_valuation',
  TAKE_MESSAGE: 'take_message',
} as const;

export type ToolName = (typeof TOOL_NAME)[keyof typeof TOOL_NAME];

const propertyRef = z
  .string()
  .trim()
  .regex(/^\d+$/, 'A ref is digits only, as search_properties gave it')
  .describe('The ref of a home that search_properties returned in this call, digits only.');

const callerName = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NAME_LENGTH)
  .describe("The caller's full name, as they gave it.");

const callerPhone = z
  .string()
  .trim()
  .max(MAX_PHONE_LENGTH)
  .refine((phone) => phone.replace(/\D/g, '').length >= MIN_PHONE_DIGITS, 'Not a phone number')
  .optional()
  .describe(
    'A callback number, only if the caller gives a different one from the number they are calling from.',
  );

export const searchPropertiesArgs = z.strictObject({
  question: z
    .string()
    .trim()
    .min(1)
    .max(MAX_QUESTION_LENGTH)
    .describe(
      'What the caller is looking for, as one standalone question that carries every requirement they have given so far: area or postcode, budget, bedrooms and features. For example "3 bedroom houses in Inverurie with a garden under £300,000".',
    ),
});

export const getViewingSlotsArgs = z.strictObject({
  propertyRef,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('A day the caller asked for, as YYYY-MM-DD. Leave out to get the next free times.'),
});

export const bookViewingArgs = z.strictObject({
  propertyRef,
  slot: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .describe('The slot id exactly as get_viewing_slots gave it, such as 2026-10-14T10:30.'),
  callerName,
  callerPhone,
  notes: z
    .string()
    .trim()
    .max(MAX_TEXT_LENGTH)
    .optional()
    .describe('Anything the agent should know, such as a mortgage in principle or a chain.'),
});

/** How soon a seller wants to sell. */
export const SELLING_TIMEFRAME = {
  AS_SOON_AS_POSSIBLE: 'as_soon_as_possible',
  WITHIN_3_MONTHS: 'within_3_months',
  WITHIN_6_MONTHS: 'within_6_months',
  JUST_EXPLORING: 'just_exploring',
} as const;

export const requestValuationArgs = z.strictObject({
  callerName,
  callerPhone,
  propertyAddress: z
    .string()
    .trim()
    .min(1)
    .max(MAX_ADDRESS_LENGTH)
    .describe('The address of the home the caller wants valued.'),
  postcode: z.string().trim().max(MAX_NAME_LENGTH).optional().describe('Its postcode, if given.'),
  timeframe: z.enum(SELLING_TIMEFRAME).describe('How soon the caller is thinking of selling.'),
  isAlsoBuying: z
    .boolean()
    .optional()
    .describe('True if the caller also needs to buy a home, only if they said so.'),
  notes: z.string().trim().max(MAX_TEXT_LENGTH).optional().describe('Anything else they said.'),
});

/** What a message is about, so the office can pass it to the right person. */
export const MESSAGE_ABOUT = {
  BUYING: 'buying',
  SELLING: 'selling',
  VIEWING: 'viewing',
  OTHER: 'other',
} as const;

export const takeMessageArgs = z.strictObject({
  callerName,
  callerPhone,
  about: z.enum(MESSAGE_ABOUT).describe('What the message is about.'),
  message: z
    .string()
    .trim()
    .min(1)
    .max(MAX_TEXT_LENGTH)
    .describe('The message, in the caller’s words as far as possible.'),
});

export type SearchPropertiesArgs = z.infer<typeof searchPropertiesArgs>;
export type GetViewingSlotsArgs = z.infer<typeof getViewingSlotsArgs>;
export type BookViewingArgs = z.infer<typeof bookViewingArgs>;
export type RequestValuationArgs = z.infer<typeof requestValuationArgs>;
export type TakeMessageArgs = z.infer<typeof takeMessageArgs>;

/** One tool as the model sees it. */
export interface ToolDefinition {
  readonly name: ToolName;
  readonly description: string;
  readonly args: z.ZodType;
  /** Said to the caller while the tool runs, so a slow call is never silence. */
  readonly holdingLine: string;
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: TOOL_NAME.SEARCH_PROPERTIES,
    description:
      "Search the agency's homes for sale and answer a buyer's question about them. Use for any question about available homes, prices, areas, features or a particular address. The answer comes only from the listings; never add facts it does not give.",
    args: searchPropertiesArgs,
    holdingLine: 'Let me check our listings for you.',
  },
  {
    name: TOOL_NAME.GET_VIEWING_SLOTS,
    description:
      'Get free viewing times for one home from this call. Also returns today’s date. Use before booking, and offer the caller two or three of the times.',
    args: getViewingSlotsArgs,
    holdingLine: 'Let me look at the diary.',
  },
  {
    name: TOOL_NAME.BOOK_VIEWING,
    description:
      'Book a viewing in a slot that get_viewing_slots offered, once the caller has chosen it and you have their name. Read the details back to the caller before calling this.',
    args: bookViewingArgs,
    holdingLine: 'Booking that in now.',
  },
  {
    name: TOOL_NAME.REQUEST_VALUATION,
    description:
      'Log a request from someone who wants their home valued or is thinking of selling, so a valuer can call them back.',
    args: requestValuationArgs,
    holdingLine: 'Let me note that down.',
  },
  {
    name: TOOL_NAME.TAKE_MESSAGE,
    description:
      'Take a message for the team when you cannot help directly, such as offers, complaints, mortgages, or anything about a sale already going through.',
    args: takeMessageArgs,
    holdingLine: 'Let me take that down.',
  },
];
