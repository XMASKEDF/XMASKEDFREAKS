# Referring Websites Heatmaps

The Admin Referring Websites view compares two server-aggregated datasets over the same filters, timezone, weekday order, and fixed two-hour buckets:

- **Visitors Activity**: an impression is one qualified `page_view` event in the production `analytics_events` table. Session and unique-visitor counts are supporting metrics and are not substituted for impressions in the primary summary.
- **Purchase Peak Hours**: a purchase is one `verified` row in `admin_earnings_ledger`, linked to referral activity when a source/content or event key is available. Abandoned, failed, declined, canceled, sandbox, and test-source records are excluded by the server-side function.

Both grids always contain 7 weekdays x 12 two-hour buckets = 84 cells. Weekdays are Monday through Sunday, and the timezone conversion happens in PostgreSQL from UTC timestamps before grouping. Visitor and purchase scales are calculated separately with a 95th-percentile cap for display only; exact values remain in cell details and CSV export.

The purchase metric selector also exposes an optional conversion-rate view. It uses distinct qualifying purchase sessions divided by eligible visitor sessions in the same filtered bucket. The default summary remains transaction count, and the decision-support insight marks the whole period as `LOW SAMPLE` when fewer than 30 visitor sessions are available. A missing purchase/session linkage yields a zero conversion rate rather than an invented estimate.

The two charts share date range, source, normalized referrer domain, attribution model, purchase category, page section, and timezone filters. Purchase attribution uses the same session, first-touch, or latest-touch model selected for visitor activity. No names, emails, wallet balances, payment details, or shipping addresses are returned.

`configured: true` with zero-valued cells is a valid no-activity result. `configured: false` or an API error is unavailable data and is shown separately in the Admin UI. The forward migration `20260818_referral_heatmap_attribution_fix.sql` preserves the existing RPC signature for databases where the original heatmap migration has already been applied.

Live database migration and production-data verification remain UNVERIFIED until Supabase credentials and a staging/production migration run are available.
