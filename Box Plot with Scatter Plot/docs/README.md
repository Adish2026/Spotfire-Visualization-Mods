# Box Plot with Jittered Points (Spotfire Visualization Mod)

## Overview
Box Plot with Jittered Points renders Tukey-style box-and-whisker plots overlaid with jittered data points. It supports single-pane and trellis (small multiples) layouts, marking, filtering, a configurable summary statistics table, flexible Y-axis settings, and optional statistical significance annotations.

- What it unlocks: Combine robust summary statistics (quartiles, whiskers, medians) with raw observations to see spread, overlap, and outliers at a glance. Trellis panels enable rapid multi-group comparisons.
- Typical use cases: Experimental condition comparison, product lot variability, cohort analysis, site performance monitoring, and any categorical grouping with a continuous measure.

## Features
- Box-and-whisker per X category
- Jittered raw points; marking via click (Ctrl-click to toggle)
- Instant response to Spotfire filters and cross-visual marking
- Configurable summary stats table (N, Median, Average, Std Dev, Std Error, CI 95% lower/upper, Min, Max, Outliers)
- Y-axis settings: Auto/Manual range, Include origin (0), Auto/Manual ticks, Numeric/Percentage modes
- Trellis: optional categorical axis to create small multiples
- Optional significance annotations (adjacent, manual pairs, anchor/reference, global) with common tests and BH p-adjust
- Edit-only settings panel (gear icon) per panel

## Data requirements
- Required columns:
  - X (categorical): grouping dimension (e.g., Condition, Group, Lot)
  - Y (continuous): numeric measurement (e.g., Score, Yield)
- Optional columns:
  - Details (categorical): stable subject ID; enables distinct subject counting/deduplication
  - Trellis (categorical): creates separate panels
  - Color by: respects Spotfire color axis per row
- Notes: Invalid or missing Y values are ignored; very large volumes may impact performance.

## Axes setup
- X (categorical, required): grouping
- Y (continuous, required)
- Details (categorical, optional): subject/key (enables dedup when count mode is unique details)
- Trellis (categorical, optional): panel grouping (top placement)

## Configuration (Edit mode)
Click the gear icon in the top-right of each panel (visible in Edit mode only) to open Settings:
- Jitter Width: None/Small/Medium/Large
- Grid Lines: Show Y gridlines; Show X group separators
- Points: Size (px), Opacity (%), Hollow dots
- Y Axis: Auto/Manual range, Include origin, Auto/Manual tick interval, Numeric/Percentage
- Summary Stats: Toggle which stats show
- Statistical Annotations: Mode (Off, Adjacent, Manual pairs, Anchor, Global), Test (Auto/t/MW/ANOVA/Kruskal), P-adjust (None/BH), Alpha, Label mode (Stars/p/both), Visual styles

## Usage
- Drag-and-drop axes in Spotfire Visualization Properties
- Filters: the mod updates instantly
- Marking: click points/outlier crosses to mark; Ctrl-click toggles
- Cross‑visual marking: selections made in this mod appear in other visuals and vice versa, with marked items visually indicated.
- Bookmarks: save/restore the visualization state
- Export: clean View/Web Player export (settings gear hidden)
- Annotations: use Spotfire annotations to add notes; statistics labels can assist presentation

## Performance tips
- For high row counts: reduce jitter width, lower point opacity, apply filters
- Consider focusing on key groups via filtering or data limiting

## Known limitations
- Very large datasets may impact performance due to DOM-per-point rendering
- Jitter offsets are pseudo-random, so point positions may shuffle on re-render

## Version and support
- Mod ID: abbvie-mods-boxplot-jitteredpoints
- Version: 1.0.0
- Support: Use the Exchange page for release notes and contact details
