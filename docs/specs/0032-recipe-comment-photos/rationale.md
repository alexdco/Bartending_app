# 0032. Recipe comment photos: rationale

## Context

Recipe comments (spec 0027) are text only, and admin moderation (spec 0028) can delete a whole comment. People who make a drink want to show the result, and a photo of a real pour tells another user more than a paragraph does. This feature sits in the shared Supabase backend plus both client apps (`apps/web`, `apps/mobile`) and the shared package (`packages/shared`). It is not a single workspace decision.

The forces are mostly about user generated files, which behave very differently from text rows. Files live outside Postgres (in Supabase Storage), so a database transaction cannot cover both the file and the row. Any write path can leave a file with no row or a row with no file. Phone photos are large (often 3 to 12 MB), may be HEIC (an Apple format most browsers cannot show), and carry EXIF metadata (hidden data stored inside the image file), which often includes the GPS location where the photo was taken. Comments are publicly readable by guests and render on server rendered, indexed recipe pages, so whatever is uploaded is effectively published.

The team is one person who is also the only admin. That rules out anything that needs a review queue or ongoing operations work, and it means every rule has to be enforced by the backend, not trusted to the UI. Comments already enforce ownership and the soft deleted recipe rule in RLS (row level security, the per row access rules in Postgres), and this feature must not weaken those. The project already runs a pg_cron plus Edge Function cleanup job (spec 0017), uses `security definer` Postgres functions for multi table writes (`buy_shopping_list_item`, `admin_upsert_recipe`), and stores the service role key in Vault, so those patterns are available.

Without a decision, the build would have to invent where files live, who may write them, how a post stays atomic across a file and two tables, and how files get cleaned up. Each of those, picked wrong, either leaks storage forever, publishes users' home locations, or lets one user attach or delete another user's photos.

## Options considered

### Option 1: Public bucket, upload first, atomic function, client delete plus orphan sweep (chosen)

The client processes and uploads each photo into `comment-photos/{user_id}/`, then calls one `security definer` function that checks every rule and writes the comment and its photo rows together. Deletes remove rows first, then the client removes the files, and a daily sweep deletes any file nothing points to.

**Pros**:
- One transaction per write for everything that lives in Postgres; nothing half posted is ever visible.
- Public URLs are cacheable and work on server rendered pages with no extra calls.
- The sweep is a single safety net for every orphan source (failed uploads, failed deletes, admin deletes, account cascades).
- Reuses patterns the project already runs (definer functions, pg_cron plus Edge Function, Vault).

**Cons**:
- Files are public; a deleted photo's URL can stay reachable until caches expire and cleanup runs.
- Comment writes move from direct table calls to functions, so spec 0027's shared code must be rewritten.
- Up to 24 hours of orphaned files can sit in storage.

### Option 2: Private bucket with signed URLs

Same write flow, but the bucket is private and every read mints a short lived signed URL.

**Pros**:
- A deleted photo becomes unreachable as soon as its URL expires; tighter control over who sees files.

**Cons**:
- An extra signing call per comments page, and URLs that change every time, which defeats CDN and `next/image` caching.
- Server rendered recipe pages would need to sign URLs during render, adding latency to public pages.
- The content is public anyway (comments are readable by guests), so the extra control buys little.

### Option 3: Insert the comment first, then upload and attach photos

The comment row is created, then each photo is uploaded and attached by a separate insert.

**Pros**:
- Simple calls; no need to pass paths into a function.

**Cons**:
- A failed upload leaves a comment without its photos, or a photo only comment with nothing in it, briefly visible to everyone.
- "Text or at least one photo" cannot be enforced at insert time, because the photos arrive later.

### Option 4: Database trigger deletes files through the Storage API

Instead of client deletes plus a sweep, an `after delete` trigger on `comment_photos` calls the Storage API through `pg_net` with the service role key.

**Pros**:
- Files disappear right after the row, from every delete path, with no client code.

**Cons**:
- Puts the service role key and an HTTP call inside a trigger; failures are asynchronous and silent, so orphans still need a sweep.
- Harder to debug and test than a client call plus a scheduled job.

## Rationale

The deciding force is that files and rows cannot share a transaction. Option 1 accepts that and designs for it: files go up first (cheap to throw away), the rows that make them visible land in one atomic function call, and anything left behind is swept. Option 3 gets the order backwards and makes partial states visible to the public, which is exactly what AC-10 forbids. Option 4 still needs the sweep, so it adds a risky moving part (an HTTP call with the service key inside a trigger) without removing one.

Public over private follows from comments already being public, guest readable, and rendered on indexed pages. A private bucket would cost an extra call and lose caching on every page view to protect content anyone can already see. The real privacy risk in photos is hidden metadata, not access, so the spec strips metadata on the client and keeps the bucket public.

Moving writes into `security definer` functions is driven by the two rules that span tables: "text or at least one photo" and "at most 3 photos". A row policy on `comments` cannot see `comment_photos`, and a row policy on `comment_photos` cannot see the final count of a batch insert. The project already uses this pattern for its other multi table writes, so it adds no new concept. Spec 0027's direct insert and update stay for text only comments (with `body is not null` added to their policies), because mobile builds already installed on phones call them, and revoking them would break posting until every user updates. A cross check also moved the storage delete policy's "still referenced?" test into a `security definer` helper (a plain policy subquery cannot see photo rows hidden on soft deleted recipes), made attaching refuse files older than 23 hours so the 24 hour sweep can never delete a file mid attach, and made account deletion remove the user's photo folder right away. Up to 3 photos needed a child table (not a column), and storing width and height lets both apps reserve space before the image loads, which prevents the list from jumping.

Client side processing (resize to 1600 px, about 80% quality, metadata dropped) was chosen over a server pipeline because the team cannot afford to operate one, and because shrinking before upload is also what makes mobile uploads fast. `heic2any`, loaded only when a HEIC file is picked, covers Apple photos on web without growing the main bundle; on mobile, `expo-image-picker` and `expo-image-manipulator` are first party Expo modules that fit the existing custom dev client. The tradeoff, accepted consciously, is that the "no metadata" guarantee rests on the clients.

The daily cap lives in the storage insert policy rather than in the post function (the engineer's first pick was the function). Every photo must pass through storage before it can be attached, so that is the tighter place to count, and it also limits uploads that are never attached, which a function side count would miss.

## Engineer choices captured in the design conversation

- Up to 3 photos per comment; photo only comments allowed.
- Edit can remove or replace photos (and, following from that, add and reorder up to 3).
- Web and mobile together.
- Accept JPEG, PNG, WebP, HEIC; store JPEG (narrowed from "JPEG or WebP" after the cross check); client resize to 1600 px at about 80%; 5 MB bucket cap; strip all metadata.
- Public bucket, write policies by folder; upload first then one atomic function; client delete plus a daily orphan sweep.
- Admin sees thumbnails and can delete one photo or the whole comment; no automated screening and no reporting in v1; 30 photos per user per 24 hours.
- Optional alt text with a generated fallback label; store width and height.
- Web: canvas plus `heic2any`; mobile: `expo-image-picker` plus `expo-image-manipulator`.
- Thumbnail row with a full size viewer; a failed upload blocks posting and keeps the draft; user photos stay out of SEO metadata.
- No References section. Agent Skill and MCP search for the new libraries declined.
