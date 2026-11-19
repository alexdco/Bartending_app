# 0062. Comment safety: rationale

## Context

Recipe comments (spec 0027) let any signed in user post text, and spec 0032 added up to 3 photos per comment, uploaded to a public bucket and shown to everyone the moment they are attached. The only safeguard today is you, the single admin, scanning `/admin/comments` (spec 0028) and deleting what you find. Specs 0027, 0028, and 0032 each listed a report button and automated photo screening as owed follow ups.

Three forces make this load bearing now. First, the app is heading to the App Store and Play Store (specs 0057, 0060). Apple's review rule for apps with user generated content expects a way to filter objectionable material, a way to report it, and a way to block abusive users; missing any one is a common rejection reason. Second, photos are the riskiest content here: unlike text, you cannot skim them in a list, and a single explicit or illegal image on an alcohol app with an age gate is a serious problem for the stores and for users. Third, you moderate alone and part time, so anything that relies on you being online leaves bad content visible for hours.

The existing system sets hard constraints. Photos live in a public bucket and installed mobile builds upload there directly, then attach through `post_comment` and `edit_comment`; changing the upload path would break those builds. Reads go straight from the clients to Postgres through row level security, including the server rendered recipe page and its structured data. The stack already includes Claude Haiku called from Supabase Edge Functions with Sentry reporting (spec 0034), `pg_net` and `pg_cron` jobs authenticated with the `secret_key` Vault secret (spec 0041), and an `is_current_user_admin()` helper.

Not deciding means shipping to the stores with no report or block path, and leaving every photo public on upload with only manual review behind it.

## Options considered

### Option 1: Database first moderation (chosen)

Status columns on `comments` and `comment_photos`, visibility enforced by RLS helpers, a database trigger that calls a screening Edge Function through `pg_net` (with a cron backstop), and reports and blocks as tables behind security definer functions and RLS.

**Pros**:
- No client can skip screening or see hidden content, including old mobile builds and the server rendered page.
- Reuses everything already running: Haiku in an Edge Function, `pg_net` plus Vault, Sentry, the admin helper and delete paths.
- No change to the upload path or the public bucket.

**Cons**:
- Every comment read goes through per row helper functions, which is more work on the hottest comment query.
- A hidden file is still reachable at its random URL until removed.
- More moving parts in the database (trigger, cron, helpers) to debug when something goes wrong.

### Option 2: Client asks for screening before attaching

The client uploads, calls a screening function, and only attaches the photo once it passes.

**Pros**:
- Simple mental model; the user sees a pass or fail right away.
- No trigger or cron.

**Cons**:
- A modified client or an installed older build skips it entirely; the database would still need a status column to be safe, so the work is not saved.
- The user waits on the model call inside the posting flow.

### Option 3: A dedicated moderation API (OpenAI omni-moderation, Google Cloud Vision SafeSearch, or AWS Rekognition)

Same database design, but a purpose built moderation service returns category scores instead of Haiku.

**Pros**:
- Fixed, well tested categories and scores; OpenAI's endpoint is free.
- Less prompt work.

**Cons**:
- A new vendor, key, billing account, and data processor to add to the privacy page.
- Generic thresholds are tuned for general platforms; bar photos with alcohol and the minors with alcohol rule need custom handling anyway.

### Option 4: Private staging bucket, moved to the public bucket on approval

Uploads go to a private bucket and are moved once screening or the admin approves them.

**Pros**:
- A hidden file is truly unreachable until approved.

**Cons**:
- Changes the upload path, the storage policies, `post_comment` and `edit_comment` checks, and both clients; installed mobile builds would break.
- Moving files adds a failure point between approval and display.

## Rationale

Option 1 is the only one where the safety guarantee does not depend on the client, which matters because the risky content arrives from clients you do not control, including mobile builds already installed. Putting the rule in RLS also means the server rendered page and its structured data are covered with no extra code. The cost is extra per row work on comment reads; at 20 comments per page with indexed lookups that is acceptable, and it is the same pattern the comments and photos policies already use.

Claude Haiku was chosen over a dedicated moderation API because it is already in the stack, already a processor named for drink ideas, and lets the policy be written in plain language that fits an alcohol app (drinks allowed, minors with alcohol flagged). Haiku 5.5 rather than the 4.5 model the drink idea function uses, because image judgment is the core of this feature and the newer model is the better judge at the same tier. Failing closed (stay hidden, retry, then send to you) matches the goal that no unscreened photo is ever public, and the 2000 per day cap bounds the bill without turning an attack into a flood in your queue.

Keeping the public bucket and deleting files on removal (Option 4 rejected) trades a small, author only exposure of hidden files for not breaking installed builds. Report history keeps a snapshot of the content's author with links that null out on removal, because the reports that matter most for spotting repeat offenders are exactly the ones whose content gets removed. The 3 distinct report threshold protects users while you are away, without letting one person hide anyone's comment; counting only accounts at least 24 hours old (added after the cross check) stops three throwaway accounts from hiding anything instantly, while their reports still reach your queue.

A smaller decision worth naming: the Sentry warning for a report driven flag is sent by the client helper, not the database, because Postgres cannot reach Sentry directly and a dedicated function hop for one warning adds more failure surface than it removes. The item is still hidden and queued either way; only the alert depends on the client.
