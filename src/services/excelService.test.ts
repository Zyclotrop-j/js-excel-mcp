import { test } from "node:test";
import assert from "node:assert";
import { ExcelService } from "./excelService.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const excelService = new ExcelService();
const testDir = path.join(os.tmpdir(), "excel-mcp-tests");

test("ExcelService.writeExcel creates a file with correct data", async () => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFile = path.join(testDir, "test-write.xlsx");
  const testData = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ];

  const result = await excelService.writeExcel(testFile, testData);

  assert.ok(result.includes("Successfully wrote 2 rows"));
  assert.ok(fs.existsSync(testFile));

  // Cleanup
  fs.unlinkSync(testFile);
});

test("ExcelService.readExcel reads written data correctly", async () => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFile = path.join(testDir, "test-read.xlsx");
  const testData = [
    { name: "Charlie", age: 35 },
    { name: "Diana", age: 28 },
  ];

  await excelService.writeExcel(testFile, testData);
  const readData = await excelService.readExcel(testFile);

  assert.strictEqual(readData.length, 2);
  assert.strictEqual(readData[0].name, "Charlie");
  assert.strictEqual(readData[1].age, 28);

  // Cleanup
  fs.unlinkSync(testFile);
});

test("ExcelService.listSheets returns correct sheet names", async () => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFile = path.join(testDir, "test-sheets.xlsx");
  const testData = [{ col1: "value1" }];

  await excelService.writeExcel(testFile, testData, "CustomSheet");
  const sheets = await excelService.listSheets(testFile);

  assert.ok(sheets.includes("CustomSheet"));

  // Cleanup
  fs.unlinkSync(testFile);
});

test("ExcelService.writeExcel throws error on empty data", async () => {
  const testFile = path.join(testDir, "test-empty.xlsx");

  assert.rejects(
    async () => {
      await excelService.writeExcel(testFile, []);
    },
    /No data to write/
  );
});