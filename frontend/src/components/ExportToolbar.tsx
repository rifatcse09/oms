import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ColDef = { key: string; label: string };

export type ExportToolbarProps = {
  /** Base filename without extension */
  filename: string;
  /** All available columns (for visibility toggle) */
  columns: ColDef[];
  /** Currently visible column keys */
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  /**
   * Called when any export is triggered.
   * Should return headers and rows of plain strings for the CURRENT visible/sorted data.
   */
  getData: () => { headers: string[]; rows: string[][] };
};

/* ─── helpers ─── */

function buildCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = "\uFEFF" + buildCsv(headers, rows); // BOM for Excel UTF-8
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

function exportExcel(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table>${`<tr>${th}</tr>`}${trs}</table></body></html>`;
  downloadBlob(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${filename}.xls`);
}

function exportPdf(printAreaRef: React.RefObject<HTMLDivElement | null>) {
  if (!printAreaRef.current) { window.print(); return; }
  const content = printAreaRef.current.innerHTML;
  const win = window.open("", "_blank");
  if (!win) { window.print(); return; }
  win.document.write(`<html><head><title>Export</title><style>
    body{font-family:sans-serif;font-size:12px;padding:16px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
    th{background:#f3f4f6;font-weight:600}
    tr:nth-child(even){background:#f9fafb}
  </style></head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

/* ─── component ─── */

export function ExportToolbar({ filename, columns, visibleColumns, onToggleColumn, getData }: ExportToolbarProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const handleExport = (type: "csv" | "excel" | "print" | "pdf") => {
    const { headers, rows } = getData();
    if (type === "csv")   return exportCsv(filename, headers, rows);
    if (type === "excel") return exportExcel(filename, headers, rows);
    if (type === "pdf")   return exportPdf(printRef);
    if (type === "print") {
      exportPdf(printRef);
    }
  };

  /* hidden print table rendered into DOM so exportPdf can grab innerHTML */
  const { headers, rows } = getData();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* hidden print table */}
      <div ref={printRef} className="hidden">
        <table>
          <thead>
            <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" className="h-9 gap-2 text-xs" onClick={() => handleExport("csv")}>
        <Download className="h-3.5 w-3.5" />
        Export to CSV
      </Button>

      <Button type="button" variant="outline" size="sm" className="h-9 gap-2 text-xs" onClick={() => handleExport("excel")}>
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Export to Excel
      </Button>

      <Button type="button" variant="outline" size="sm" className="h-9 gap-2 text-xs" onClick={() => handleExport("print")}>
        <Printer className="h-3.5 w-3.5" />
        Print
      </Button>

      <Button type="button" variant="outline" size="sm" className="h-9 gap-2 text-xs" onClick={() => handleExport("pdf")}>
        <FileText className="h-3.5 w-3.5" />
        Export to PDF
      </Button>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-2 text-xs">
            <Columns3 className="h-3.5 w-3.5" />
            Column visibility
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map((col) => (
            <DropdownMenuCheckboxItem
              key={col.key}
              checked={visibleColumns.has(col.key)}
              onCheckedChange={() => onToggleColumn(col.key)}
              onSelect={(e) => e.preventDefault()}
            >
              {col.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Hook to manage which columns are visible. */
export function useColumnVisibility(columns: ColDef[], defaultHidden: string[] = []) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set(defaultHidden));

  const visibleColumns = new Set(columns.map((c) => c.key).filter((k) => !hiddenKeys.has(k)));

  const toggleColumn = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isVisible = (key: string) => visibleColumns.has(key);

  return { visibleColumns, toggleColumn, isVisible };
}
