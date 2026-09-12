# Verify Repository Permissions

Observed paths:

- `tsconfig.tsbuildinfo`: owned by `calebyoung:staff`, mode `-rw-r--r--`.
- `.next-production/cache/eslint`: owned by `calebyoung:staff`, mode `drwxr-xr-x`.

The owner write bits are present. The earlier EPERM came from the restricted Codex process, not from a missing owner write bit. The current normal typecheck and lint commands now write successfully; use this page if the issue returns.

```sh
cd /Users/calebyoung/Documents/Codex/XMASKEDFREAKS
ls -lde tsconfig.tsbuildinfo .next-production/cache/eslint .
test -w tsconfig.tsbuildinfo && echo SET || echo UNAVAILABLE
test -w .next-production/cache/eslint && echo SET || echo UNAVAILABLE
```

Do not run permission changes automatically. Do not use `chmod 777`.
