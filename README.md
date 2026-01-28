# Status Monitor

A lightweight, static status monitoring system for GitHub Pages. Monitor multiple services with automated checks every 10 minutes, zero dependencies, and a clean minimal interface with automatic incident notifications.

![Web](https://salteadorneo.github.io/status/badge/web.svg)

## Features

- 🚀 **Zero Dependencies** - Pure Node.js with ES modules
- 📊 **Static Site Generation** - Works perfectly with GitHub Pages
- 🔄 **Automated Checks** - GitHub Actions runs checks every 10 minutes
- 🔔 **Incident Notifications** - Automatic GitHub Issues creation for service outages
- 🌐 **REST API** - JSON endpoints for each service
- 🎨 **Dark Mode Support** - Respects system theme preference
- 🌍 **Multi-language** - English and Spanish support
- 📱 **Responsive Design** - Mobile-friendly minimal interface
- 📈 **Historical Data** - 60-day history visualization on dashboard
- ⚡ **Minimal CSS** - Clean, monospace design
- 🔌 **Multi-Protocol** - HTTP/HTTPS, TCP ports, DNS resolution
- 🛠️ **Maintenance Mode** - Mark services as under maintenance
- 📋 **Copy to Clipboard** - One-click API endpoint copying

## Quick Start

### 1. Clone and Configure

```bash
git clone <your-repo>
cd status
```

### 2. Configure Services

Edit `config.yml`:

```yaml
language: en

checks:
  - name: My Website
    url: https://example.com
  
  - name: API (POST check)
    url: https://api.example.com/status
    method: POST
    expected: 201
  
  - name: Database
    type: tcp
    host: db.example.com
    port: 5432
  
  - name: DNS Check
    type: dns
    domain: example.com
  
  - name: Planned Maintenance
    url: https://example.com/health
    maintenance: Scheduled maintenance
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

### 4. (Optional) Custom domain

1. Add your subdomain in **Settings** → **Pages** → **Custom domain**
2. Point your DNS: `status.yourdomain.com` → GitHub Pages
3. That's it!

## What You Get

- **Live dashboard** - Clean, minimal interface showing all services
- **Auto-checks** - Every 10 minutes via GitHub Actions
- **60-day history** - Visual timeline on each service
- **Incident alerts** - GitHub Issues created/closed automatically
- **JSON API** - `/api/{service}/status.json` for your own tools
- **Status badges** - Embeddable SVG badges

## How It Works

1. **GitHub Actions** runs `index.js` every 10 minutes
2. Checks each service URL and saves results
3. Generates static HTML pages and JSON endpoints
4. If a service goes down → creates a GitHub Issue (email notification)
5. When it recovers → closes the issue automatically
6. Deploys everything to GitHub Pages

**No servers. No databases. No external services.**

## Configuration

One file: `config.yml`

### HTTP/HTTPS Services

```yaml
checks:
  - name: Website
    url: https://example.com
    method: GET              # Optional: GET, POST, HEAD (default: GET)
    expected: 200            # Optional (default: 200)
    timeout: 10000           # Optional in ms (default: 10000)
```

### TCP Port Monitoring

```yaml
checks:
  - name: Database
    type: tcp
    host: db.example.com
    port: 5432
    timeout: 5000            # Optional in ms
```

### DNS Resolution

```yaml
checks:
  - name: DNS Record
    type: dns
    domain: example.com
    timeout: 5000            # Optional in ms
```

### Maintenance Mode

Mark a service as under maintenance - won't trigger alerts:

```yaml
checks:
  - name: API
    url: https://api.example.com
    maintenance: "Planned maintenance until 2026-01-29"
```

### Global Settings

```yaml
language: en                                          # "en" or "es"
report: https://github.com/user/repo/issues/new    # Optional: "Report" link
```

**report examples:**
- External URL: `https://github.com/user/repo/issues/new`
- Email (auto-detected): `support@example.com` → becomes `mailto:support@example.com`
- If not set, the link won't be displayed

**All IDs are auto-generated** from service names (kebab-case)

## Local Development

Want to test locally before pushing?

```bash
node index.js
```

Open `index.html` in your browser. That's your status page.

## Advanced

### Incident Notifications

The system automatically creates GitHub Issues when services go down and closes them when services recover.

**How it works:**

1. **Service goes down** → Creates GitHub Issue with label `incident`
2. **Service recovers** → Adds comment and closes the issue automatically
3. **You get email** → GitHub notifies repository owner on both events

No additional configuration needed! Uses GitHub's built-in `GITHUB_TOKEN`.

Services in **maintenance mode** don't trigger incident issues.

**Customization:**  
Edit `manage-issues.js` to modify notification behavior or `lang/{code}.json` to add new languages.

### Copy to Clipboard

API endpoints have a copy button for quick clipboard access. Click the clipboard icon to copy the full API URL.

### Check Frequency

Edit `.github/workflows/status-check.yml`:

```yaml
schedule:
  - cron: '*/10 * * * *'  # Every 10 minutes
  - cron: '*/5 * * * *'   # Every 5 minutes
  - cron: '0 * * * *'     # Every hour
```

### Status Badges

Embed in your README or docs:

```markdown
![API Status](https://yourusername.github.io/status/badge/api.svg)
```

### JSON API

```bash
# Current status
GET /api/{service-id}/status.json

# Monthly history
GET /api/{service-id}/history/2026-01.json
```

## Use Cases

- 🧑‍💻 **Side projects** - Show uptime to users
- 🏗️ **Indie SaaS** - Transparent status without paying $99/mo
- 🧪 **Labs/experiments** - Monitor dev/staging environments
- 🏠 **Homelab** - Track your self-hosted services
- 📦 **Open source** - Public status for your project's API
- 🤖 **Bots/automation** - Check if your workers are alive

## Why Not Upptime?

Upptime is great, but:
- More complex setup
- More opinionated structure
- Harder to customize

This is simpler. One config file. Fork and go.

## Project Structure

```
config.yml            # ← Your services (YAML format, main config)
index.js              # Monitoring orchestrator
manage-issues.js      # GitHub Issues automation
lib/
  checker.js          # URL/TCP/DNS checking logic
  generators.js       # HTML and badge generation
  utils.js            # Utility functions
  yaml-parser.js      # Zero-dependency YAML parser
  html.js             # HTML template generator
lang/                 # Translation files
.github/workflows/    # GitHub Actions
```

Generated files (committed to git, don't edit directly):
```
index.html            # Dashboard
service/              # Detail pages
api/                  # JSON endpoints
badge/                # SVG badges
```

## FAQ

**Q: How much does this cost?**  
A: $0. GitHub Actions free tier: 2,000 minutes/month. Checking 7 services every 10 minutes uses ~150 minutes/month.

**Q: Can I monitor internal/private services?**  
A: Yes, if they're accessible from GitHub's runners (public IPs or VPN).

**Q: What happens if GitHub Actions goes down?**  
A: Your status page (already deployed) stays up. Checks pause until Actions recovers.

**Q: Can I customize the design?**  
A: Yes! Edit `global.css` and the HTML generation in `index.js`.

**Q: How do I get email alerts?**  
A: GitHub automatically emails you when issues are created/closed. No setup needed.

## Contributing

Pull requests welcome! This is meant to stay simple, but improvements are always appreciated.

## License

MIT - Fork it, use it, modify it.