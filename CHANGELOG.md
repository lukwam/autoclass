# Changelog

## 2.0.0 (2026-10-16)

Rebuilt to match how Autoclass works today.

### Added

- Terminal storage class choice: Nearline (the default) or Archive.
- Location picker with list prices for 50 regions and multi-regions.
- Standard-only and Autoclass costs side by side, with totals, savings, a chart, and a month-by-month table.
- Objects under 128 KiB, which Autoclass doesn't manage or charge for.
- The one-time enablement charge for existing buckets, and Class A charges for reads from Coldline or Archive.
- Shareable links: inputs are saved in the URL.
- Weekly price updates from the Cloud Billing Catalog API, delivered as pull requests.
- Light and dark themes, a mobile layout, tests, linting, and CI.
- MIT license.

### Changed

- Inputs use binary units (KiB, MiB, GiB), matching how Cloud Storage bills.

### Removed

- The Bootstrap dependency and the Python prototype (`main.py`). The model now lives in `docs/model.js`.

### Fixed

- The page only showed Autoclass costs, not the Standard storage costs it compared against.
- Every object walked down to Archive, which only happens with an Archive terminal class.

## 1.0.0 (2022)

- First calculator, featured in the Google Cloud Innovators newsletter.
