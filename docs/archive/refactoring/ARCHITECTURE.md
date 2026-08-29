# Public Job Feed - Architecture Documentation

## Overview
The Public Job Feed system aggregates job data from public ATS (Applicant Tracking System) providers and outputs canonical, deduplicated job records in CSV format. This document describes the decomposed architecture on the `refactor/arch-decomposition` branch.

## Directory Structure
```
public-job-feed/
├── src/
│   ├── core/                    # Business logic layer (no I/O dependencies)
│   │   ├── classification/      # Title and work arrangement classifiers
│   │   │   ├── title-match.js   # Token-based title matching engine
│   │   │   └── title-review.js  # Title review classification engine
│   │   ├── deduplication/       # Deduplication and anomaly detection
│   │   │   ├── job-dedupe.js    # Cross-company deduplication engine
│   │   │   ├── salary-detect.js # Salary range detection engine
│   │   │   └── ats-anomaly.js   # ATS provider anomaly detection
│   │   ├── models/              # Data models and canonical schema
│   │   │   ├── job-record.js    # Canonical job record factory
│   │   │   └── job-titles.js    # Pure title normalization and watchlist parsing
│   │   └── pipeline/            # Pipeline orchestration
│   │       └── engine.js        # Full ETL pipeline orchestrator
│   ├── adapters/                # I/O boundary layer (external dependencies)
│   │   ├── exports/             # Export format adapters
│   │   │   ├── csv-builder.js   # In-memory CSV formatting adapter
│   │   │   └── export-dedupe.js # Transitional export-row selection adapter
│   │   └── ingestion/           # ATS provider adapters
│   │       └── index.js         # ATS provider interface
│   ├── lib/                     # Legacy code (being migrated to core)
│   │   ├── config-loader.js     # Configuration loading
│   │   ├── normalize-catalog.js # Catalog normalization (legacy)
│   │   └── jobs-normalize.js    # Jobs normalization (adapter layer)
│   └── scripts/                 # CLI orchestration scripts
│       ├── download-catalogs.js # ATS catalog ingestion
│       ├── export-public-slices.js # CSV export orchestrator
│       └── ...                  # Other 60+ CLI scripts
├── config/                      # Configuration files
│   ├── title-watchlist.md       # Job title watchlist for matching
│   └── settings.json            # Pipeline configuration settings
├── data/                        # Output state (97GB CSVs)
│   ├── catalogs/                # ATS catalog JSON files
│   ├── jobs/                    # Processed job CSV files
│   │   ├── batches/             # Per-ATS batch CSVs
│   │   └── index/               # Processing index CSVs
│   └── exports/                 # Final export packages
└── ARCHITECTURE.md              # This file
```

## Core Layers

### 1. `src/core/` - Business Logic Layer
Contains business logic with no direct filesystem, path, or network dependencies.

**Purpose:** Domain-specific algorithms and data transformations.

**Components:**
- **classification/**: Title matching, seniority detection, work arrangement analysis
- **deduplication/**: Cross-company deduplication, salary detection, anomaly detection
- **models/**: Canonical schema definition, watchlist parsing
- **pipeline/**: Pipeline orchestration logic

**Key Files:**
- `core/pipeline/engine.js`: Main pipeline orchestrator connecting all engines
- `core/classification/title-match.js`: Token-based title matching with weighted scoring
- `core/models/job-record.js`: Canonical output schema definition

### 2. `src/adapters/` - I/O Boundary Layer
Contains boundaries for external protocols and data format transformations.

**Purpose:** Keep external systems and output concerns outside core logic.

**Components:**
- **exports/csv-builder.js**: In-memory CSV formatting, escaping, and BOM handling
- **exports/export-dedupe.js**: Transitional copy of export-row selection logic
- **ingestion/index.js**: ATS-provider registry and validation (not provider implementations yet)

### 3. `src/lib/` - Legacy Adapter Layer
Bridges legacy code with new architecture during migration.

**Purpose:** Maintain backward compatibility while core modules are being adopted.

**Components:**
- `config-loader.js`: Configuration loading (calls core modules)
- `jobs-normalize.js`: Normalize jobs (wraps core pipeline)

### 4. `src/scripts/` - CLI Orchestration Layer
Handles command-line execution, file I/O, and network requests.

**Purpose:** Execute pipeline operations using core and adapter layers.

## Data Flow

```
Raw ATS Catalog (JSON)
    ↓
[src/scripts/download-catalogs.js]
    ↓
[src/lib/normalize-catalog.js] → Normalized catalog records
    ↓
[src/core/pipeline/engine.js]
    ├── [src/core/classification/title-match.js] (optional watchlist matching)
    ├── [src/core/deduplication/salary-detect.js]
    ├── [src/core/classification/work-arrangement.js]
    ├── [src/core/classification/title-review.js]
    └── [src/core/deduplication/job-dedupe.js] (cross-company dedup)
    ↓
Canonical Job Records (array of objects)
    ↓
[src/adapters/exports/csv-builder.js]
    ↓
CSV Output Files (data/jobs/batches/*, data/exports/*)
```

## Canonical Job Record Schema

The canonical job record (defined in `core/models/job-record.js`) includes:

### Identity Fields
- `Source`: Always "public-job-feed"
- `ATS`: Provider slug (ashby, greenhouse, etc.)
- `Company`: Original company name from ATS
- `CompanyKey`: Normalized company key for deduplication
- `JobKey`: Unique job identifier
- `RawJobId`: Original ATS job ID
- `DuplicateGroupKey`: Group key for deduplicated records

### Content Fields
- `Title`: Job title (normalized)
- `Location`: Work location
- `Department`: Department name
- `Description`: Job description HTML
- `URL`: Canonical application URL
- `DatePosted`: Posted date
- `Salary`: Original salary text

### Engine-Derived Fields

**Salary Detection:**
- `SalaryDetected`: Boolean flag
- `SalaryMin`, `SalaryMax`: Detected ranges
- `SalaryCurrency`, `SalaryPeriod`: Currency and period
- `SalaryReviewReason`: Confidence explanation

**Work Arrangement:**
- `RemoteStatus`: Remote/Hybrid/On-site classification
- `LocationCountrySignal`: Country detection signal
- `USRemoteEligible`: US remote eligibility flag

**Title Matching (if watchlist enabled):**
- `TitleMatchType`: exact/contains/partial/none
- `TitleMatchScore`: 0-100 confidence score
- `TitleConfidence`: high/medium/low/none
- `BestCandidateTitle`: Best matching watchlist title
- `SharedStrongTokens`, `SharedWeakTokens`: Token overlap details

**Title Review:**
- `TitleReviewBucket`: Classification bucket for priority handling
- `TitleReviewPriority`: 1-5 review priority level
- `TitleDomainSignal`: Detected domain area
- `TitleSenioritySignal`: Seniority keywords found

## Configuration

### Watchlist (`config/title-watchlist.md`)
Markdown file with categorized job titles for matching:
```markdown
# Category Name
- Job Title 1
- Job Title 2
```

### Settings (`config/settings.json`)
Pipeline configuration including:
- Default deduplication settings
- Export format options
- ATS provider configuration
- Watchlist settings

## Migration Status

### ✅ Completed
- `src/core/models/job-titles.js` - Title watchlist parsing
- `src/core/deduplication/job-dedupe.js` - Cross-company deduplication
- `src/core/deduplication/ats-anomaly.js` - Anomaly detection engine
- `src/core/models/job-record.js` - Canonical record factory
- `src/adapters/exports/csv-builder.js` - CSV export adapter
- `src/adapters/ingestion/index.js` - ATS provider interface
- `src/adapters/exports/export-dedupe.js` - export dedupe compatibility adapter with parity coverage
- Default-option pipeline regression coverage and core-boundary architecture check

### 🔄 In Progress
- Adopt one vertical workflow at a time, starting with public-slice export dedupe
- Keep legacy modules as compatibility boundaries until their defined parity gates pass

### ⏳ Pending
- Add fixture parity coverage before migrating any remaining legacy module
- Implement real adapter interfaces for each ATS provider
- Design streaming JSON ingestion separately from this architecture migration

See MIGRATION_CONTRACT.md for source-of-truth, compatibility, and retirement
criteria for each area.

## Key Design Principles

1. **Pure Core Logic**: `core/` modules have no external dependencies (no file I/O, network calls)
2. **Boundary Ownership**: Core does not perform direct I/O; scripts and boundary modules own infrastructure concerns
3. **Backward Compatibility**: `lib/` wraps new architecture to maintain compatibility
4. **Clear Data Contracts**: Canonical schema defined in one place (`core/models/job-record.js`)
5. **Testability**: Core modules can be tested in isolation without external dependencies
