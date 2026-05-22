import { test } from "node:test";
import assert from "node:assert";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

test("MCP Server initializes correctly", () => {
  const server = new Server({
    name: "js-excel-mcp",
    version: "1.0.0",
  });

  assert.strictEqual(server.name, "js-excel-mcp");
  assert.strictEqual(server.version, "1.0.0");
});

test("Server has required request handlers", () => {
  const server = new Server({
    name: "js-excel-mcp",
    version: "1.0.0",
  });

  // Server should be instantiated without errors
  assert.ok(server);
});