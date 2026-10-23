"""用 formulas 库重算 03_营收模型.xlsx，打印关键结果，用于校验公式与在计划书中引用。"""
import sys
from pathlib import Path

import formulas

path = Path(__file__).resolve().parent.parent / "03_营收模型.xlsx"
scenario = int(sys.argv[1]) if len(sys.argv) > 1 else 2

xl = formulas.ExcelModel().loads(str(path)).finish()
inputs = {}
if scenario != 2:
    inputs[f"'[{path.name}]假设'!C3"] = scenario
sol = xl.calculate(inputs=inputs)

vals = {}
for k, v in sol.items():
    try:
        vals[k.upper()] = v.value[0][0]
    except Exception:
        pass


def get(sheet, cell):
    key = f"'[{path.name}]{sheet}'!{cell}".upper()
    return vals.get(key)


import openpyxl  # noqa: E402

wb = openpyxl.load_workbook(path)
for sheet in ["收入测算", "成本测算", "损益与现金", "单位经济"]:
    ws = wb[sheet]
    print(f"\n=== {sheet} ===")
    for r in range(4, ws.max_row + 1):
        label = ws.cell(row=r, column=1).value
        if not label or ws.cell(row=r, column=3).value is None:
            continue
        row_vals = []
        for col in "CDEFG":
            v = get(sheet, f"{col}{r}")
            if isinstance(v, (int, float)):
                row_vals.append(f"{v:>14,.2f}" if abs(v) < 100 else f"{v:>14,.0f}")
            else:
                row_vals.append(f"{str(v):>14}")
        print(f"{label[:22]:<24}" + "".join(row_vals))

ws = wb["敏感性"]
print("\n=== 敏感性 ===")
for r in range(3, ws.max_row + 1):
    cells = []
    for col in "ABCDEF":
        if ws[f"{col}{r}"].value is None:
            cells.append("")
            continue
        v = get("敏感性", f"{col}{r}")
        if v is None:
            v = ws[f"{col}{r}"].value
        cells.append(f"{v:,.2f}" if isinstance(v, (int, float)) else str(v))
    if any(cells):
        print(" | ".join(cells))
