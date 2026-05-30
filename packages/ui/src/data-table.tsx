// DaisyUI 5: https://daisyui.com/components/table/
"use client";
import type { ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  Cell as AriaCell,
  Column as AriaColumn,
  Row as AriaRow,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  type SortDescriptor,
} from "react-aria-components";

export type SortDirection = "asc" | "desc";

export type DataTableColumn<T extends object> = {
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

type DataTableProps<T extends object> = {
  readonly columns: ReadonlyArray<DataTableColumn<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly getRowKey: (row: T) => string;
  readonly onRowClick?: (row: T) => void;
  readonly sortBy?: string;
  readonly sortDirection?: SortDirection;
  readonly onSort?: (key: string, direction: SortDirection) => void;
  readonly pagination?: Pagination;
};

function SortIcon({ direction, active }: { direction?: SortDirection; active: boolean }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;
  if (direction === "asc") return <ChevronUp className="h-3 w-3" aria-hidden="true" />;
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
        className="btn btn-ghost"
        disabled={currentPage === 0}
        onClick={() => onChange((currentPage - 1) * limit)}
        aria-label="Previous page"
      >
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={`btn ${p === currentPage ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onChange(p * limit)}
          aria-current={p === currentPage ? "page" : undefined}
        >
          {p + 1}
        </button>
      ))}
      <button
        className="btn btn-ghost"
        disabled={currentPage === totalPages - 1}
        onClick={() => onChange((currentPage + 1) * limit)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

export function DataTable<T extends object>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  sortBy,
  sortDirection,
  onSort,
  pagination,
}: DataTableProps<T>) {
  const sortDescriptor: SortDescriptor | undefined =
    sortBy
      ? { column: sortBy, direction: sortDirection === "desc" ? "descending" : "ascending" }
      : undefined;

  function handleSortChange(descriptor: SortDescriptor) {
    if (!onSort) return;
    const dir: SortDirection = descriptor.direction === "descending" ? "desc" : "asc";
    onSort(String(descriptor.column), dir);
  }

  return (
    <div className="w-full overflow-x-auto sm:overflow-x-visible data-table-responsive">
      <AriaTable
        aria-label="Data table"
        className="table w-full"
        sortDescriptor={sortDescriptor}
        onSortChange={handleSortChange}
        onRowAction={
          onRowClick
            ? (key) => {
                const row = rows.find((r) => getRowKey(r) === String(key));
                if (row) onRowClick(row);
              }
            : undefined
        }
      >
        <AriaTableHeader>
          {columns.map((col) => (
             <AriaColumn
              key={col.key}
              id={col.key}
              isRowHeader={col.key === columns[0]?.key}
              allowsSorting={col.sortable}
              className="font-medium text-base-content/70 text-xs uppercase tracking-wide"
            >
              <div className="flex items-center gap-1">
                {col.label}
                {col.sortable ? (
                  <SortIcon
                    direction={sortBy === col.key ? sortDirection : undefined}
                    active={sortBy === col.key}
                  />
                ) : null}
              </div>
            </AriaColumn>
          ))}
        </AriaTableHeader>
        <AriaTableBody items={rows}>
          {(row) => (
            <AriaRow
              id={getRowKey(row)}
              className={onRowClick ? "cursor-pointer hover:bg-base-200/60" : ""}
            >
              {columns.map((col) => (
                <AriaCell key={col.key} className="text-sm text-base-content" data-label={col.label}>
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? "")}
                </AriaCell>
              ))}
            </AriaRow>
          )}
        </AriaTableBody>
      </AriaTable>
      {pagination && <PaginationBar {...pagination} />}
    </div>
  );
}
