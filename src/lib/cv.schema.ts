import { z } from "zod";

// Matches the shape of content/cv.yaml — the single source of truth for the
// CV page and the generated PDF (spec 002). Keep in sync with that file.
export const profileSchema = z.object({
  network: z.string(),
  url: z.string(),
});

export const basicsSchema = z.object({
  name: z.string(),
  label: z.string(),
  email: z.string(),
  url: z.string(),
  location: z.object({
    city: z.string(),
    countryCode: z.string(),
  }),
  remote: z.string(),
  profiles: z.array(profileSchema),
  summary: z.string(),
});

export const workSchema = z.object({
  name: z.string(),
  position: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  url: z.string().optional(),
  summary: z.string(),
  highlights: z.array(z.string()),
});

export const skillSchema = z.object({
  name: z.string(),
  keywords: z.array(z.string()),
});

export const educationSchema = z.object({
  institution: z.string(),
  area: z.string(),
  studyType: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const languageSchema = z.object({
  language: z.string(),
  fluency: z.string(),
});

export const cvSchema = z.object({
  basics: basicsSchema,
  work: z.array(workSchema),
  skills: z.array(skillSchema),
  education: z.array(educationSchema),
  languages: z.array(languageSchema),
  // No closed shape exists yet (always [] in content/cv.yaml today); kept
  // permissive on purpose so adding a real certificate later doesn't require
  // a schema change just to unblock content authors.
  certificates: z.array(z.record(z.string(), z.unknown())),
});

export type Cv = z.infer<typeof cvSchema>;
export type Profile = z.infer<typeof profileSchema>;

/**
 * Parses and validates raw CV data, throwing a human-readable error that
 * names every failing field path on failure (AC-3).
 */
export function parseCv(data: unknown): Cv {
  const result = cvSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      )
      .join("\n");
    throw new Error(`Invalid content/cv.yaml:\n${issues}`);
  }
  return result.data;
}
