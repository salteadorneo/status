# Release Management

Sistema simple para mantener releases con changelog automático.

## Comandos disponibles

### Crear release

```bash
# Incrementar patch version (1.0.2 → 1.0.3)
npm run release:patch

# Incrementar minor version (1.0.2 → 1.1.0)
npm run release:minor

# Incrementar major version (1.0.2 → 2.0.0)
npm run release:major

# Vista previa sin hacer cambios
npm run release:dry -- --dry
```

## Flujo de trabajo

### 1. Registrar cambios en el changelog

Edita `CHANGELOG.md` y añade tus cambios bajo la sección `[Unreleased]`:

```markdown
## [Unreleased]

### Added
- Nueva característica X
- Nueva característica Y

### Changed
- Cambio en comportamiento A
- Refactorización de módulo B

### Fixed
- Bug en función C
```

### 2. Crear la release

```bash
npm run release:patch
```

El script automáticamente:
- ✅ Valida que existan cambios unreleased
- ✅ Calcula la nueva versión
- ✅ Crea la sección de release en el changelog
- ✅ Actualiza `package.json` con la nueva versión
- ✅ Limpia la sección unreleased

### 3. Confirmar cambios en Git

```bash
git add CHANGELOG.md package.json
git commit -m "chore: release v1.0.3"
git tag v1.0.3
git push origin main --tags
```

## Formato de Changelog

Seguimos el estándar [Keep a Changelog](https://keepachangelog.com/):

- **Added** - Nuevas características
- **Changed** - Cambios en funcionalidad existente
- **Fixed** - Correcciones de bugs
- **Removed** - Características removidas
- **Deprecated** - Características próximas a removerse
- **Security** - Parches de seguridad

## Versionamiento Semántico

Usamos [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0) - Cambios incompatibles en la API
- **MINOR** (0.X.0) - Nuevas características retrocompatibles
- **PATCH** (0.0.X) - Correcciones de bugs

## Ejemplo completo

```bash
# 1. Editar CHANGELOG.md y añadir cambios

# 2. Vista previa del release
npm run release:dry patch

# 3. Crear el release
npm run release:patch

# 4. Revisar cambios
git status
git diff CHANGELOG.md
git diff package.json

# 5. Confirmar y etiquetar
git add CHANGELOG.md package.json
git commit -m "chore: release v1.0.3"
git tag v1.0.3
git push origin main --tags
```

## Notas

- Los scripts son zero-dependency, usan solo módulos nativos de Node.js
- El changelog y package.json se actualizan automáticamente
- Siempre hay una sección `[Unreleased]` vacía después de cada release
- Las fechas se generan automáticamente en formato ISO (YYYY-MM-DD)
