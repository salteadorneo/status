# Status Monitor

A lightweight, static status monitoring system for GitHub Pages. Monitor multiple services with automated checks every 5 minutes, zero dependencies, and a clean minimal interface.

## Features

- 🚀 **Zero Dependencies** - Pure Node.js with ES modules
- 📊 **Static Site Generation** - Works perfectly with GitHub Pages
- 🔄 **Automated Checks** - GitHub Actions runs checks every 10 minutes
- 🌐 **REST API** - JSON endpoints for each service
- 🎨 **Dark Mode Support** - Respects system theme preference
- 🌍 **Multi-language** - English and Spanish support
- 📱 **Responsive Design** - Mobile-friendly monospace interface
- 📈 **Historical Data** - Monthly archives with up to 30 days of history
- ⚡ **Minimal CSS** - ~500 bytes of inline CSS

## Project Structure

```
├── index.js              # Main script (checks + HTML generation)
├── config.json           # Service configuration
├── index.html            # Generated dashboard
├── service/              # Generated service detail pages
├── api/                  # Generated JSON endpoints
│   └── {service-id}/
│       ├── status.json   # Current status
│       └── history/
│           └── YYYY-MM.json  # Monthly history
├── badge/                # Generated status badges
├── lang/
│   ├── en.json           # English translations
│   └── es.json           # Spanish translations
└── .github/workflows/
    └── status-check.yml  # Automated checks workflow
```

## Quick Start

### 1. Clone and Configure

```bash
git clone <your-repo>
cd status
```

### 2. Configure Services

Edit `config.json`:

```json
{
  "language": "en",
  "services": [
    {
      "id": "my-service",
      "name": "My Service",
      "url": "https://example.com",
      "method": "GET",
      "expectedStatus": 200,
      "timeout": 10000
    }
  ]
}
```

### 3. Run Locally

```bash
npm run build
```

This generates:
- `index.html` - Dashboard
- `service/{id}.html` - Service detail pages
- `api/{id}/status.json` - Current status endpoints
- `api/{id}/history/YYYY-MM.json` - Historical data

### 4. Deploy to GitHub Pages

1. Enable GitHub Pages in repository Settings → Pages
2. Select source: **GitHub Actions**
3. Push to main branch
4. The workflow will automatically run every 10 minutes

## Configuration

### Service Configuration (`config.json`)

| Field | Type | Description |
|-------|------|-------------|
| `language` | string | UI language: `en` or `es` |
| `services` | array | List of services to monitor |
| `id` | string | Unique service identifier (used in URLs) |
| `name` | string | Display name |
| `url` | string | URL to check |
| `method` | string | HTTP method (`GET`, `POST`, etc.) |
| `expectedStatus` | number | Expected HTTP status code |
| `timeout` | number | Request timeout in milliseconds |

### Language Support

Change the UI language by editing `config.json`:

```json
{
  "language": "es"  // or "en"
}
```

Add new languages by creating `lang/{code}.json` based on existing files.

## API Endpoints

All endpoints return JSON data:

### Current Status
```
GET /api/{service-id}/status.json
```

Response:
```json
{
  "lastCheck": "2026-01-27T17:00:00.000Z",
  "status": "up",
  "statusCode": 200,
  "responseTime": 245,
  "timestamp": "2026-01-27T17:00:00.000Z",
  "error": null
}
```

### Historical Data
```
GET /api/{service-id}/history/YYYY-MM.json
```

Response:
```json
[
  {
    "timestamp": "2026-01-27T17:00:00.000Z",
    "status": "up",
    "statusCode": 200,
    "responseTime": 245,
    "error": null
  }
]
```

## Workflow Configuration

The GitHub Actions workflow (`.github/workflows/status-check.yml`) runs automatically every 10 minutes.

**Manual trigger:**
```bash
# Go to Actions tab → Status Check & Deploy → Run workflow
```

**Customization:**

Change check frequency by editing the cron schedule:
```yaml
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
```

## Development

### Local Testing

```bash
npm run build
```

### Running Tests

The project includes basic tests using Node.js native test runner:

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
```

Tests cover:
- Configuration validation
- Helper functions (timeAgo, formatDate)
- Badge generation
- Trend calculation
- File structure verification

### Adding Services

1. Add service to `config.json`
2. Run `npm run build`
3. Commit and push changes

### Retry Logic

Default configuration:
- **Retries:** 3 attempts
- **Retry delay:** 1000ms between attempts

Edit in `index.js`:
```javascript
const RETRIES = 3;
const RETRY_DELAY = 1000;
```

## Data Storage

- **Status checks:** Stored per service in `api/{id}/status.json`
- **History:** Monthly files with max 4,320 entries (~30 days at 10-minute intervals)
- **Historical visualization:** Last 60 days displayed on service pages
- **Automatic cleanup:** Old entries removed when limit reached

## Customization

### Styling

Edit `global.css` for custom styling. The default theme includes:
- Dark mode support via `@media (prefers-color-scheme: dark)`
- Responsive design
- Monospace typography
- Minimal footprint

### HTML Templates

Modify the `html()` function and generation logic in `index.js` to customize page structure.

### Status Badges

Each service has an auto-generated SVG badge available at:
```
/badge/{service-id}.svg
```

Embed in external pages:
```markdown
![Service Status](https://your-username.github.io/status/badge/service-id.svg)
```

## GitHub Pages Setup

1. **Repository Settings** → **Pages**
2. **Source:** GitHub Actions
3. **Custom domain** (optional): Configure in Settings

The workflow automatically deploys after each successful check.

## Troubleshooting

### Workflow not running
- Check Actions tab for errors
- Verify cron schedule syntax
- Ensure GitHub Actions is enabled

### 404 on GitHub Pages
- Confirm Pages is enabled with GitHub Actions source
- Wait 1-2 minutes after first deployment
- Check deployment status in Actions tab

### Services showing as down
- Verify URL is accessible
- Check timeout setting (increase if needed)
- Review expectedStatus code
- Check service logs in Actions tab

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.