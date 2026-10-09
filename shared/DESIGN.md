# WebSpend design tokens

Taken from the approved mockups (iPhone summary, settings, transaction, categories; Mac app; website).
Every client uses these so the three apps read as one product.

## Type

- UI font: **Geist** (400, 500, 600, 700). Fallback `system-ui, sans-serif`. On Apple platforms SF Pro
  is acceptable; use Geist if bundled.
- Numbers and amounts: **Geist Mono** 500 with `letter-spacing: -0.04em` for the big figures.
  Fallback `ui-monospace, SF Mono, monospace`.
- Sizes: page title 28px/700 (`letter-spacing -0.02em`), hero amount 42–44px mono, card amounts 17px mono,
  body 14–15px, secondary 13px, captions 12px, chips 11–12px.

## Colour

| token               | light     | dark      | use                                   |
| ------------------- | --------- | --------- | ------------------------------------- |
| `--bg`              | `#F5F6F8` | `#0B0D10` | page background                       |
| `--side`            | `#ECEEF2` | `#111418` | Mac sidebar                           |
| `--card`            | `#FFFFFF` | `#15181D` | cards, nav bar, round buttons         |
| `--ink`             | `#0B0D10` | `#F2F4F7` | primary text                          |
| `--muted`           | `#5B6472` | `#9AA4B2` | secondary text                        |
| `--line`            | `#E3E6EB` | `#252A32` | hairlines, progress track             |
| `--chip`            | `#ECEEF2` | `#1E2229` | pills, segmented controls, table head |
| `--accent`          | `#5B4BFF` | `#5B4BFF` | hero card background, primary button  |
| `--accent-deep`     | `#4638D6` | `#4638D6` | pressed accent, progress on hero      |
| `--accent-text`     | `#4A3BE0` | `#A9A1FF` | links, selected pill text, rate line  |
| `--on-accent`       | `#FFFFFF` | `#FFFFFF` | text on the hero card                 |
| `--on-accent-muted` | `#E4E1FF` | `#E4E1FF` | labels on the hero card               |

Expense amounts are shown with a leading `−` in `--ink`; income with `+`; transfers with no sign and
`--muted`. "Needs a category" rows use `--accent-text` for the category label so uncategorised items
stand out. Theme follows the setting (auto / light / dark); auto follows the system.

## Shape and spacing

- Hero card radius 28px (iPhone), 24px (Mac, web). Other cards 16–20px. Pills and buttons 999px.
  Progress bars 3px tall, 2px radius. Table rows 10px radius on hover.
- iPhone page padding 20px, top inset 56px, bottom tab bar 83px with 4 tabs: Summary, Activity,
  Accounts, Settings. Round 44px icon buttons for previous/next month.
- Mac: left sidebar 220px (`--side`), items Summary, Transactions, Categories, Import, Accounts,
  Settings, with "Last alert N min ago" pinned to the bottom. Content area max 1040px.
- Web: top header with the wordmark "WebSpend", the same six sections as the Mac sidebar, and the
  rate line (`$1 = ₦1,500.00`) on the right. Content max 1120px, 24px gutters, 16px on phones.

## Screens (what each shows)

**Summary** — month title with prev/next; hero card: "Left to spend" big amount, "≈ $x · of ₦budget",
progress bar, then two columns "Spent" and "Income"; "Where it went" list of categories with amount and
proportional bar; "Latest" list (iPhone) or table (Mac, web) with date, title, category · account,
amount, ≈ USD. The rate line `$1 = ₦1,500.00` sits next to "Latest" / in the header.

**Transactions / Activity** — search field, filter chips (All, Needs a category, Expenses, Income,
Transfers), rows grouped by day with a day heading ("Today", "Yesterday", "Mon 6 Oct"). Row: icon
circle, title, "category · account", amount and ≈ USD on the right.

**Transaction detail** — back button, title, big signed amount, ≈ USD; facts list (Date, Account ·
"from email alert" / "imported" / "entered by hand", "Bank says" verbatim); Category section with pill
list + "Edit list" link and the "Remember for this payee" switch (sub-label "Starts off for processors
like Paystack"); "Your description" textarea; "Mark as" segmented: Expense / Income / Transfer to self.

**Categories** — intro line "One list, used on iPhone, Mac and web. Bank alerts rarely say what a
payment was for, so you choose from here."; "New category" input + Add; list with rename and remove;
footer row "Needs a category · N to sort".

**Accounts** — one card per tracked bank showing status (Off / Waiting for first alert / Tracking since
date), the checklist "1. Turn on email alerts in the bank's app 2. Switch tracking on here";
"My accounts" list of own account numbers with add/remove.

**Import** — pick account, drop or choose a CSV/JSON file, preview table, column → field mapping,
day/month order prompt when ambiguous, result "Added N · Skipped M".

**Settings** — Default currency (NGN, USD, GBP, EUR as cards with code + name), "Show US dollar
equivalent" switch with "Today's rate", hidden when USD is default (shows "No conversion needed"),
Monthly budget, Categories link with count, Theme segmented Auto / Light / Dark, signed-in email with
the note that this inbox is the one read, sign out.

**Sign-in** — wordmark, one line of what the app does, the Google button, and the statement: "WebSpend
reads the inbox you sign in with, and only messages from the banks you switch on. Nothing before you
switch a bank on is ever read."
