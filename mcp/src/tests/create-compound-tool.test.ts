import { describe, it, expect } from "vitest";
import { z } from "zod";
import { CreateCompoundTool, textResult } from "../helpers/create-compound-tool.js";

describe("textResult", () => {
  it("creates a text content block", () => {
    const result = textResult("hello");
    expect(result).toEqual({
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("sets isError when true", () => {
    const result = textResult("bad", true);
    expect(result).toEqual({
      content: [{ type: "text", text: "bad" }],
      isError: true,
    });
  });

  it("omits isError when false/undefined", () => {
    expect(textResult("ok", false)).not.toHaveProperty("isError");
    expect(textResult("ok")).not.toHaveProperty("isError");
  });
});

describe("CreateCompoundTool", () => {
  function makeTestTool() {
    return CreateCompoundTool(
      "test_tool",
      "A test tool",
      {
        greet: {
          description: "Says hello",
          required: ["name"],
          handler: async (args) => textResult(`Hello, ${args.name}!`),
        },
        count: {
          description: "Counts to N",
          handler: async (args) =>
            textResult(`Counted to ${(args.n as number) ?? 10}`),
        },
        fail: {
          description: "Always throws",
          handler: async () => {
            throw new Error("boom");
          },
        },
      },
      {
        name: z.string().optional(),
        n: z.number().optional(),
      },
    );
  }

  it("returns a function (lazy init pattern)", () => {
    const toolFn = makeTestTool();
    expect(typeof toolFn).toBe("function");
  });

  it("produces a ToolDefinition with correct name", () => {
    const tool = makeTestTool()();
    expect(tool.name).toBe("test_tool");
  });

  it("generates description listing all actions", () => {
    const tool = makeTestTool()();
    expect(tool.description).toContain("A test tool");
    expect(tool.description).toContain("greet: Says hello");
    expect(tool.description).toContain("count: Counts to N");
    expect(tool.description).toContain("fail: Always throws");
  });

  it("includes action enum in schema", () => {
    const tool = makeTestTool()();
    expect(tool.schema.action).toBeDefined();
    // Verify it's a Zod enum with the right values
    const parsed = tool.schema.action.parse("greet");
    expect(parsed).toBe("greet");
  });

  it("dispatches to the correct action handler", async () => {
    const tool = makeTestTool()();
    const result = await tool.handler({ action: "greet", name: "World" }, {} as never);
    expect(result.content[0].text).toBe("Hello, World!");
  });

  it("dispatches to action without required params", async () => {
    const tool = makeTestTool()();
    const result = await tool.handler({ action: "count", n: 5 }, {} as never);
    expect(result.content[0].text).toBe("Counted to 5");
  });

  it("returns error when required param is missing", async () => {
    const tool = makeTestTool()();
    const result = await tool.handler({ action: "greet" }, {} as never);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Action "greet" requires: name');
  });

  it("returns error when required param is empty string", async () => {
    const tool = makeTestTool()();
    const result = await tool.handler({ action: "greet", name: "" }, {} as never);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("requires: name");
  });

  it("returns error when required param is null", async () => {
    const tool = makeTestTool()();
    const result = await tool.handler({ action: "greet", name: null }, {} as never);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("requires: name");
  });

  it("catches handler exceptions and returns error", async () => {
    const tool = makeTestTool()();
    const result = await tool.handler({ action: "fail" }, {} as never);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error in test_tool/fail: boom");
  });
});
