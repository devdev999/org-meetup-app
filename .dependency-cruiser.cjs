// @ts-check
// Module boundaries. The application module (`src/application`) is a deep
// module: its interface is its root files, `index.ts` and `ports.ts`; its
// implementation in `lib/` is private. Everything else (web, worker,
// adapters, config) is an adapter over that interface and reaches it only
// through the entry points.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "application-internals-are-private",
      comment:
        "Only the application module's own implementation may import its lib/. Pages, the worker, adapters and the application's tests use index.ts and ports.ts.",
      severity: "error",
      from: { pathNot: "^src/application/(lib/|index\.ts|ports\.ts)" },
      to: { path: "^src/application/lib/" },
    },
    {
      name: "application-owns-no-adapters",
      comment:
        "The application depends on ports, never on adapters or processes; adapters are injected through createApplication.",
      severity: "error",
      from: { path: "^src/application/(lib/|index\\.ts|ports\\.ts)" },
      to: { path: "^src/(adapters|app|worker|config|db)/" },
    },
    {
      name: "worker-does-not-import-web",
      comment: "The worker and the web process share code through src/application, src/adapters and src/config only.",
      severity: "error",
      from: { path: "^src/worker/" },
      to: { path: "^src/(app|web)/" },
    },
    {
      name: "web-does-not-import-worker",
      comment: "The worker and the web process share code through src/application, src/adapters and src/config only.",
      severity: "error",
      from: { path: "^src/(app|web)/" },
      to: { path: "^src/worker/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
