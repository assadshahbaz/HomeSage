import * as z from 'zod';

/** Long enough for any real question, short enough that a pasted document is refused. */
export const QUESTION_MAX_LENGTH = 500;

/** A question in plain English, as `POST /sql` and `POST /chat` take it. */
export const questionSchema = z.string().trim().min(1).max(QUESTION_MAX_LENGTH);
