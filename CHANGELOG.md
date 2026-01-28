# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [1.0.3] - 2026-01-28

### Added
- Release management system with semantic versioning
- Automated changelog updates via npm scripts
- Release workflow documentation

## [1.0.2] - 2026-01-28

### Added
- TCP port monitoring support with native `net` module
- DNS resolution checks with native `dns/promises` module
- Multi-type service monitoring (HTTP, TCP, DNS)
- Maintenance mode for planned downtime
- Maintenance periods don't count as downtime in statistics
- Orange/yellow color scheme for maintenance status
- Hourly history display in "Xh" format (12h, 13h, etc.)

### Changed
- Refactored checker to support multiple check types
- Updated config parser to handle TCP/DNS service definitions
- History bars now exclude maintenance from uptime calculations
- GitHub Issues are not created for services in maintenance mode

### Fixed
- Services in maintenance no longer trigger false alerts

## [1.0.1] - 2026-01-20

### Added
- YAML configuration support (`config.yml`)
- Zero-dependency YAML parser

### Changed
- Configuration now prefers YAML over JSON
- Improved configuration parsing logic

## [1.0.0] - 2026-01-15

### Added
- Initial release
- HTTP/HTTPS service monitoring
- GitHub Actions automation every 10 minutes
- Static site generation for GitHub Pages
- Automatic GitHub Issues for incidents
- 60-day history visualization
- Dark mode support
- Multi-language support (English, Spanish)
- REST API with JSON endpoints
- SVG badge generation
- Response time tracking and sparklines
- Retry logic (3 attempts with 2s delay)

[Unreleased]: https://github.com/salteadorneo/status/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/salteadorneo/status/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/salteadorneo/status/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/salteadorneo/status/releases/tag/v1.0.0
