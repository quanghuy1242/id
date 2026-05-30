let mockPathname = "/admin";
let mockSearchParams = new URLSearchParams();
const mockRouter = {
  push(_href: string) {},
  replace(_href: string) {},
  refresh() {},
  back() {},
  forward() {},
  prefetch(_href: string) { return Promise.resolve(); },
};

export function setMockPathname(pathname: string) {
  const url = new URL(pathname, "https://id.example.test");
  mockPathname = url.pathname;
  mockSearchParams = url.searchParams;
}

export function usePathname() {
  return mockPathname;
}

export function useSearchParams() {
  return mockSearchParams;
}

export function useRouter() {
  return mockRouter;
}
