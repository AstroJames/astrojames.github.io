import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const templatePaths = [
  "/Users/beattijr/Documents/astrojames.github.io/layouts/_default/visa-appointments.html",
  "/Users/beattijr/Documents/astrojames.github.io/layouts/visa-appointments/single.html",
];

describe("visa appointment page template", () => {
  for (const templatePath of templatePaths) {
    it(`${templatePath} fetches status through the GitHub Contents API`, async () => {
      const template = await readFile(templatePath, "utf8");

      assert.match(template, /api\.github\.com\/repos\/AstroJames\/astrojames\.github\.io\/contents\/static\/visa-appointments\/status\.json/);
      assert.doesNotMatch(template, /raw\.githubusercontent\.com\/AstroJames\/astrojames\.github\.io\/main\/static\/visa-appointments\/status\.json/);
      assert.match(template, /application\/vnd\.github\.raw\+json/);
    });
  }
});
