# ADMIN Media Library

## Storage

Pictures are stored in the existing Supabase project in the private `media` bucket. The browser never receives the Supabase service-role key or chooses a storage path. The upload API generates paths in this form:

`category/YYYY/MM/timestamp-uuid.extension`

Originals are retained. Public delivery uses `/api/media/{mediaId}/file`, which allows published images and requires an ADMIN session for drafts, private images, and archived images. Next.js produces and caches the 320, 640, 1280, and 1920 delivery sizes without upscaling the original.

## Uploading

1. Sign in with an ADMIN account using the existing required 2FA login.
2. Open `ADMIN > MEDIA > Upload Pictures`.
3. Drop one or more JPG, PNG, WebP, AVIF, or GIF images, or choose files from the device.
4. Select category, folder, alt text, tags, and status.
5. Review validation results and start the upload.

The client provides immediate format/size feedback. The server independently verifies the file signature, extension, MIME type, dimensions, corruption state, 15 MB limit, and SHA-256 hash. Failed files can be retried without losing successful uploads. Duplicate files offer Use Existing or Upload Copy.

SVG is deliberately rejected because the project does not currently include a reviewed sanitizer. Arbitrary HTML, scripts, and document files are rejected.

## Reusing Pictures

The reusable Image Picker is connected to:

- `ADMIN > Appearance > Backgrounds`
- `ADMIN > Branding`
- `ADMIN > Games > Edit Game > Thumbnail`
- `ADMIN > Payments > Tip Menu`

Assignments reference the same media ID and create a `media_usage` record. They do not copy the image. The picker supports search, category and folder filtering, previews, recent images, selection, cancellation, and a direct Upload New Picture link.

Game Assets include optional game, entity type, skin, animation state, frame order, scale, and collision-profile metadata. Assigning new game artwork still requires explicit ADMIN confirmation in the relevant game workflow.

## Deletion Protection

Every connected assignment records its usage type, resource, route, and field. Deleting an active image returns an in-use warning. ADMIN can cancel, replace the image everywhere with another published image, archive it, or explicitly remove it anyway. Archive is the preferred option and preserves the original, metadata, history, and usage evidence.

Replacing a file in place preserves its media ID and active usage references. Replace Everywhere updates connected game thumbnails, Tip Menu art, the official logo, and global background settings before moving their usage references.

## Roles

The current repository has one persisted administrator role: `ADMIN`. Media pages and APIs require a valid ADMIN session and required 2FA. Standard users and visitors receive no media access, even when manually requesting the routes. Content Manager, Moderator, and Creator media permissions remain unavailable until those roles exist in the authentication schema; they are not simulated with client-only controls.

## Optimization And Watermarking

The implementation uses the existing Next.js image optimizer and cache for responsive delivery, avoiding a second hosted provider. `sharp` 0.35.3 was evaluated because it is actively maintained, Apache-2.0 licensed, server-only, and appropriate for persistent WebP/AVIF conversion and watermark composition. It was not installed because this workspace is linked to a protected external pnpm store and package fetching is unavailable. Therefore server-composited watermarks remain visibly disabled rather than pretending to process them. The database already preserves per-image watermark settings for a future approved processor.

## Applying The Database Changes

Apply the media portion of `supabase/schema.sql` to the production Supabase project before using uploads. Confirm the private `media` bucket exists with a 15 MB limit and the five allowed MIME families. Test ADMIN upload, private delivery, published delivery, usage replacement, archive, and restore against staging before production.

## Audit Records

Uploads, replacements, metadata edits, publishing, folder/category changes, assignments, archives, replace-everywhere actions, and deletion attempts are written to the media action log and/or the existing ADMIN audit log with administrator ID and request context.
