import { useState, type ReactNode } from "react";
import { Badge, DataTable, type DataTableColumn, Inline, Stack, type SortDirection, Text } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Data Table" } satisfies StoryDefault;

type FileItem = {
  id: string;
  name: string;
  type: string;
  size: string;
  status: "active" | "archived" | "draft";
};

const files: FileItem[] = [
  { id: "1", name: "Roadmap.pdf", type: "PDF", size: "2.4 MB", status: "active" },
  { id: "2", name: "Budget.xlsx", type: "Spreadsheet", size: "856 KB", status: "draft" },
  { id: "3", name: "Welcome_Email.docx", type: "Document", size: "120 KB", status: "active" },
  { id: "4", name: "Job_Posting_8301.doc", type: "Document", size: "139 KB", status: "archived" },
  { id: "5", name: "logo.svg", type: "Image", size: "48 KB", status: "active" },
  { id: "6", name: "presentation.pptx", type: "Presentation", size: "4.1 MB", status: "draft" },
  { id: "7", name: "notes.txt", type: "Text", size: "2 KB", status: "archived" },
  { id: "8", name: "screenshot.png", type: "Image", size: "780 KB", status: "active" },
];

const columns: DataTableColumn<FileItem>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "size", label: "Size", sortable: true },
  {
    key: "status",
    label: "Status",
    render: (f: FileItem): ReactNode => {
      const toneMap = { active: "success" as const, archived: "neutral" as const, draft: "warning" as const };
      return <Badge tone={toneMap[f.status]}>{f.status}</Badge>;
    },
  },
];

export const Basic: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Files</Text>
    <DataTable
      columns={columns}
      rows={files}
      getRowKey={(f) => f.id}
    />
  </Stack>
);

export const Sortable: Story = () => {
  const [sortBy, setSortBy] = useState<string | undefined>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const sorted = [...files].sort((a, b) => {
    if (!sortBy) return 0;
    const key = sortBy as keyof FileItem;
    const aVal = String(a[key] ?? "");
    const bVal = String(b[key] ?? "");
    const cmp = aVal.localeCompare(bVal);
    return sortDir === "desc" ? -cmp : cmp;
  });

  return (
    <Stack gap="md">
      <Text variant="h2">Sortable Table (click column headers)</Text>
      <Inline gap="sm">
        <Badge tone="info">sorted by {sortBy} {sortDir}</Badge>
      </Inline>
      <DataTable
        columns={columns}
        rows={sorted}
        getRowKey={(f) => f.id}
        sortBy={sortBy}
        sortDirection={sortDir}
        onSort={(key, dir) => { setSortBy(key); setSortDir(dir); }}
      />
    </Stack>
  );
};

export const ClickableRows: Story = () => {
  const [clicked, setClicked] = useState<string | null>(null);

  return (
    <Stack gap="md">
      <Text variant="h2">Clickable Rows (click a row)</Text>
      {clicked !== null && (
        <Badge tone="info">Last clicked: {clicked}</Badge>
      )}
      <DataTable
        columns={columns}
        rows={files}
        getRowKey={(f) => f.id}
        onRowClick={(f) => setClicked(f.name)}
      />
    </Stack>
  );
};

export const Paginated: Story = () => {
  const limit = 3;
  const totalPages = Math.ceil(files.length / limit);
  const [offset, setOffset] = useState(0);
  const currentPage = Math.floor(offset / limit) + 1;

  const sliced = files.slice(offset, offset + limit);

  return (
    <Stack gap="md">
      <Text variant="h2">Paginated (3 per page)</Text>
      <Badge tone="info">Page {currentPage} of {totalPages}</Badge>
      <DataTable
        columns={columns}
        rows={sliced}
        getRowKey={(f) => f.id}
        pagination={{ total: files.length, limit, offset, onChange: setOffset }}
      />
    </Stack>
  );
};

export const Empty: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Empty Table</Text>
    <DataTable
      columns={columns}
      rows={[]}
      getRowKey={(f) => f.id}
    />
  </Stack>
);

export const AllFeatures: Story = () => {
  const limit = 5;
  const totalPages = Math.ceil(files.length / limit);
  const [sortBy, setSortBy] = useState<string | undefined>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [offset, setOffset] = useState(0);
  const [clicked, setClicked] = useState<string | null>(null);
  const currentPage = Math.floor(offset / limit) + 1;

  const sorted = [...files].sort((a, b) => {
    if (!sortBy) return 0;
    const key = sortBy as keyof FileItem;
    const aVal = String(a[key] ?? "");
    const bVal = String(b[key] ?? "");
    const cmp = aVal.localeCompare(bVal);
    return sortDir === "desc" ? -cmp : cmp;
  });

  const sliced = sorted.slice(offset, offset + limit);

  return (
    <Stack gap="md">
      <Text variant="h2">All Features — Sortable + Clickable + Paginated + Badge Renders</Text>
      <Inline gap="sm">
        <Badge tone="info">Try tab/arrow keys</Badge>
        <Badge tone="info">Click headers to sort</Badge>
      </Inline>
      <Inline gap="sm">
        <Badge tone="success">Sort: {sortBy} {sortDir}</Badge>
        <Badge tone="warning">Page {currentPage} of {totalPages}</Badge>
        {clicked !== null && <Badge tone="info">Row: {clicked}</Badge>}
      </Inline>
      <DataTable
        columns={columns}
        rows={sliced}
        getRowKey={(f) => f.id}
        onRowClick={(f) => setClicked(f.name)}
        sortBy={sortBy}
        sortDirection={sortDir}
        onSort={(key, dir) => { setSortBy(key); setSortDir(dir); }}
        pagination={{ total: files.length, limit, offset, onChange: setOffset }}
      />
    </Stack>
  );
};
