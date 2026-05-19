// This file deliberately uses raw HTML and DaisyUI/Tailwind classes in an admin route file
// to trigger architecture/ui-route-composition

export default function BrokenAdminPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Broken page</h1>
      <p className="text-sm">This uses forbidden raw tags and classes.</p>
      <button className="btn btn-primary">Click me</button>
    </div>
  );
}
