import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config";

describe("Vite desktop packaging config", () => {
  it("uses relative asset URLs so Electron loadFile can render packaged pages", () => {
    expect(viteConfig).toMatchObject({
      base: "./"
    });
  });
});
