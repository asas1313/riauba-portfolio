import { z } from "zod";
import { cv } from "./cv.ts";
import { cvSchema } from "./cv.schema.ts";
import type { Cv } from "./cv.schema.ts";
import { TODO_PATTERN } from "./todo.ts";

/**
 * Recursively walks a parsed `Cv` tree (or any value shaped like part of
 * one) and returns the dot-path of every string leaf whose value matches
 * the whole-word, case-sensitive `TODO` marker. Array indices appear as
 * plain numeric segments (e.g. "work.0.endDate").
 */
export function findTodoFields(value: unknown, path: string[] = []): string[] {
  if (typeof value === "string") {
    return TODO_PATTERN.test(value) ? [path.join(".")] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findTodoFields(item, [...path, String(index)]),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      findTodoFields(item, [...path, key]),
    );
  }
  return [];
}

type StripAction =
  | { kind: "arrayElement"; arrayPath: string[]; index: number }
  | { kind: "optionalField"; path: string[] }
  | { kind: "requiredField"; objectPath: string[] };

function unwrapOptional(schema: z.ZodType): z.ZodType {
  return schema instanceof z.ZodOptional
    ? (schema.unwrap() as z.ZodType)
    : schema;
}

/**
 * Consults the Zod shape of `cvSchema` to classify a single TODO dot-path
 * (as produced by `findTodoFields`) into the stripping action required by
 * spec 002's decision #1:
 *
 * - the match is itself an element of a plain string array
 *   (`highlights`/`keywords`) → remove just that array element;
 * - the match is an **optional** object field → remove just that field;
 * - the match is a **required** object field → remove the whole enclosing
 *   object from its parent array (or null it out if it has no parent
 *   array).
 */
function classifyTodoPath(path: string[]): StripAction {
  let schema: z.ZodType = cvSchema;
  let lastWasArrayIndex = false;
  let lastFieldSchema: z.ZodType | undefined;

  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const isIndex = /^\d+$/.test(segment);
    const unwrapped = unwrapOptional(schema);
    const soFar = path.slice(0, i + 1).join(".");

    if (isIndex) {
      if (!(unwrapped instanceof z.ZodArray)) {
        throw new Error(
          `cv.publish: expected an array schema while resolving "${soFar}"`,
        );
      }
      schema = unwrapped.element as z.ZodType;
      lastWasArrayIndex = true;
      lastFieldSchema = undefined;
      continue;
    }

    if (unwrapped instanceof z.ZodObject) {
      const fieldSchema = unwrapped.shape[segment] as z.ZodType | undefined;
      if (!fieldSchema) {
        throw new Error(`cv.publish: unknown CV field "${soFar}"`);
      }
      schema = fieldSchema;
      lastFieldSchema = fieldSchema;
      lastWasArrayIndex = false;
      continue;
    }

    if (unwrapped instanceof z.ZodRecord) {
      // Open-ended records (e.g. `certificates`) have no named shape to
      // consult; treat every key's value type as the record's declared
      // value schema.
      schema = unwrapped.valueType as z.ZodType;
      lastFieldSchema = schema;
      lastWasArrayIndex = false;
      continue;
    }

    throw new Error(
      `cv.publish: expected an object schema while resolving "${soFar}"`,
    );
  }

  if (lastWasArrayIndex) {
    return {
      kind: "arrayElement",
      arrayPath: path.slice(0, -1),
      index: Number(path[path.length - 1]),
    };
  }

  // `.isOptional()` is deprecated in zod v4; safe-parsing `undefined` is
  // the documented replacement and avoids the deprecation warning.
  const isOptional =
    lastFieldSchema !== undefined &&
    lastFieldSchema.safeParse(undefined).success;
  if (isOptional) {
    return { kind: "optionalField", path };
  }
  return { kind: "requiredField", objectPath: path.slice(0, -1) };
}

function getAt(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, segment) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

export interface StripTodoFieldsResult {
  cv: Cv;
  strippedPaths: string[];
}

/**
 * Deep-clones `cv` and removes every TODO-marked field per
 * `classifyTodoPath`'s rule, returning the cleaned clone and the list of
 * dot-paths that were stripped (for the build warning).
 */
export function stripTodoFields(cv: Cv): StripTodoFieldsResult {
  const clone = structuredClone(cv);
  const todoPaths = findTodoFields(clone);
  if (todoPaths.length === 0) {
    return { cv: clone, strippedPaths: [] };
  }

  const removalsByArray = new Map<unknown[], Set<number>>();
  const markRemoval = (array: unknown[], index: number) => {
    let indices = removalsByArray.get(array);
    if (!indices) {
      indices = new Set();
      removalsByArray.set(array, indices);
    }
    indices.add(index);
  };

  for (const pathStr of todoPaths) {
    const path = pathStr.split(".");
    const action = classifyTodoPath(path);

    if (action.kind === "arrayElement") {
      const array = getAt(clone, action.arrayPath);
      if (Array.isArray(array)) markRemoval(array, action.index);
      continue;
    }

    if (action.kind === "optionalField") {
      const parentPath = action.path.slice(0, -1);
      const key = action.path[action.path.length - 1];
      const parent = getAt(clone, parentPath);
      if (parent !== null && typeof parent === "object") {
        delete (parent as Record<string, unknown>)[key];
      }
      continue;
    }

    // requiredField: drop the whole object at `objectPath`.
    if (action.objectPath.length === 0) continue;
    const grandParentPath = action.objectPath.slice(0, -1);
    const key = action.objectPath[action.objectPath.length - 1];
    const grandParent = getAt(clone, grandParentPath);
    if (Array.isArray(grandParent)) {
      markRemoval(grandParent, Number(key));
    } else if (grandParent !== null && typeof grandParent === "object") {
      // There is no containing array record to drop (e.g. "basics.name" or
      // "basics.location.city" — the required field lives directly on the
      // top-level `basics` object, or on a nested-but-non-array object
      // reached via `basics`). Per this project's "fail loudly" convention,
      // silently nulling out `basics` (or a part of it) would crash every
      // downstream consumer with a cryptic `TypeError` instead of a clear
      // message — so we throw here instead, naming the exact field path.
      throw new Error(
        `cv.publish: required field "${pathStr}" is marked TODO, but it has no containing array record (profile/work/education/language entry) to omit from the production build. ` +
          `Replace the TODO placeholder for "${pathStr}" in content/cv.yaml before running a production build.`,
      );
    }
  }

  for (const [array, indices] of removalsByArray) {
    const kept = array.filter((_, index) => !indices.has(index));
    array.length = 0;
    array.push(...kept);
  }

  return { cv: clone, strippedPaths: todoPaths };
}

export interface GetPublishableCvOptions {
  isProd: boolean;
  warn: (message: string) => void;
}

/**
 * Returns `cv` unchanged outside of production builds; in production,
 * strips every TODO-marked field (AC-2) and calls `warn` once with a
 * message listing every stripped path.
 */
export function getPublishableCv(
  cv: Cv,
  { isProd, warn }: GetPublishableCvOptions,
): Cv {
  if (!isProd) return cv;

  const { cv: stripped, strippedPaths } = stripTodoFields(cv);
  if (strippedPaths.length > 0) {
    warn(
      `cv.publish: omitted ${strippedPaths.length} TODO-marked field(s) from the production build:\n` +
        strippedPaths.map((path) => `  - ${path}`).join("\n"),
    );
  }
  return stripped;
}

/**
 * The one CV export every page/component should use (instead of the raw
 * `cv` export from `cv.ts`): identical to `cv` in `astro dev`, with every
 * TODO-marked field stripped in `astro build` (spec 002, decision #3 — the
 * single TODO-handling code path for the whole site).
 */
export const cvForBuild: Cv = getPublishableCv(cv, {
  isProd: import.meta.env.PROD,
  warn: console.warn,
});
