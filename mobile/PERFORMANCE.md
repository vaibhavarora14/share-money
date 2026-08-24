# Performance benchmarks

Last measured: 2026-08-24

## Production export benchmark

The benchmark uses production Metro exports with a single worker so module and
artifact comparisons are reproducible. Build duration is deliberately excluded:
Metro's local transform cache makes back-to-back timing misleading, while the
exported byte counts are deterministic for a fixed dependency lockfile.

```bash
# Android
EXPO_NO_TELEMETRY=1 npx expo export \
  -p android \
  --output-dir /tmp/sharedmoney-export \
  --max-workers 1

# Web app
npm run export:web:sharedmoney --workspace=mobile
```

The before and after exports were produced in the same worktree on Node
24.16.0 and npm 11.13.0. Gzip measurements use macOS `gzip -c` and represent a
consistent transfer-size proxy; the raw Hermes bundle is the more direct
Android artifact measurement.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Included icon-font families | 19 | 1 | -94.74% |
| Icon-font bytes | 4,076,840 | 1,307,660 | -67.92% |
| Web modules | 1,514 | 1,459 | -3.63% |
| Web JavaScript bytes | 3,116,814 | 2,844,572 | -8.73% |
| Web JavaScript gzip bytes | 816,114 | 724,061 | -11.28% |
| Android modules | 1,922 | 1,867 | -2.86% |
| Android Hermes bundle bytes | 5,743,009 | 5,549,048 | -3.38% |
| Android Hermes gzip bytes | 2,491,682 | 2,379,799 | -4.49% |
| Android asset bytes | 4,091,542 | 1,322,362 | -67.68% |
| Total Android export bytes | 9,836,489 | 6,872,214 | -30.14% |

## Bottleneck and fix

Three components imported `MaterialCommunityIcons` from the
`@expo/vector-icons` package root. That CommonJS entry point requires every
icon family, so Metro included 19 font files and the corresponding modules.
Importing `@expo/vector-icons/MaterialCommunityIcons` directly preserves the
same component API while including only the font the app uses.

Run the fast regression guard with:

```bash
npm run test:icon-imports --workspace=mobile
```

The guard fails if mobile source code reintroduces the package-root import.
