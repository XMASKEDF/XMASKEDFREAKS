# Storage / CDN / Media Setup

`ObjectStorageProvider` supports local development, Supabase Storage, and S3-compatible storage. Supabase is selected explicitly with `STORAGE_PROVIDER=SUPABASE`; its service-role credential is server-only. `AssetDeliveryProvider` supports a local path and configurable public CDN base. Media validation/quarantine exists; malware scanning requires `UPLOAD_SCANNER_URL` and `UPLOAD_SCANNER_TOKEN`.

The storage buckets are intentionally separated: `public-media` for approved public imagery, `media` for private Media Library originals, `private-digital` for paid audio/video, and `media-processing` for temporary processing inputs. Existing `media` and audio buckets are preserved. Public URLs may be CDN-backed; private downloads always use entitlement checks followed by short-lived signed URLs.

Admin large-file uploads use the signed-upload and completion endpoints (`/api/admin/media/upload` and `/api/admin/media/upload/complete`). Upload sessions stay `UPLOADING`/`UPLOADED`/`PROCESSING`/`READY`/`FAILED`/`QUARANTINED` until a provider-neutral processor marks them safe. No production storage fallback to public or local storage is permitted.

Production requires private object storage, signed URLs for paid/private media, CDN configuration, purge behavior, image/video optimization, upload quarantine, and an approved scanner. Never expose storage secrets or private media URLs.
