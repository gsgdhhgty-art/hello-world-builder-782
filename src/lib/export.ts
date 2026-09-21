import * as XLSX from "xlsx";

export type ExportCell = string | number | null | undefined;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(filename: string, headers: string[], rows: ExportCell[][]) {
  const quote = (value: ExportCell) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(quote).join(",")).join("\n")}`;
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export function exportExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: ExportCell[][],
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header, index) => ({
    wch: Math.min(
      40,
      Math.max(header.length + 4, ...rows.map((row) => String(row[index] ?? "").length + 2)),
    ),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
