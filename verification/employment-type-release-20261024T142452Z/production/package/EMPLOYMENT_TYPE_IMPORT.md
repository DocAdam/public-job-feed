# Employment Type import instructions

This package does not publish to Google Sheets.

The public table has 715 data rows and 16 columns. Use `01_good_documentation_jobs!A1:P716` for the main table, its filter, and the source range of remote_jobs_pivot. Check the range again if rows change before import. Preserve the remote view and its current Work Arrangement filter.

Employment Type is the last column (P). It gives the stated schedule first, then employment terms. Examples: `Full-time`, `Contract`, `Part-time; Contract`, and `Full-time; Internship`. Each code example is one complete cell value.

Use Filter by condition > Text contains > Contract to include Contract and Part-time; Contract. Use Text contains > Internship to include Full-time; Internship. An exact-value filter selects only that complete cell label.

Not stated means no supported schedule or terms. Needs review means conflicting evidence. A known schedule does not require known terms. Full-time does not mean Permanent. Role Type and Work Arrangement keep their existing meanings.

Before an approved import, inspect public-schema.json and employment-type-coverage.json. The counts for schedules and terms can overlap. Each population gives its own denominator. Conflicts retain evidence in the detailed JSON and CSV. Simple CSV files do not contain internal evidence.
