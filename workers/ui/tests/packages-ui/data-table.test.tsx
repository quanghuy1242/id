// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "@id/ui";

type Item = {
  id: string;
  name: string;
  value: number;
};

const columns: DataTableColumn<Item>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "value", label: "Value", sortable: true },
];

const rows: Item[] = [
  { id: "a", name: "Alpha", value: 1 },
  { id: "b", name: "Beta", value: 2 },
  { id: "c", name: "Gamma", value: 3 },
];

describe("DataTable", () => {
  it("renders rows", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });

  it("renders an empty table without crashing", () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("calls onRowClick when a row is clicked", () => {
    const onRowClick = vi.fn<(row: Item) => void>();
    render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} onRowClick={onRowClick} />,
    );
    fireEvent.click(screen.getByText("Beta"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("calls onSort when a sortable column header is clicked", () => {
    const onSort = vi.fn<(key: string, dir: "asc" | "desc") => void>();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        sortBy="name"
        sortDirection="asc"
        onSort={onSort}
      />,
    );
    fireEvent.click(screen.getByText("Name"));
    expect(onSort).toHaveBeenCalledWith("name", "desc");
  });

  it("calls onSort with asc when clicking an unsorted column", () => {
    const onSort = vi.fn<(key: string, dir: "asc" | "desc") => void>();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        sortBy="name"
        sortDirection="asc"
        onSort={onSort}
      />,
    );
    fireEvent.click(screen.getByText("Value"));
    expect(onSort).toHaveBeenCalledWith("value", "asc");
  });

  it("does not throw when onSort is omitted", () => {
    render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} sortBy="name" />,
    );
    expect(() => fireEvent.click(screen.getByText("Name"))).not.toThrow();
  });

  it("renders pagination controls", () => {
    const onChange = vi.fn<(offset: number) => void>();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        pagination={{ total: 10, limit: 3, offset: 0, onChange }}
      />,
    );
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
  });

  it("hides pagination when single page", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        pagination={{ total: 3, limit: 5, offset: 0, onChange: () => {} }}
      />,
    );
    expect(screen.queryByLabelText("Next page")).toBeNull();
  });

  it("renders custom cell content via render function", () => {
    const customColumns: DataTableColumn<Item>[] = [
      { key: "name", label: "Name" },
      { key: "value", label: "Value", render: (r) => `$${r.value}.00` },
    ];
    render(<DataTable columns={customColumns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("$2.00")).toBeInTheDocument();
  });
});
