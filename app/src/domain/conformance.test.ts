/**
 * The shared `conformance/schema-cases/` suite, asserted from the TypeScript side.
 *
 * The Python engine runs the identical expectations, so the two parsers cannot drift.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePuzzle, PuzzleParseError } from "./puzzle";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const CASES_DIR = join(REPO_ROOT, "conformance", "schema-cases");

interface Expect {
  size: number;
  seed: number;
  generatorVersion: number;
  type: string;
  regionCapacity: number[];
  difficulty: number | null;
}

interface Case {
  file: string;
  valid: boolean;
  expect?: Expect;
  errorPaths?: string[];
}

const manifest = JSON.parse(
  readFileSync(join(CASES_DIR, "manifest.json"), "utf8"),
) as {
  cases: Case[];
};

function readCase(file: string): unknown {
  return JSON.parse(readFileSync(join(CASES_DIR, file), "utf8"));
}

/**
 * The document locations a rejection names, sorted and deduplicated.
 *
 * ajv and jsonschema report the same invalid document differently: an `if`/`then`
 * that fires alongside a `required` failure is one error here and two in Python, so
 * `<root>; <root>` here is `<root>` there. Comparing the *set* of locations is what
 * both parsers can agree on, and it still pins which rule fired.
 */
function errorPaths(message: string): string[] {
  const paths = message
    .replace(/^puzzle does not match schema at: /, "")
    .split("; ");
  return [
    ...new Set(paths.map((path) => path.replace(/^\//, "") || "<root>")),
  ].sort();
}

describe("conformance: schema-cases", () => {
  it("lists every fixture file in the manifest", () => {
    const onDisk = readdirSync(CASES_DIR)
      .filter((name) => name.endsWith(".json") && name !== "manifest.json")
      .sort();
    expect(manifest.cases.map((testCase) => testCase.file).sort()).toEqual(
      onDisk,
    );
  });

  it.each(manifest.cases)("case $file", (testCase) => {
    const data = readCase(testCase.file);
    if (testCase.valid) {
      const expected = testCase.expect;
      if (!expected)
        throw new Error(`${testCase.file} is an accept case with no expect`);
      const puzzle = parsePuzzle(data);
      expect(puzzle.id).toBe((data as { id: string }).id);
      expect(puzzle.puzzleType).toBe(expected.type);
      // A file writing `4.0` must parse as the integer 4, not as 4.0: every
      // downstream index and loop bound assumes ints.
      expect(puzzle.size).toBe(expected.size);
      expect(puzzle.seed).toBe(expected.seed);
      expect(puzzle.generatorVersion).toBe(expected.generatorVersion);
      expect([...puzzle.board.regionCapacity]).toEqual(expected.regionCapacity);
      expect(puzzle.difficulty).toBe(expected.difficulty);
    } else {
      let message: string | null = null;
      try {
        parsePuzzle(data);
      } catch (error) {
        if (!(error instanceof PuzzleParseError)) throw error;
        message = error.message;
      }
      expect(message, `${testCase.file} was accepted`).not.toBeNull();
      expect(errorPaths(message as string)).toEqual(testCase.errorPaths);
    }
  });

  it("gives every reject case the paths it rejects at", () => {
    for (const testCase of manifest.cases) {
      if (!testCase.valid) {
        expect(
          testCase.errorPaths,
          `${testCase.file} is a reject case with no errorPaths`,
        ).toBeTruthy();
      }
    }
  });

  it("gives every accept case what it parses to", () => {
    // Asserting only that a file is accepted lets a parser accept it for the wrong
    // reason — reading `size` as a string, or defaulting a stated capacity to 1.
    for (const testCase of manifest.cases) {
      if (testCase.valid) {
        expect(
          testCase.expect,
          `${testCase.file} is an accept case with no expect`,
        ).toBeTruthy();
      }
    }
  });
});
