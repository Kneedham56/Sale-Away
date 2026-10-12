# Sale Away With Me: Build Plan

Oct 12, 2026 · @Dr Quadrakill

## Overview

Sale Away With Me is a phone-first web app that replaces mommatom's notebook, spreadsheet and copy-paste routine with one place to log, list, ship and reconcile what she sells. Phase 1 moves her Excel tracker into a database with a usable UI; AI and eBay features layer on after that, one at a time.

**Who uses it:** mommatom, mostly on her iPhone (photos, intake, packing) and sometimes on a computer (bulk review, taxes). Doc administers it.

**What it replaces today:**

- A paper notebook of sourcing trips (date, place, total spent)
- Three "to be listed" tabs: Unlisted Inventory, Unlisted Books, DVD/CD/Games (about 3,400 rows)
- The Master Listings tab (2,094 rows, 1,592 still active)
- Twelve monthly sales tabs plus Summary, Expenses, Damages and Tiffany tabs
- Copy-pasting AI output into the eBay app, then finishing every draft again on a computer

**Success looks like:**

- She enters an item once, at intake, and never retypes its title
- A sale shows up on its own, with the shelf or bin she stored it in
- Month-end uses eBay's actual fees instead of a flat 15% guess (446 of her 498 sales so far in 2026 needed a manual adjustment)
- Tax time is one page and one export

## Her workflow, mapped

Every step she does today has a home in the app. The biggest wins are no retyping (steps 2 to 8) and no hard-copy reconciliation (step 12).

| # | What she does today | Where it lives in the app | Phase |
| --- | --- | --- | --- |
| 1 | Writes date, place and total spent in a notebook | Sourcing trip record; it generates her lot code (e.g. GS #4-10/3/26) | 1 |
| 2 | Types unlisted items into a spreadsheet tab | Intake on the phone: photos, trip, cost, storage spot; item lands in Unlisted | 1 |
| 3 | Cleans and photographs items | Photos taken during intake, stored with the item | 1 |
| 4 | Runs her AI prompt for comps, title, specifics, price | "Generate listing" button on the item; her prompt runs server-side with comps attached | 2 |
| 5 | Creates an eBay draft on the phone, pastes title and price | Not needed; the item moves to Ready to List inside the app (copy buttons until Phase 4) | 2 |
| 6 | Finishes the draft on a computer: SKU, specifics, template description, condition, weight, dimensions, shipping policy | Same review screen; SKU built automatically; template and policies saved in Settings | 4 |
| 7 | Copies the title into MASTER LISTINGS with storage location | Automatic: status changes from Unlisted to Listed | 1 |
| 8 | Deletes the row from TO BE LISTED | Automatic (same record, new status) | 1 |
| 9 | Bulk launches drafts in Seller Hub | Bulk publish from the Ready to List queue | 4 |
| 10 | FLYP imports from eBay and crosslists | Unchanged; FLYP keeps importing from eBay | None |
| 11 | FLYP detects a sale and delists elsewhere | eBay orders pulled automatically; other platforms via "Mark sold elsewhere"; FLYP still delists | 1 and 3 |
| 12 | Prints the order, finds the item, packs, prints a label | Outgoing page: photo, storage spot, ship-to, ship-by date; label bought on eBay | 3 |
| 13 | Reconciles monthly from hard copies | Sold page fills from eBay's finance data; other platforms use her fee table | 3 |
| 14 | Year-end: expenses, mileage, COGS, starting inventory | Taxes page plus export | 1 (manual), 3 (eBay actuals) |
| 15 | Wish: snap a photo while sourcing, get a yes or no | Quick Check camera screen (KEEP or DONATE) | 2 |
| 16 | Wish: reports by where items came from | Reports grouped by sourcing trip | 1 |

About a quarter of her sales happen off eBay (129 of 498 in 2026: Mercari 45, Poshmark 45, Depop 16, Vinted 16, Etsy 7). The eBay API cannot see those, so manual "sold elsewhere" entry stays in the design.

## Roadmap

Five phases, each ending in a gate Doc checks with her before the next starts. Phase 1 (highlighted) is where she gets real value: the spreadsheet is retired before any eBay connection exists.

&#91;embedded content: roadmap · 5 phases, 5 gates, parked items\]

AI comes before the eBay API because it pays off immediately with copy buttons into the eBay app she already uses, and it needs no eBay approval. Acceptance checks for each phase are in Handoff to Code.

## Architecture and stack

A single web app with a small server: her phone never talks to eBay or the AI directly, so every key and token stays on the server. These are recommendations; Code can propose swaps with a reason.

&#91;embedded content: architecture · phone, server, database, eBay, AI, FLYP\]

| Piece | Choice | Why |
| --- | --- | --- |
| Pages and server | Next.js with TypeScript, on Vercel | One codebase for screens and API routes; works on phone and desktop |
| Install on iPhone | Progressive web app (manifest plus service worker) | Home-screen icon, full-screen, no App Store |
| Database, logins, photos | Supabase: Postgres, Auth, Storage | Managed, row-level security, file storage built in |
| Scheduled jobs | Vercel Cron calling an API route | Order polling and token refresh |
| Photo processing | Server step making a JPEG copy and thumbnail; HEIC fallback converter | iPhone photos may arrive as HEIC; AI models want JPEG or PNG |
| AI | One `suggestListing()` function, provider set by config | Gemini by default; swap providers without touching screens |
| eBay | One `EbayClient` interface: mock, sandbox, production | Build and test without her account |

Hosting plan and monthly cost are an open question, since the app is used for her business.

## Data model

One `items` table with a status field replaces the separate Unlisted, Master Listings and monthly tabs, so an item moves through its life instead of being copied between sheets. Today those tabs join on exact title text (VLOOKUP), which breaks on any typo; the database joins on item ID.

| Table | Holds | Comes from |
| --- | --- | --- |
| `items` | title, kind (general, book, media), category, format (DVD, CD, VHS), bundle flag, condition, condition notes, cost (COG), source\_id, date\_sourced, storage\_location, list\_price, date\_listed, status, date\_sold, owner, weight, dimensions, shipping\_policy\_id, sku, ebay\_listing\_id, ebay\_offer\_id | Master Listings, Unlisted Inventory, Unlisted Books, DVD/CD/Games, Tiffany |
| `item_photos` | item\_id, storage path, sort order, eBay picture URL and its expiry | New |
| `sources` | lot code, place, type (garage sale, thrift, Facebook Marketplace, person), date, total spent, notes | Her notebook plus the Lot and Source columns |
| `sales` | item\_id (nullable until matched), platform, order ID, sold date, gross, shipping cost, fees (actual or estimated), fee\_is\_estimate, adjustments, return charges, net, ship-to, ship-by, tracking, fulfillment status | Monthly tabs Jan to Dec 2026 |
| `expenses` | date, description, type, amount, notes | Expenses tab (both tables) |
| `mileage` | date, miles, rate, purpose | Expenses tab mileage calculator |
| `write_offs` | item\_id, date, value, reason | Damages tab |
| `ai_runs` | item\_id, mode (listing or quick check), inputs, output JSON, model, token and search cost, accepted flag | New |
| `item_events` | item\_id, action (Reduced Price, Relisted, Revised, Changed Photos, Removed), date, note | Action List on the Titles tab |
| `settings` | categories, storage locations, platform fee rates, mileage rate, description template, AI prompt text | Titles tab |
| `ebay_connection` | encrypted refresh token, expiry, scopes, eBay user ID | New |

**Statuses:** Intake, Unlisted, Ready to List, Listed, Sold, Shipped, plus exits for Donated, Damaged and Kept. Net profit, days active and monthly totals are computed by queries, not stored.

**Seed values from her Titles tab:** fee rates eBay 15%, Poshmark 20%, Mercari 13%, Etsy 10%, Depop 3%, Vinted 0%; mileage rate 0.725 per mile. All editable in Settings.

**Import plan (one script, rerunnable):**

1. Read every tab with a parser per layout (the monthly tabs share one layout; August's summary block sits one row higher than the others).
2. Create `sources` from distinct lot codes, then items, then sales matched to items by exact title the way her VLOOKUPs do.
3. Treat placeholders (".", "?", blank) as unknown, not zero.
4. Write an import report: row counts per tab, unmatched sales, rows skipped and why. She reviews it before the spreadsheet is retired.
5. Keep the original file read-only as the audit trail. Never commit it to the repo.

Storage locations need cleanup first: the Master tab has 786 distinct values, mixing numbered bins (like 000082) with places (Garage, Toy Box). The app keeps her values and offers a pick list with type-ahead.

## eBay integration

The app talks to eBay through its official REST Sell APIs, authorized by her clicking "Connect eBay" and approving on eBay's own sign-in page. Reading orders and fees comes first (Phase 3); creating listings comes after (Phase 4).

**Connect flow (OAuth authorization code grant):** Settings has a Connect eBay button that sends her to eBay's sign-in page, where she approves the requested scopes. eBay returns a refresh token that lasts about 18 months; the app trades it for 2-hour access tokens as needed ([token lifetimes](https://docs.datavirtuality.com/connectors/getting-credentials-for-ebay)). The app shows a reconnect banner 30 days before expiry.

| Job | eBay API and calls | Phase |
| --- | --- | --- |
| Detect sales | Fulfillment API `getOrders`, polled every 10 to 15 minutes, filtered by last-modified date | 3 |
| Actual fees, label costs, refunds, payouts | [Finances API](https://developer.ebay.com/api-docs/sell/finances/overview.html) transactions per order | 3 |
| Her shipping, return, payment policies | Account API (read her existing business policies) | 4 |
| Category and required item specifics | Taxonomy API category suggestions and item aspects for a category | 2 and 4 |
| Upload photos | [Media API](https://developer.ebay.com/api-docs/commerce/media/static/overview.html) image from file or URL; HEIC from iPhone is accepted | 4 |
| Create and publish a listing | Inventory API: inventory item (SKU, title, aspects, condition, photos, package), then offer (price, category, policy IDs, Best Offer), then publish | 4 |
| Mark shipped and add tracking | Fulfillment API shipping fulfillment (only for labels bought outside eBay) | Later |

**Existing listings stay as they are.** Her 1,592 live listings were made in Seller Hub, and the Inventory API does not manage those unless they are migrated, which requires business policies, a SKU on every item and fixed-price Good 'Til Cancelled listings ([migration rules](https://www.developer.ebay.com/api-docs/sell/static/inventory/migrating-listings.html)). Orders from those listings still come through `getOrders`, so sales tracking covers everything. Match an order to an item by SKU when present, else eBay item ID, else title.

**No eBay drafts.** Inventory API offers do not show up as Seller Hub drafts. The app's Ready to List queue becomes her draft area, and bulk publish replaces the Seller Hub bulk edit page.

**Webhooks later, polling first.** eBay's push options for new orders are unclear in the current REST Notification API (developers report order topics missing), so polling is the reliable start. Revisit once Phase 3 is stable.

**Required before going live:** every production app must subscribe to eBay's marketplace account deletion notices or opt out, and only apps that store no eBay data may opt out ([requirement](https://developer.ebay.com/marketplace-account-deletion)). This app stores orders, so Code builds a small public endpoint that answers eBay's challenge and deletes that user's data on notice.

**SKU:** she already encodes COG, where and when purchased, and month and year listed in the custom SKU. The app builds it automatically from the item record; exact format is an open question below.

## AI listing assistant

Her prompts move into the app as editable text in Settings, so tapping "Generate listing" sends the item's photos and notes to a model and returns an editable title, item specifics, price and KEEP or DONATE call. It starts on Google Gemini with a free-tier API key Doc creates, and a free Copy Prompt mode works with any chat app she already uses, so she gets value even with no API key at all.

**Two modes:**

| Mode | When | Input | Output | Speed |
| --- | --- | --- | --- | --- |
| Quick Check | In a store or garage sale | 1 photo, optional note | KEEP or DONATE, rule label (Dead Weight, Slow Dime, Fast Nickel), one sentence on average resale price | Fast, few searches, smaller model |
| Generate listing | Unlisted item ready to go | 2 to 4 photos, condition (new or pre-owned; excellent, good, acceptable), flaws, category hint, cost | Title (80 characters max, validated), category, item specifics, description in her template, condition text, suggested price and range, comps with links, KEEP or DONATE | Slower, fuller search |

**Listing prompt** (revised from hers; stored in Settings; the app fills the brackets):

```
You are an expert eBay reseller pricing an item from photos.

Item notes from the seller: [condition: new / pre-owned; grade: excellent / good / acceptable; flaws; anything known]
Store rules: Best Offer is always on. Buyer pays shipping (no free shipping).

Return:
1. TITLE: max 80 characters, most-searched keywords first, include brand, model, size, color, and "FLAW" if flawed.
2. CATEGORY: best eBay category.
3. ITEM SPECIFICS: the required specifics for that category, only values visible in the photos or notes. Write "unknown" rather than guessing.
4. PRICE: a list price and a low-high range, set slightly above expected sale price to leave room for offers.
5. CONFIDENCE: high / medium / low, and one sentence on what the price is based on. If you could not check actual sold listings, say "estimate, not verified against sold comps."
6. DECISION: KEEP or DONATE using these rules:
   - DONATE: sells for $20 or less AND takes more than 45 days to sell (Dead Weight)
   - KEEP: everything else, meaning it sells for more than $20 (Slow Dime) or sells within 45 days (Fast Nickel)
   Then one sentence on typical resale price.
```

**Quick Check prompt** (one photo, used while sourcing):

```
Act as my expert reselling manager. From this photo, give a 1-word decision first: KEEP or DONATE.
Rules:
- DONATE: sells for $20 or less AND takes more than 45 days to sell (Dead Weight)
- KEEP: everything else, meaning it sells for more than $20 (Slow Dime) or sells within 45 days (Fast Nickel)
Then give one sentence on its typical resale price. If you are estimating without sold data, say so.
```

Changes from her original: listing and keep-or-donate split into two prompts, condition and flaws fed in, her thresholds written as numbers ($20, 45 days), a confidence line so unverified prices are labeled, and a fixed output order so the app can fill fields. In the app, both prompts request JSON with these same fields.

**How a run works:**

1. Photos are converted to JPEG and resized (about 1,600 px long edge) before sending.
2. The server adds her notes, the store rules and, once eBay is connected, active comps from the eBay Browse API as data.
3. The model returns JSON against a fixed schema. The server checks title length and validates specifics against the required aspects for the suggested category (Taxonomy API), and flags anything missing.
4. She edits anything, taps "Try again" or adds info and regenerates (her current habit), then accepts.
5. Web search for sold comps is added last, as its own step, once everything else works.

**Sold comps are the soft spot.** eBay's sold-items API (Marketplace Insights) is limited release and only for approved partners ([status](https://developer.ebay.com/api-docs/buy/marketplace-insights/static/overview.html)). Until web search is added, prices are labeled as estimates, with a one-tap link to eBay's own sold search for her to verify.

**AI provider tiers** (all behind the same buttons, one `suggestListing(item, photos, mode)` function):

| Tier | How it works | Cost | When |
| --- | --- | --- | --- |
| Copy Prompt | App builds the full prompt from her notes; she pastes it with photos into any chat app, then pastes the answer back into a field the app parses | Free, any model | Phase 2 |
| Gemini API key (default) | Doc's Gemini key stored encrypted on the server; app calls a Gemini model with image input | Free tier to start | Phase 2 |
| Other providers | Settings lets the provider and key be swapped (Anthropic, OpenAI) without code changes | Pay per use | Later, if needed |
| Web search sold comps | Search-grounded call for sold prices from the past 90 days | Check provider limits | Last |

Chat subscriptions (ChatGPT Plus, Claude Pro, Gemini app) do not include API access, which is why Copy Prompt exists. Check Gemini's current free-tier rate limits and data-use terms before launch. Every run is saved in `ai_runs` with its cost, so real usage is known after testing.

**The AI never publishes.** It fills in fields; she approves every listing.

## Screens

The app is designed for an iPhone first: bottom tab bar, big tap targets, camera one tap away, and it installs to her home screen like an app. Desktop gets the same screens with wider tables for bulk work.

| Screen | What she does there | Phase |
| --- | --- | --- |
| Home | Counts for To Ship, Unlisted, Ready to List, Listed, Sold this month; anything needing attention | 1 |
| Quick Check | Camera opens, one photo, KEEP or DONATE in seconds | 2 |
| Add Item | Photos, pick or create a sourcing trip, cost, category, storage spot, condition notes; lands in Unlisted | 1 |
| Unlisted | The dumping ground: filter by kind, category, trip, age; multi-select to generate listings in a batch | 1 |
| Item | Photos (reorder), every field, AI suggestion side by side with her edits, history of price changes and relists | 1, AI in 2 |
| Ready to List | Reviewed items waiting to go live; copy buttons for title and description (Phase 2), bulk publish to eBay (Phase 4) | 2 and 4 |
| Listed | Her master list: search, days active, filter stale items (90+ days) for Reduced Price, Relisted or Removed actions | 1 |
| Outgoing | Orders to ship, oldest ship-by first; each card shows photo, title, storage spot, ship-to, ship-by date and service; Packed and Shipped checkboxes; printable pick list | 3 (manual entry in 1) |
| Sold | Month view replacing the monthly tabs: gross, shipping, fees, adjustments, net; unmatched sales to link | 1, eBay actuals in 3 |
| Taxes | Year totals and export (see Taxes section) | 1 |
| Expenses | Quick add for expenses and mileage | 1 |
| Reports | By sourcing trip, category, platform, month; aging inventory | 1 |
| Settings | Connect eBay, fee rates, categories, storage locations, description template, AI prompt | 1, eBay in 3 |

**Photo capture on iPhone:** a standard file input with the camera option opens the iPhone camera or photo library. Photos upload straight to storage, then a server step makes a JPEG copy and a thumbnail. Uploads retry when signal drops (garage sales and thrift stores have bad reception).

**Pick list:** the Outgoing page sorts by storage location so she walks the garage once, not once per order.

## Shipping and labels

Version 1 consolidates everything she needs to pack, then sends her to eBay to buy the label; buying labels inside the app waits. eBay's label API (Logistics API) is limited release, open only to developers its business units approve ([status](https://developer.ebay.com/api-docs/sell/logistics/overview.html)).

| Option | How it works | Trade-off | When |
| --- | --- | --- | --- |
| Link to eBay's label page | Outgoing card has a "Buy label" button that opens the order in eBay; label cost flows back via the Finances API | One extra tap per order; tracking uploads itself | Phase 3 |
| Third-party label service (Shippo or EasyPost) | App buys the label with her own account there, then posts tracking to eBay via the Fulfillment API | Another account and card on file; labels for other platforms could come from the same place | Later, only if volume calls for it |
| Apply for eBay Logistics API access | Labels bought through eBay from inside the app | Approval is not in our control | Optional request |

For Mercari, Poshmark, Depop, Vinted and Etsy sales, labels are handled on each platform's own site, so the Outgoing card only needs to show where the item is and when it ships.

## Taxes and reconciliation

The Taxes page puts every year-end figure she gathers by hand today on one screen, with a CSV and PDF export for whoever prepares her return. It reports numbers; it does not give tax advice, and her preparer decides how inventory and write-offs are treated.

**Figures on the page, for a chosen year:**

- Gross sales by platform
- Cost of goods sold (cost of items sold that year)
- Shipping costs paid
- Platform fees (actual for eBay from Phase 3, estimated by rate for other platforms and flagged)
- Refunds, return charges and adjustments
- Net profit
- Expenses by type (business expense, equipment or tools, packaging material, other, bills)
- Mileage: total miles times the rate in Settings
- Write-offs from damaged items
- Sourcing spend (sum of trip totals, the number her notebook gives her today)
- Inventory at cost on January 1 and December 31 (unsold items with a known cost), which covers her "starting inventory" step

**Monthly view** on the Sold page replaces the twelve tabs and the Summary tab with the same measures she tracks now: number of sales, COGS, gross, shipping, fees, net, adjusted net, margin.

**1099-K context:** the federal reporting threshold for 2026 is $20,000 in payments and more than 200 transactions, and all income is reportable whether or not a form arrives ([source](https://beancount.io/blog/2026/05/15/1099-k-threshold-whiplash-2026-gig-workers-online-sellers-reconcile-marketplace-forms-20000-200-transactions-obbba-guide)). Her spreadsheet shows 369 eBay sales and about $13,100 eBay gross through September, so the dollar test decides whether eBay sends one. The page shows eBay gross year to date against that line, since a 1099-K reports gross before fees and shipping.

## Testing strategy

Doc can test everything without an eBay selling account: a free eBay developer account gives sandbox keys and fake test users, and a mock mode covers the rest. Her real account is connected only at the end, read-only first.

**One switch, three modes.** All eBay calls go through one `EbayClient` interface with three implementations, picked by `EBAY_ENV`:

| Mode | What it hits | Used for |
| --- | --- | --- |
| `mock` | Recorded JSON fixtures shaped like eBay's documented responses | Daily development, UI work, automated tests, demos to her |
| `sandbox` | eBay's test environment with test users and test money | Proving OAuth, listing, order and fee flows end to end |
| `production` | Her real account | Final smoke test, then normal use |

**Test stages:**

1. **Mock.** Seed the database from her spreadsheet import. Fixtures cover a new order, a multi-item order, a refund, a cancelled order and an order for a listing the app has never seen.
2. **Sandbox.** Doc signs up at developer.ebay.com, creates sandbox keys and two test users (seller and buyer, usernames start with TESTUSER\_), connects the seller through the real OAuth screen, publishes a test listing, buys it as the test buyer, and confirms the poller picks up the order. Sandbox only mirrors part of eBay, and eBay advises testing search in production instead ([sandbox notes](https://developer.ebay.com/tools/sandbox)), so Browse API comps are tested against production with an app-level token, which needs no seller account.
3. **AI eval.** Run Generate Listing on 20 items she already sold and compare the suggested price with the actual sale price. Report median error and how often KEEP or DONATE matched what happened. Tune the prompt before she relies on it.
4. **Her phone.** Install to her iPhone home screen, take photos, add 5 real items, run Quick Check in a store.
5. **Production, read-only.** She connects eBay. For one week the app only reads orders and finances; compare against her spreadsheet for the same days.
6. **Production, write.** Publish one low-value real item from the app, check it in Seller Hub and in FLYP, then turn on bulk publish.

## Credentials and security

Doc never sees her eBay password: she signs in on eBay's own page, and the app receives only a revocable token limited to the scopes it asks for. The honest caveat is that whoever runs the server could technically use that token while it is valid, so the design limits and logs what it can do.

**Who holds what:**

| Credential | Owner | Where it lives |
| --- | --- | --- |
| eBay password | Her | Only eBay; never typed into the app |
| eBay developer keys (app ID and secret) | Doc's developer account | Server environment variables |
| eBay refresh token | Her account, issued to the app | Database, encrypted at rest with a key kept outside the database |
| AI API key | Doc's Gemini key to start; swappable in Settings | Server environment variables |
| App login | Her and Doc | Passkey or emailed magic link; no shared passwords |

**Guardrails:**

- Request only the scopes each phase needs: read scopes in Phase 3, listing scopes added in Phase 4
- Log every write to eBay (who, what, when) on an Activity page she can read
- She can disconnect from Settings, and can also revoke the app's access from her eBay account settings
- Keep buyer names and addresses only until the order ships plus a short window, and delete on eBay's account deletion notice
- Her spreadsheet and any exports stay out of the git repo

## Handoff to Code

Code builds one phase at a time and stops at each gate for Doc's review; nothing in a later phase starts until the current gate's checks pass. Export this doc as Markdown into the repo as `docs/PLAN.md`, and have Code write a short `CLAUDE.md` (stack, commands, conventions, "never commit files under /data").

**Phase 0: Foundation**

- [ ] Next.js app with TypeScript, installable on iPhone home screen, deployed to a preview URL
- [ ] Database schema from the Data model section, with migrations
- [ ] Login for two users (her and Doc)
- [ ] Import script runs on her spreadsheet and produces the import report; counts match the tabs

**Phase 1: Inventory app (replaces the spreadsheet)**

- [ ] Add Item with camera photos works on her iPhone in under a minute per item
- [ ] Unlisted, Listed, Item, Sold, Expenses, Reports, Taxes and Settings screens work on imported data
- [ ] "Mark sold" for any platform, with fee estimate from the rate table
- [ ] Report by sourcing trip shows spend, items, sold, profit
- [ ] Gate: she runs one full month without opening the spreadsheet

**Phase 2: AI assistant**

- [ ] Quick Check and Generate Listing work from the phone
- [ ] Copy Prompt mode and Gemini mode both work; prices labeled as estimates
- [ ] Copy buttons for title, description and specifics into the eBay app
- [ ] Account deletion endpoint live, so production keys can be activated for Browse
- [ ] Gate: AI eval on 20 sold items reviewed with her

**Phase 3: eBay read**

- [ ] Connect eBay (OAuth) in mock, sandbox, then production
- [ ] Poller pulls orders every 10 to 15 minutes and matches them to items
- [ ] Outgoing page with storage spot, ship-by date, pick list, and Buy Label link
- [ ] Finances API fills actual fees, label costs and refunds; estimates replaced
- [ ] Gate: one read-only week matches her own records

**Phase 4: eBay write**

- [ ] Settings pulls her business policies; description template stored
- [ ] Publish one item end to end (photos, specifics, Best Offer on, buyer-paid shipping, SKU)
- [ ] Bulk publish from Ready to List; FLYP still imports the new listings
- [ ] Gate: one real low-value item published and sold through the app

**Parked:** Web-search sold comps, order webhooks, in-app labels, FLYP or other-platform imports, migrating old listings into the Inventory API.

**Open questions for mommatom:**

- [ ] Exact custom SKU format she uses today (field order, separators)
- [ ] What the Tiffany tab is: items she sells for someone else? If so, how profit is split
- [ ] Copy of her eBay description template and condition wording
- [ ] What numbered storage locations like 000082 refer to (bins, bags, shelves)
- [ ] Whether book bundles stay one item or split
- [ ] Does FLYP export sales to CSV? That would cover the off-eBay quarter of her sales

**Open questions for Doc:**

- [ ] Who pays for hosting, and whose name the accounts sit under (AI starts on Doc's Gemini free tier)
- [ ] Whether she wants the app to publish directly, or keep finishing listings in Seller Hub for a while
