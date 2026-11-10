/**
 * Field-level three-way merge for entries saved by two people at once.
 *
 * `base` is what the editor loaded, `mine` is what they are saving and
 * `theirs` is what is on the branch now. Each top-level field merges on its own:
 * a field changed on one side only takes that side, and a field changed on
 * both sides to different values is a conflict for the editor to settle.
 */

type MergeConflict = {
  key: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
};

type MergeResult = {
  merged: Record<string, unknown>;
  conflicts: MergeConflict[];
  // Fields only the other person changed, which the merge brings in.
  theirChanges: string[];
  // Fields only the editor changed.
  myChanges: string[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

// Treats undefined, null and "" alike, since forms and parsers disagree on empty values.
const isEmpty = (value: unknown) => value === undefined || value === null || value === "";

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    const aTime = a instanceof Date ? a.getTime() : typeof a === "string" ? Date.parse(a) : NaN;
    const bTime = b instanceof Date ? b.getTime() : typeof b === "string" ? Date.parse(b) : NaN;
    return !Number.isNaN(aTime) && aTime === bTime;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
};

const threeWayMerge = (
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): MergeResult => {
  const merged: Record<string, unknown> = {};
  const conflicts: MergeConflict[] = [];
  const theirChanges: string[] = [];
  const myChanges: string[] = [];

  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);

  for (const key of keys) {
    const baseValue = base[key];
    const mineValue = mine[key];
    const theirsValue = theirs[key];
    const iChanged = !deepEqual(mineValue, baseValue);
    const theyChanged = !deepEqual(theirsValue, baseValue);

    if (iChanged && theyChanged && !deepEqual(mineValue, theirsValue)) {
      conflicts.push({ key, base: baseValue, mine: mineValue, theirs: theirsValue });
      merged[key] = mineValue;
    } else if (theyChanged) {
      if (!iChanged) theirChanges.push(key);
      merged[key] = theirsValue;
    } else {
      if (iChanged) myChanges.push(key);
      merged[key] = key in mine ? mineValue : theirsValue;
    }
  }

  return { merged, conflicts, theirChanges, myChanges };
};

const applyResolutions = (
  result: MergeResult,
  choices: Record<string, "mine" | "theirs">,
): Record<string, unknown> => {
  const merged = { ...result.merged };
  for (const conflict of result.conflicts) {
    merged[conflict.key] = choices[conflict.key] === "theirs" ? conflict.theirs : conflict.mine;
  }
  return merged;
};

export { threeWayMerge, applyResolutions, deepEqual };
export type { MergeConflict, MergeResult };
