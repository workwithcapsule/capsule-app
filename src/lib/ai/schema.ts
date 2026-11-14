import { z } from "zod";

/*
 * The format Claude must answer in (structured output). People, components
 * and spaces are referred to by the short refs given in the request (p1, c2,
 * s1), never by name, and every value is checked again afterwards
 * (lib/ai/validate.ts). Kept free of string formats and length rules so the
 * schema works with structured outputs; those checks happen in validate.ts.
 */
export const ShapeOutput = z.object({
  name: z.string().describe("Short capsule name, about 3 to 6 words, sentence case"),
  outcome: z.string().describe("One or two plain sentences: what is true when this is done"),
  space: z.string().nullable().describe("Space ref, like s1, or null if none fits"),
  launch_date: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD, or null if the description gives no timing"),
  date_type: z.enum(["launch", "due"]),
  owner: z.string().nullable().describe("Person ref for the capsule owner"),
  components: z.array(
    z.object({
      component: z.string().describe("Component ref, like c1"),
      goal: z.string().describe("One sentence: what done looks like for this component"),
      owner: z.string().nullable().describe("Person ref, or null when unclear"),
      due_date: z.string().nullable().describe("YYYY-MM-DD on or before the launch date, or null"),
      work_items: z.array(
        z.object({
          title: z.string().describe("A concrete first step, verb first"),
          assignee: z.string().nullable().describe("Person ref, or null when unclear"),
        }),
      ),
    }),
  ),
  note: z
    .string()
    .nullable()
    .describe("Only if something in the description couldn't be done; otherwise null"),
});

export type ShapeOutput = z.infer<typeof ShapeOutput>;
