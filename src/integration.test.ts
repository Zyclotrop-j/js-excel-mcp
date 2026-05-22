import { test } from "node:test";
import assert from "node:assert";
import { ExcelService } from "./services/excelService.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const excelService = new ExcelService();
const testDir = path.join(os.tmpdir(), "excel-mcp-integration-tests");

test("E2E: Write, read, and list operations work together", async () => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFile = path.join(testDir, "e2e-test.xlsx");
  const originalData = [
    { id: 1, product: "Widget", price: 19.99 },
    { id: 2, product: "Gadget", price: 29.99 },
    { id: 3, product: "Doohickey", price: 9.99 },
  ];

  // Step 1: Write data
  const writeResult = await excelService.writeExcel(
    testFile,
    originalData,
    "Products"
  );
  assert.ok(writeResult.includes("Successfully wrote 3 rows"));

  // Step 2: List sheets
  const sheets = await excelService.listSheets(testFile);
  assert.ok(sheets.includes("Products"));
  assert.strictEqual(sheets.length, 1);

  // Step 3: Read the data back
  const readData = await excelService.readExcel(testFile, "Products");
  assert.strictEqual(readData.length, 3);
  assert.strictEqual(readData[0].product, "Widget");
  assert.strictEqual(readData[2].price, 9.99);

  // Step 4: Write additional sheet
  const additionalData = [
    { name: "Warehouse A", stock: 100 },
    { name: "Warehouse B", stock: 250 },
  ];
  await excelService.writeExcel(testFile, additionalData, "Warehouses");

  // Step 5: Verify multiple sheets exist
  const updatedSheets = await excelService.listSheets(testFile);
  assert.ok(updatedSheets.includes("Products"));
  assert.ok(updatedSheets.includes("Warehouses"));

  // Step 6: Read from new sheet
  const warehouseData = await excelService.readExcel(testFile, "Warehouses");
  assert.strictEqual(warehouseData.length, 2);
  assert.strictEqual(warehouseData[1].stock, 250);

  // Cleanup
  fs.unlinkSync(testFile);
});

test("E2E: Handles special characters and types", async () => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFile = path.join(testDir, "special-chars.xlsx");
  const testData = [
    {
      description: "Item with émojis 🚀",
      value: 123.45,
      active: true,
    },
    {
      description: 'Item with "quotes" and symbols €',
      value: 456.78,
      active: false,
    },
  ];

  await excelService.writeExcel(testFile, testData);
  const readData = await excelService.readExcel(testFile);

  assert.strictEqual(readData.length, 2);
  assert.ok(readData[0].description.includes("émojis"));
  assert.ok(readData[1].description.includes("quotes"));

  // Cleanup
  fs.unlinkSync(testFile);
});