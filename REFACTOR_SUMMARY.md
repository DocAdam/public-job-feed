# Refactoring Summary - Architecture Decomposition

## Date: 2026-08-13

## Status: Transitional architecture foundation

The directory structure and initial core modules are in place, but legacy
implementations remain active. Modules are retired only after their migration
contract and parity gate are complete.

## Objectives Completed

### 1. Created Core Module Structure ✅
- `src/core/classification/` - Title matching and review engines
- `src/core/deduplication/` - Deduplication and anomaly detection
- `src/core/models/` - Canonical schema and watchlist parsers
- `src/core/pipeline/` - Pipeline orchestration

### 2. Implemented Business Logic Modules ✅
- **Title Matching Engine** (`title-match.js`)
  - Token-based matching with weighted scoring
  - Strong/weak token classification
  - Confidence levels (high/medium/low)

- **Title Review Classification** (`title-review.js`)
  - Seniority detection (lead, senior, principal, etc.)
  - Leadership vs IC role identification
  - Domain signal extraction

- **Salary Detection Engine** (`salary-detect.js`)
  - Multi-currency salary range detection
  - Period classification (hourly, annual, equity)

- **Work Arrangement Detection** (`work-arrangement.js`)
  - Remote/hybrid/on-site classification
  - Country signal detection

- **Cross-Company Deduplication** (`job-dedupe.js`)
  - Company key normalization
  - Job key generation
  - Canonical record selection

- **ATS Anomaly Detection** (`ats-anomaly.js`)
  - Fetch failure rate monitoring
  - Job count delta analysis
  - Alert severity classification

### 3. Created Pipeline Orchestrator ✅
- `src/core/pipeline/engine.js` connects all engines
- Handles batch processing with context propagation
- Implements cross-company deduplication flow
- Provides unified enrichment interface

### 4. Established Canonical Schema ✅
- Defined in `src/core/models/job-record.js`
- Includes all engine-derived fields
- Clear separation of identity, content, and signal data

### 5. Built I/O Boundary Layer ✅
- CSV export adapter with BOM support
- ATS provider interface
- Configuration loading adapters

### 6. Created Entry Points ✅
- `src/index.js` - Public API with all exports
- `scripts/verify-architecture.js` - Architecture integrity verification
- Architecture verification checks passing

### 7. Documentation ✅
- `ARCHITECTURE.md` - Complete architecture overview
- Directory structure and layer responsibilities
- Data flow diagrams
- Migration status tracking

## Files Created (9 new modules)
1. `src/core/classification/title-match.js` (286 lines)
2. `src/core/classification/title-review.js` (172 lines)
3. `src/core/deduplication/ats-anomaly.js` (220 lines)
4. `src/core/models/job-record.js` (94 lines)
5. `src/core/pipeline/engine.js` (164 lines)
6. `src/adapters/exports/csv-builder.js` (73 lines)
7. `src/adapters/ingestion/index.js` (48 lines)
8. `src/lib/config-loader.js` (59 lines)
9. `scripts/verify-architecture.js` (120 lines)

## Files Updated (3 existing modules)
1. `src/lib/jobs-normalize.js` - Now wraps core pipeline
2. `src/core/deduplication/job-dedupe.js` - Fixed module path issue
3. `src/index.js` - New main entry point

## Configuration Files Created
- `config/title-watchlist.md` - Job title watchlist for matching
- `config/settings.json` - Pipeline configuration settings

## Architecture Benefits Achieved
1. **Pure Core Logic**: No I/O dependencies in business modules
2. **Testability**: All core modules can be tested in isolation
3. **Clear Boundaries**: Adapter pattern abstracts external systems
4. **Backward Compatibility**: Legacy code wrapped by adapter layer
5. **Documented Pipeline**: Clear data flow and module responsibilities

## Verification Status
✅ Architecture integrity checks passing:
- 9 core modules load successfully
- 2 adapter modules load successfully
- 2 config files exist
- Pipeline entry points properly exposed

## Next Steps for Migration
1. Use the migration contract to move one vertical workflow at a time
2. Add fixture parity tests before redirecting legacy consumers
3. Implement real ATS provider adapters before moving provider logic out of lib/ats
4. Design streaming JSON ingestion as a separate, approved scalability project
5. Deploy monitoring for anomaly detection alerts after its data contract is tested

## Key Design Decisions
1. Core modules have no direct filesystem, path, or network dependencies
2. Pipeline orchestrator handles all context propagation
3. Canonical schema defined in single source of truth
4. Watchlist configuration external to codebase
5. Anomaly detection integrated at pipeline level

See MIGRATION_CONTRACT.md for the active migration register and retirement
criteria.
