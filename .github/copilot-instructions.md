# Status Monitor - AI Coding Assistant Instructions

## System Architecture

This is a **zero-dependency, static site generator** for GitHub Pages that monitors service uptime. The entire system runs on GitHub Actions - no servers, databases, or external services.

**Critical workflow:** GitHub Actions runs every 10 minutes → `index.js` checks URLs → generates static HTML/JSON → commits to repo → deploys to GitHub Pages → `manage-issues.js` creates/closes GitHub Issues for incidents.

## File Responsibilities

- **`config.yml`**: Single source of truth for monitored services (YAML preferred over `config.json`)
- **`index.js`**: Main orchestrator - checks all services, generates HTML pages, writes JSON API endpoints
- **`manage-issues.js`**: GitHub Issues automation via `actions/github-script` (requires `github` and `context` objects)
- **`lib/yaml-parser.js`**: Zero-dependency YAML parser (avoid external YAML libraries)
- **`lib/checker.js`**: URL checking with 3 retries @ 2s delay via native `fetch()`
- **`lib/generators.js`**: HTML generation for history bars, SVG badges, and sparklines
- **`lib/html.js`**: Full HTML page template generator
- **`lib/utils.js`**: Date formatting, trend calculation, history file reading

## Data Flow & Storage

**Generated artifacts** (all git-committed):
- `index.html` - Dashboard with all services
- `service/{service-id}.html` - Individual service detail pages
- `api/{service-id}/status.json` - Current status endpoint
- `api/{service-id}/history/YYYY-MM.json` - Monthly historical data
- `badge/{service-id}.svg` - Embeddable status badge

**Service ID generation**: Auto-generated from service name: `toLowerCase().replace(/[^a-z0-9]+/g, '-')`

## Key Patterns

### Configuration Parsing
Always check for `config.yml` first, fallback to `config.json`. The YAML parser normalizes `checks` or `services` arrays into a unified structure with defaults:
```javascript
{
  id: check.id || generateId(check.name),
  method: check.method || 'GET',
  expectedStatus: check.expectedStatus || check.expected || 200,
  timeout: check.timeout || 10000
}
```

### Service Status Structure
All status JSON files follow this exact shape:
```javascript
{
  lastCheck: "2026-01-28T10:00:00.000Z",
  status: "up" | "down",
  statusCode: 200 | null,
  responseTime: 123,  // milliseconds
  timestamp: "2026-01-28T10:00:00.000Z",
  error: "error message" | null
}
```

### History Aggregation
- History bars group checks into 24h/30d/60d periods
- Period aggregation: hourly (24h) or daily (30d/60d)
- Uptime % per period: `upChecks / totalChecks * 100` (≥95% = green, <95% = red)
- All history uses `historyMap.get(key)` pattern for efficient lookup

### HTML Generation
The `generateHTML()` function in `lib/html.js` takes `(title, body, cssPath, includeScript, language, version)`. Service pages include inline JS for period filtering (24h/30d/60d buttons).

## Development Workflow

**Local development:**
```bash
npm run dev        # Watch mode (--watch)
npm run build      # Single run
npm test           # Run Node.js native test runner
npm run test:watch # Watch mode for tests
```

**Testing changes:** Edit `config.yml` → run `node index.js` → inspect generated `index.html` and `api/` directory.

## Critical Constraints

1. **Zero external dependencies** - Only Node.js built-ins (`fs`, `path`, `fetch`)
2. **ES Modules only** - All files use `import`/`export`, no CommonJS
3. **JSDoc types throughout** - Maintain type definitions at file tops
4. **All output must be git-committable** - GitHub Actions auto-commits generated files with `[skip ci]`
5. **Retries are mandatory** - `checkUrl()` always does 3 retries with 2s delay before declaring service down

## GitHub Actions Integration

The workflow `.github/workflows/status-check.yml` requires these permissions:
- `contents: write` (commit generated files)
- `issues: write` (create/close incident issues)  
- `pages: write` + `id-token: write` (deploy to GitHub Pages)

**Issue management:** `manage-issues.js` expects `github` and `context` objects from `actions/github-script`. It searches for open issues with label `incident` and title pattern `🔴 {service.name} is down`.

## Language Support

Language files in `lang/{code}.json` contain translations. The `locale` variable (es-ES or en-US) is used throughout for `toLocaleString()` date formatting. Always use `lang.{key}` for UI strings, never hardcode English text.

## Common Pitfalls

- Don't use `require()` - this is pure ESM
- Service IDs must match across `config.yml`, filesystem paths, and HTML hrefs
- History JSON files are monthly - never overwrite entire history, only append to current month
- Badge SVG generation is hardcoded (6px per character + 10px padding) - don't change without testing
- GitHub Actions runs on UTC - all timestamps are ISO 8601 format

## Testing

Tests use Node.js native test runner (`node:test`, `node:assert`). No external test frameworks. Test files include minimal copies of functions to avoid circular dependencies.
