let mockPathname = "/admin";
const mockRouter = {
  push(_href: string) {},
  replace(_href: string) {},
  refresh() {},
  back() {},
  forward() {},
  prefetch(_href: string) { return Promise.resolve(); },
};

export function setMockPathname(pathname: string) {
  mockPathname = pathname;
}

export function usePathname() {
  return mockPathname;
}

export function useRouter() {
  return mockRouter;
}
