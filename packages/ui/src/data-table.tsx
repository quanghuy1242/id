// DaisyUI 5: https://daisyui.com/components/table/
import type { ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export type SortDirection = "asc" | "desc";

export type DataTableColumn<T> = {
  readonly key: string;
  readonly label: string;
  readonly sortable?: boolean;
  readonly render?: (row: T) => ReactNode;
};

type Pagination = {
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly onChange: (offset: number) => void;
};

type DataTableProps<T extends Record<string, unknown>> = {
  readonly columns: ReadonlyArray<DataTableColumn<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly getRowKey: (row: T) => string;
  readonly onRowClick?: (row: T) => void;
  readonly sortBy?: string;
  readonly sortDirection?: SortDirection;
  readonly onSort?: (key: string, direction: SortDirection) => void;
  readonly pagination?: Pagination;
};

function SortIcon({ colKey, sortBy, sortDirection }: { colKey: string; sortBy?: string; sortDirection?: SortDirection }) {
  if (colKey !== sortBy) return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;
  if (sortDirection === "asc") return <ChevronUp className="h-3 w-3" aria-hidden="true" />;
  return <ChevronDown className="h-3 w-3" aria-hidden="true" />;
}

function PaginationBar({ total, limit, offset, onChange }: Pagination) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  const currentPage = Math.floor(offset / limit);

  const pages: number[] = [];
  const start = Math.max(0, currentPage - 2);
  const end = Math.min(totalPages - 1, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-end gap-1 px-4 py-3 border-t border-base-300">
      <button
        className="btn btn-sm btn-ghost"
        disabled={currentPage === 0}
        onClick={() => onChange((currentPage - 1) * limit)}
        aria-label="Previous page"
      >
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={`btn btn-sm ${p === currentPage ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onChange(p * limit)}
          aria-current={p === currentPage ? "page" : undefined}
        >
          {p + 1}
        </button>
      ))}
      <button
        className="btn btn-sm btn-ghost"
        disabled={currentPage === totalPages - 1}
        onClick={() => onChange((currentPage + 1) * limit)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  sortBy,
  sortDirection,
  onSort,
  pagination,
}: DataTableProps<T>) {
  function handleSort(key: string) {
    if (!onSort) return;
    const nextDir: SortDirection =
      key === sortBy && sortDirection === "asc" ? "desc" : "asc";
    onSort(key, nextDir);
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="table table-sm w-full">
        <thead>
          <tr className="border-b border-base-300 bg-base-200/50">
            {columns.map((col) => (
              <th key={col.key} className="font-medium text-base-content/70 text-xs uppercase tracking-wide">
                {col.sortable ? (
                  <button
                    className="flex items-center gap-1 hover:text-base-content transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon colKey={col.key} sortBy={sortBy} sortDirection={sortDirection} />
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-base-300/50 ${onRowClick ? "cursor-pointer hover:bg-base-200/60" : ""}`}
            >
              {columns.map((col) => (
                <td key={col.key} className="text-sm text-base-content">
                  {col.render
                    ? col.render(row)
                    : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && <PaginationBar {...pagination} />}
    </div>
  );
}
