# MCP Tool Calls — Q4 2025 Sales Dashboard

## 1. Create Workbook

```json
create_new_workbook
{
  "filename": "Q4_Sales_Dashboard.xlsx",
  "createDefaultWorksheet": "Executive Summary"
}
```

---

## 2. Executive Summary — Data

```json
set_cell
{
  "ref": "A1",
  "value": "Q4 2025 SALES DASHBOARD"
}

set_cell
{
  "ref": "A2",
  "value": "Confidential — Executive Overview"
}

set_cell
{
  "ref": "A4",
  "value": "KEY PERFORMANCE INDICATORS"
}

set_cells
{
  "range": "A6:B6",
  "values": [["Metric", "Value"]]
}

set_cells
{
  "range": "A7:B11",
  "values": [
    ["Total Revenue", 4825600],
    ["Units Sold", 31420],
    ["Avg Order Value", 153.57],
    ["Customer Retention", 0.923],
    ["New Customers", 2847]
  ]
}

set_cell
{
  "ref": "D4",
  "value": "QUARTERLY COMPARISON"
}

set_cells
{
  "range": "D6:H6",
  "values": [["Quarter", "Revenue", "Costs", "Profit", "Margin"]]
}

set_cells
{
  "range": "D7:H10",
  "values": [
    ["Q1 2025", 1045200, 682400, 362800, 0.347],
    ["Q2 2025", 1128400, 715600, 412800, 0.366],
    ["Q3 2025", 1298500, 801200, 497300, 0.383],
    ["Q4 2025", 1353500, 845300, 508200, 0.375]
  ]
}

set_cell
{
  "ref": "D11",
  "value": "TOTAL"
}

set_formula
{
  "ref": "E11",
  "formula": "=SUM(E7:E10)"
}

set_formula
{
  "ref": "F11",
  "formula": "=SUM(F7:F10)"
}

set_formula
{
  "ref": "G11",
  "formula": "=SUM(G7:G10)"
}

set_formula
{
  "ref": "H11",
  "formula": "=G11/E11"
}

set_cell
{
  "ref": "A13",
  "value": "TOP PERFORMERS"
}

set_cells
{
  "range": "A15:D15",
  "values": [["Rank", "Sales Rep", "Region", "Revenue"]]
}

set_cells
{
  "range": "A16:D21",
  "values": [
    ["1", "Sarah Chen", "Asia Pacific", 612400],
    ["2", "Marcus Weber", "EMEA", 587200],
    ["3", "Priya Sharma", "Asia Pacific", 534800],
    ["4", "James O'Brien", "Americas", 498600],
    ["5", "Ana Rodriguez", "Americas", 465300],
    ["6", "David Kim", "EMEA", 423100]
  ]
}
```

---

## 3. Executive Summary — Styling (Batch 1)

```json
merge_cells
{
  "range": "A1:H1"
}

set_cell_font
{
  "ref": "A1",
  "fontSize": 24,
  "fontColor": "FF1B2A4A"
}

set_cell_bold
{
  "ref": "A1",
  "bold": true
}

set_cell_font
{
  "ref": "A2",
  "fontSize": 11,
  "fontColor": "FF6B7280"
}

set_cell_background_color
{
  "ref": "A1",
  "color": "FFD4E6F1"
}

set_cell_background_color
{
  "ref": "A2",
  "color": "FFD4E6F1"
}

merge_cells
{
  "range": "A2:H2"
}

set_cell_bold
{
  "ref": "A4",
  "bold": true
}

set_cell_font
{
  "ref": "A4",
  "fontSize": 14,
  "fontColor": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "A6",
  "color": "FF1B2A4A"
}

set_cell_font
{
  "ref": "A6",
  "fontColor": "FFFFFFFF",
  "fontSize": 11
}

set_cell_bold
{
  "ref": "A6",
  "bold": true
}

set_cell_background_color
{
  "ref": "B6",
  "color": "FF1B2A4A"
}

set_cell_font
{
  "ref": "B6",
  "fontColor": "FFFFFFFF",
  "fontSize": 11
}

set_cell_bold
{
  "ref": "B6",
  "bold": true
}

set_cell_currency
{
  "ref": "B7",
  "symbol": "$",
  "decimals": 0
}

set_cell_number_format
{
  "ref": "B8",
  "formatString": "#,##0"
}

set_cell_currency
{
  "ref": "B9",
  "symbol": "$",
  "decimals": 2
}

set_cell_percent
{
  "ref": "B10",
  "decimals": 1
}

set_cell_number_format
{
  "ref": "B11",
  "formatString": "#,##0"
}

set_cell_border
{
  "ref": "A6",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "B6",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "A7",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "B7",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "A8",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "B8",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "A9",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "B9",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "A10",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "B10",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "A11",
  "borderStyle": "thin",
  "sides": "all"
}

set_cell_border
{
  "ref": "B11",
  "borderStyle": "thin",
  "sides": "all"
}
```

---

## 4. Executive Summary — Styling (Batch 2: Quarterly Table Headers)

```json
set_cell_bold
{
  "ref": "D4",
  "bold": true
}

set_cell_font
{
  "ref": "D4",
  "fontSize": 14,
  "fontColor": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "D6",
  "color": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "E6",
  "color": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "F6",
  "color": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "G6",
  "color": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "H6",
  "color": "FF1B2A4A"
}

set_cell_font
{
  "ref": "D6",
  "fontColor": "FFFFFFFF"
}

set_cell_font
{
  "ref": "E6",
  "fontColor": "FFFFFFFF"
}

set_cell_font
{
  "ref": "F6",
  "fontColor": "FFFFFFFF"
}

set_cell_font
{
  "ref": "G6",
  "fontColor": "FFFFFFFF"
}

set_cell_font
{
  "ref": "H6",
  "fontColor": "FFFFFFFF"
}
```

---

## 5. Executive Summary — Styling (Batch 3: Quarterly Number Formats)

```json
set_cell_number_format
{
  "ref": "E7",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E8",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E9",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E10",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F7",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F8",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F9",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F10",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "G7",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "G8",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "G9",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "G10",
  "formatString": "$#,##0"
}
```

---

## 6. Executive Summary — Styling (Batch 4: Margins + Total Row + Top Performers)

```json
set_cell_percent
{
  "ref": "H7",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H8",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H9",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H10",
  "decimals": 1
}

set_cell_bold
{
  "ref": "D11",
  "bold": true
}

set_cell_bold
{
  "ref": "E11",
  "bold": true
}

set_cell_bold
{
  "ref": "F11",
  "bold": true
}

set_cell_bold
{
  "ref": "G11",
  "bold": true
}

set_cell_bold
{
  "ref": "H11",
  "bold": true
}

set_cell_background_color
{
  "ref": "D11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "E11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "F11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "G11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "H11",
  "color": "FFE8EDF4"
}

set_cell_number_format
{
  "ref": "E11",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F11",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "G11",
  "formatString": "$#,##0"
}

set_cell_percent
{
  "ref": "H11",
  "decimals": 1
}

set_cell_bold
{
  "ref": "A13",
  "bold": true
}

set_cell_font
{
  "ref": "A13",
  "fontSize": 14,
  "fontColor": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "A15",
  "color": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "B15",
  "color": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "C15",
  "color": "FF1B2A4A"
}

set_cell_background_color
{
  "ref": "D15",
  "color": "FF1B2A4A"
}

set_cell_font
{
  "ref": "A15",
  "fontColor": "FFFFFFFF"
}

set_cell_font
{
  "ref": "B15",
  "fontColor": "FFFFFFFF"
}

set_cell_font
{
  "ref": "C15",
  "fontColor": "FFFFFFFF"
}

set_cell_font
{
  "ref": "D15",
  "fontColor": "FFFFFFFF"
}

set_cell_bold
{
  "ref": "A15",
  "bold": true
}

set_cell_bold
{
  "ref": "B15",
  "bold": true
}

set_cell_bold
{
  "ref": "C15",
  "bold": true
}

set_cell_bold
{
  "ref": "D15",
  "bold": true
}

set_cell_number_format
{
  "ref": "D16",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "D17",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "D18",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "D19",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "D20",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "D21",
  "formatString": "$#,##0"
}
```

---

## 7. Executive Summary — Layout

```json
freeze_panes
{
  "cellRef": "A3"
}

set_column_width
{
  "column": 1,
  "width": 18
}

set_column_width
{
  "column": 2,
  "width": 16
}

set_column_width
{
  "column": 4,
  "width": 14
}

set_column_width
{
  "column": 5,
  "width": 16
}
```

---

## 8. Regional Performance — Create & Data

```json
create_sheet
{
  "name": "Regional Performance"
}

set_cell
{
  "ref": "A1",
  "value": "REGIONAL PERFORMANCE BREAKDOWN"
}

set_cells
{
  "range": "A3:F3",
  "values": [["Region", "Revenue", "Growth %", "Market Share", "Top Product", "Satisfaction"]]
}

set_cells
{
  "range": "A4:F9",
  "values": [
    ["Americas", 1652300, 0.124, 0.342, "Cloud Enterprise", 4.6],
    ["EMEA", 1398400, 0.098, 0.29, "Data Platform", 4.4],
    ["Asia Pacific", 1187500, 0.187, 0.246, "AI Suite Pro", 4.7],
    ["Middle East", 312800, 0.245, 0.065, "Analytics Hub", 4.2],
    ["Africa", 156200, 0.312, 0.032, "Edge Connect", 4.1],
    ["Latin America", 118400, 0.156, 0.025, "Cloud Starter", 4.3]
  ]
}

set_cell
{
  "ref": "A11",
  "value": "MONTHLY TREND (Oct-Dec 2025)"
}

set_cells
{
  "range": "A13:E13",
  "values": [["Region", "October", "November", "December", "MoM Growth"]]
}

set_cells
{
  "range": "A14:E19",
  "values": [
    ["Americas", 512400, 548200, 591700, null],
    ["EMEA", 445600, 462800, 490000, null],
    ["Asia Pacific", 367800, 398400, 421300, null],
    ["Middle East", 92400, 104200, 116200, null],
    ["Africa", 44200, 51800, 60200, null],
    ["Latin America", 35600, 38400, 44400, null]
  ]
}

set_formula
{
  "ref": "E14",
  "formula": "=(D14-C14)/C14"
}

set_formula
{
  "ref": "E15",
  "formula": "=(D15-C15)/C15"
}

set_formula
{
  "ref": "E16",
  "formula": "=(D16-C16)/C16"
}

set_formula
{
  "ref": "E17",
  "formula": "=(D17-C17)/C17"
}

set_formula
{
  "ref": "E18",
  "formula": "=(D18-C18)/C18"
}

set_formula
{
  "ref": "E19",
  "formula": "=(D19-C19)/C19"
}
```

---

## 9. Regional Performance — Styling & Tables

```json
merge_cells
{
  "range": "A1:F1"
}

set_cell_bold
{
  "ref": "A1",
  "bold": true
}

set_cell_font
{
  "ref": "A1",
  "fontSize": 20,
  "fontColor": "FF1B2A4A"
}

set_cell_bold
{
  "ref": "A11",
  "bold": true
}

set_cell_font
{
  "ref": "A11",
  "fontSize": 14,
  "fontColor": "FF1B2A4A"
}

create_excel_table
{
  "name": "RegionalSummary",
  "range": "A3:F9",
  "columns": ["Region", "Revenue", "Growth %", "Market Share", "Top Product", "Satisfaction"],
  "style": "TableStyleMedium2"
}

add_autofilter
{
  "range": "A3:F9"
}

add_color_scale
{
  "range": "B4:B9"
}

add_color_scale
{
  "range": "D4:D9"
}
```

---

## 10. Regional Performance — Number Formats

```json
set_cell_number_format
{
  "ref": "B4",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "B5",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "B6",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "B7",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "B8",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "B9",
  "formatString": "$#,##0"
}

set_cell_percent
{
  "ref": "C4",
  "decimals": 1
}

set_cell_percent
{
  "ref": "C5",
  "decimals": 1
}

set_cell_percent
{
  "ref": "C6",
  "decimals": 1
}

set_cell_percent
{
  "ref": "C7",
  "decimals": 1
}

set_cell_percent
{
  "ref": "C8",
  "decimals": 1
}

set_cell_percent
{
  "ref": "C9",
  "decimals": 1
}
```

---

## 11. Regional Performance — Bar Chart

```json
select_sheet
{
  "name": "Regional Performance"
}

add_bar_chart
{
  "dataRange": "A4:B9",
  "anchorCell": "A22",
  "title": "Revenue by Region"
}
```

---

## 12. Product Breakdown — Create & Data

```json
create_sheet
{
  "name": "Product Breakdown"
}

set_cell
{
  "ref": "A1",
  "value": "PRODUCT LINE BREAKDOWN"
}

set_cells
{
  "range": "A3:H3",
  "values": [["Product", "Units Sold", "Revenue", "Avg Price", "COGS", "Gross Profit", "Margin", "Returns %"]]
}

set_cells
{
  "range": "A4:H10",
  "values": [
    ["Cloud Enterprise", 2840, 1420000, 500, 852000, 568000, null, 0.021],
    ["AI Suite Pro", 3250, 975000, 300, 526500, 448500, null, 0.034],
    ["Data Platform", 4120, 824000, 200, 494400, 329600, null, 0.018],
    ["Analytics Hub", 5680, 568000, 100, 369200, 198800, null, 0.042],
    ["Edge Connect", 8450, 676000, 80, 540800, 135200, null, 0.055],
    ["Cloud Starter", 7080, 354600, 50, 248220, 106380, null, 0.028]
  ]
}

set_formula
{
  "ref": "G4",
  "formula": "=F4/C4"
}

set_formula
{
  "ref": "G5",
  "formula": "=F5/C5"
}

set_formula
{
  "ref": "G6",
  "formula": "=F6/C6"
}

set_formula
{
  "ref": "G7",
  "formula": "=F7/C7"
}

set_formula
{
  "ref": "G8",
  "formula": "=F8/C8"
}

set_formula
{
  "ref": "G9",
  "formula": "=F9/C9"
}

set_cell
{
  "ref": "A11",
  "value": "TOTAL"
}

set_formula
{
  "ref": "B11",
  "formula": "=SUM(B4:B9)"
}

set_formula
{
  "ref": "C11",
  "formula": "=SUM(C4:C9)"
}

set_formula
{
  "ref": "D11",
  "formula": "=SUM(D4:D9)"
}

set_formula
{
  "ref": "E11",
  "formula": "=SUM(E4:E9)"
}

set_formula
{
  "ref": "F11",
  "formula": "=SUM(F4:F9)"
}

set_formula
{
  "ref": "G11",
  "formula": "=F11/C11"
}
```

---

## 13. Product Breakdown — Styling (Batch 1: Bold + Total Row BG)

```json
set_cell_bold
{
  "ref": "A11",
  "bold": true
}

set_cell_bold
{
  "ref": "B11",
  "bold": true
}

set_cell_bold
{
  "ref": "C11",
  "bold": true
}

set_cell_bold
{
  "ref": "D11",
  "bold": true
}

set_cell_bold
{
  "ref": "E11",
  "bold": true
}

set_cell_bold
{
  "ref": "F11",
  "bold": true
}

set_cell_bold
{
  "ref": "G11",
  "bold": true
}

set_cell_bold
{
  "ref": "H11",
  "bold": true
}

set_cell_background_color
{
  "ref": "A11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "B11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "C11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "D11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "E11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "F11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "G11",
  "color": "FFE8EDF4"
}

set_cell_background_color
{
  "ref": "H11",
  "color": "FFE8EDF4"
}
```

---

## 14. Product Breakdown — Number Formats (Batch 1: Revenue)

```json
set_cell_number_format
{
  "ref": "C4",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "C5",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "C6",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "C7",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "C8",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "C9",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "C11",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E4",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E5",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E6",
  "formatString": "$#,##0"
}
```

---

## 15. Product Breakdown — Number Formats (Batch 2: COGS + Profit)

```json
set_cell_number_format
{
  "ref": "E7",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E8",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E9",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "E11",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F4",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F5",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F6",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F7",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F8",
  "formatString": "$#,##0"
}

set_cell_number_format
{
  "ref": "F9",
  "formatString": "$#,##0"
}
```

---

## 16. Product Breakdown — Number Formats (Batch 3: Margins + Returns)

```json
set_cell_percent
{
  "ref": "G4",
  "decimals": 1
}

set_cell_percent
{
  "ref": "G5",
  "decimals": 1
}

set_cell_percent
{
  "ref": "G6",
  "decimals": 1
}

set_cell_percent
{
  "ref": "G7",
  "decimals": 1
}

set_cell_percent
{
  "ref": "G8",
  "decimals": 1
}

set_cell_percent
{
  "ref": "G9",
  "decimals": 1
}

set_cell_percent
{
  "ref": "G11",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H4",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H5",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H6",
  "decimals": 1
}
```

---

## 17. Product Breakdown — Tables, Conditional Formatting, Charts

```json
set_cell_percent
{
  "ref": "H7",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H8",
  "decimals": 1
}

set_cell_percent
{
  "ref": "H9",
  "decimals": 1
}

create_excel_table
{
  "name": "ProductBreakdown",
  "range": "A3:H10",
  "columns": ["Product", "Units Sold", "Revenue", "Avg Price", "COGS", "Gross Profit", "Margin", "Returns %"]
}

add_color_scale
{
  "range": "C4:C10"
}

add_color_scale
{
  "range": "F4:F10"
}

add_cell_value_rule
{
  "range": "H4:H10",
  "operator": "greaterThan",
  "value": 0.04,
  "fillColor": "FFFF6B6B"
}

add_cell_value_rule
{
  "range": "G4:G10",
  "operator": "greaterThan",
  "value": 0.4,
  "fillColor": "FF2ECC71"
}

add_bar_chart
{
  "dataRange": "A4:A10",
  "anchorCell": "A13",
  "title": "Revenue by Product"
}

set_cell
{
  "ref": "A28",
  "value": "Dashboard generated on July 19, 2026"
}

set_cell_font
{
  "ref": "A28",
  "fontSize": 9,
  "fontColor": "FF9CA3AF"
}
```

---

## 18. Executive Summary — Line Chart

```json
select_sheet
{
  "name": "Executive Summary"
}

add_line_chart
{
  "dataRange": "E7:G10",
  "anchorCell": "D13",
  "title": "Quarterly Revenue vs Profit",
  "smooth": true
}
```

---

## 19. Export

```json
export_workbook_to_url
{
  "filename": "Q4_Sales_Dashboard.xlsx",
  "autoclose": true
}
```
