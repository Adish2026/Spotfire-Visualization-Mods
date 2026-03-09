# Box Plot with Jittered Points – Release Notes

## 1.0.0 (2026-02-06)
Initial public release of the Spotfire visualization mod "Box Plot with Jittered Points".

### Features
- Tukey-style box-and-whisker plots by category (X axis)
- Jittered raw data points overlaid on boxes
- Marking: click points/outlier crosses to mark; Ctrl-click to toggle
- Instant response to Spotfire filtering and cross-visual marking
- Configurable summary statistics table (N, Median, Average, Std Dev, Std Error, CI 95% bounds, Min, Max, Outliers)
- Y-axis configuration: Auto/Manual range, Include origin (0), Auto/Manual ticks, Numeric/Percentage modes
- Trellis layout by optional categorical axis
- Optional significance annotations: Adjacent pairs, Manual pairs, Anchor (reference), Global; tests (Auto/t/Mann–Whitney/ANOVA/Kruskal); Benjamini–Hochberg p-adjust; flexible labels
- Tooltips for points and outlier crosses
- Edit-only settings panel (gear icon) per panel

### Compliance & packaging updates
- Self-contained UI: Settings panel and dynamic CSS vars scoped to the mod container (no writes to document.body/head or document.documentElement)
- Background click behavior: no-op (avoids undocumented APIs)
- Manifest cleanup: No dormant/unused properties included
- package.json metadata: Mod id and Spotfire entry added

### Known limitations
- Very large datasets may impact performance due to DOM-per-point rendering; consider filtering, reducing jitter width, and lowering point opacity
- Jitter offsets are pseudo-random and may reshuffle on re-render
