# The Method Mafia — সম্পূর্ণ গাইড (A to Z)

কোডিং জানার দরকার নেই। যা যা লিখা আছে হুবহু করলেই হবে।

---

# 📦 ফাইলে কী কী আছে

```
methodmafia/
│
├── index.html          ← মূল পেজ (বিক্রির পেজ)
├── payment.html        ← পেমেন্ট নির্দেশনা
├── order-status.html   ← অর্ডার চেক
├── about.html          ← আমাদের সম্পর্কে
├── terms.html          ← শর্তাবলী
├── privacy.html        ← গোপনীয়তা
├── refund.html         ← রিফান্ড নীতি
│
├── config.js           ⭐ তোমার কন্ট্রোল প্যানেল
│
├── css/
│   └── style.css       ← সব রঙ ও ডিজাইন
│
├── js/
│   ├── translations.js ← মূল পেজের লেখা (৩ ভাষা)
│   ├── pages.js        ← বাকি পেজের লেখা (৩ ভাষা)
│   ├── main.js         ← সব কাজ করার কোড
│   ├── tracking-lib.js ← click ID / UTM / event rules
│   └── pixels.js       ← Meta + TikTok pixel (সব পেজে)
│
├── apps-script/
│   ├── OrderProcessor.gs  ← Sheet orders + FBclid/TTclid
│   └── CapiPurchase.gs    ← Status→Active Purchase (CAPI)
│
└── images/
    ├── logo.jpg
    └── banner.jpg
```

---

# 🚀 PART 1 — ওয়েবসাইট লাইভ করা

## ধাপ ১: ZIP ডাউনলোড ও খোলা (৩ মিনিট)

1. উপরের `methodmafia-FINAL.zip` ফাইলটা ডাউনলোড করো
2. কম্পিউটারে ফাইলটার উপর **ডান ক্লিক** → **Extract All** (বা WinRAR/7-Zip দিয়ে খোলো)
3. একটা `methodmafia` ফোল্ডার পাবে

**⚠️ ফোন থেকে করতে চাইলে:** "ZArchiver" অ্যাপ দিয়ে খুলতে পারবে। তবে কম্পিউটার থাকলে কম্পিউটার দিয়েই করো, সহজ হবে।

---

## ধাপ ২: GitHub-এ আপলোড (১০ মিনিট)

1. ব্রাউজারে যাও: **github.com/methodmafia/methodmafia**

2. **Add file** বাটন → **Upload files**

3. `methodmafia` ফোল্ডারটা **খোলো**, ভেতরের **সব ফাইল ও ফোল্ডার সিলেক্ট** করো (Ctrl+A)

4. ব্রাউজারে টেনে ছেড়ে দাও

**⚠️ খুব গুরুত্বপূর্ণ:**
- ZIP ফাইল আপলোড কোরো **না**
- `methodmafia` ফোল্ডারটা আপলোড কোরো **না**
- ফোল্ডারের **ভেতরের জিনিসগুলো** আপলোড করো

সঠিক হলে GitHub-এ এভাবে দেখাবে:
```
css/
images/
js/
config.js
index.html
payment.html
... (বাকিগুলো)
```

5. নিচে সবুজ **Commit changes** চাপো

✅ আপলোড শেষ

---

## ধাপ ৩: Cloudflare Pages-এ Deploy (১০ মিনিট)

1. **dash.cloudflare.com** এ লগইন করো

2. বাম মেনুতে **Compute** → **Workers & Pages**

3. **Create** বাটন → উপরে **Pages** ট্যাব → **Connect to Git**

4. **Connect GitHub** → লগইন করে **Authorize** দাও

5. তালিকা থেকে **methodmafia** সিলেক্ট করো → **Begin setup**

6. সেটিংস হুবহু এভাবে দাও:

```
Project name:            methodmafia
Production branch:       main
Framework preset:        None
Build command:           (একদম খালি রাখো)
Build output directory:  /
```

**⚠️ Build command অবশ্যই খালি রাখবে।**

7. **Save and Deploy** চাপো

⏱️ ১-২ মিনিট অপেক্ষা করো

✅ সাইট লাইভ: **methodmafia.pages.dev**

এই লিংকে গিয়ে দেখো ঠিকঠাক দেখাচ্ছে কিনা।

---

## ধাপ ৪: তোমার Domain যুক্ত করা (৫ মিনিট)

1. তোমার Pages প্রজেক্টে ঢোকো
2. উপরে **Custom domains** ট্যাব
3. **Set up a custom domain**
4. লিখো: `themethodmafia.com`
5. **Continue** → **Activate domain**

আবার একই কাজ করো, এবার লিখো: `www.themethodmafia.com`

⏱️ ৫–৩০ মিনিটে `https://themethodmafia.com` কাজ করবে।

**SSL অটোমেটিক হয়ে যাবে** — কিছু করতে হবে না।

---

## ধাপ ৫: দ্বিতীয় Domain Redirect (৫ মিনিট)

`methodmafia.com` লিখলেও যেন মূল সাইটে যায়:

1. Cloudflare → **Websites** → **Add a site**
2. লিখো: `methodmafia.com` → **Free** প্ল্যান
3. Cloudflare যে ২টা nameserver দেবে, সেটা Namecheap-এ বসাও:
   - Namecheap → Domain List → `methodmafia.com` → **Manage**
   - **NAMESERVERS** → **Custom DNS** → দুটো nameserver পেস্ট করো → ✓

4. Domain active হলে (১-২ ঘণ্টা):
   - Cloudflare → `methodmafia.com` সিলেক্ট → **Rules** → **Redirect Rules**
   - **Create rule**

```
Rule name: Redirect to main

When incoming requests match: All incoming requests

Then:
  Type: Dynamic
  Expression: concat("https://themethodmafia.com", http.request.uri.path)
  Status code: 301
```

5. **Deploy**

---

## ধাপ ৬: টেস্ট করো

একে একে চেক করো:

```
□ themethodmafia.com খোলে
□ তালা 🔒 চিহ্ন দেখা যায় (SSL)
□ লোগো ও ব্যানার দেখা যাচ্ছে
□ 🌐 বাটনে ভাষা বদলালে সব লেখা বদলায় (EN/বাংলা/हिन्दी)
□ Countdown চলছে
□ Tabs কাজ করে (AI/Ads/Courses/Scripts)
□ "📋 পূর্ণ তালিকা" চাপলে Telegram পোস্টে যায়
□ FAQ খোলে-বন্ধ হয়
□ ফুটারের সব লিংক কাজ করে
□ ফর্ম পূরণ করে Submit করলে Telegram খোলে
□ Google Sheet-এ order জমা হয়েছে
□ মোবাইলে ঠিকঠাক দেখাচ্ছে
□ methodmafia.com → themethodmafia.com এ যায়
```

---

# 🔧 PART 2 — পরে নিজে বদলানো

**নিয়ম: GitHub-এ ফাইল বদলালে Cloudflare নিজেই আপডেট করে দেবে। ১-২ মিনিট লাগে।**

## দাম বদলাতে

1. GitHub → **config.js** ফাইলে ক্লিক
2. ডানদিকে **✏️ পেন্সিল** আইকন
3. এই লাইনগুলো খুঁজে বদলাও:

```javascript
ENTRY_USD: "$30",
ENTRY_BDT: "৳৩,৯৩০",
MONTHLY_USD: "$15",
MONTHLY_BDT: "৳১,৯২০",
```

4. নিচে **Commit changes**

## Telegram লিংক বদলাতে

`config.js` এ:
```javascript
PUBLIC_CHANNEL: "https://t.me/TheMethodMafia",
SUPPORT: "https://t.me/MMHQ_Support",
FULL_LIST_POST: "https://t.me/TheMethodmafia1/95",
```

## Live Activity চালু করতে

শুরুতে বন্ধ রাখা আছে। আসল অর্ডার আসা শুরু হলে:

```javascript
SHOW_LIVE_ACTIVITY: true,
```

## সংখ্যা বদলাতে

```javascript
STAT_VIP: 2900,
STAT_COMMUNITY: 60000,
STAT_METHODS: 1000,
STAT_UPDATES: "50-70+",
```

সংখ্যা দিলে গুনে গুনে উঠবে। লেখা দিলে (যেমন `"50-70+"`) সরাসরি দেখাবে।

## কোনো লেখা বদলাতে

- **মূল পেজের লেখা** → `js/translations.js`
- **বাকি পেজের লেখা** → `js/pages.js`

⚠️ **তিন ভাষাতেই বদলাতে ভুলো না** (en, bn, hi)।

## নতুন টুল যোগ করতে

`js/translations.js` এ `VAULT_ITEMS` খুঁজো:

```javascript
ai: [
  ["🤖","ChatGPT Workspace Method","hot"],
  ["🆕","তোমার নতুন টুল Method","new"],    ← এভাবে যোগ করো
],
```

তৃতীয় ঘরে: `"hot"` (লাল), `"new"` (বেগুনি), বা `""` (কিছু না)

## রঙ বদলাতে

`css/style.css` এর একদম উপরে:

```css
:root{
  --gold:#FFD700;      ← মূল সোনালি
  --gold-2:#FFA500;    ← কমলা
  --bg:#050400;        ← ব্যাকগ্রাউন্ড
}
```

---

# 📊 PART 3 — অর্ডার ম্যানেজমেন্ট (প্রতিদিনের কাজ)

## যখন কেউ অর্ডার করে

**১. Google Sheet-এ নতুন সারি আসবে** — নাম, ইমেইল, টেলিগ্রাম, প্ল্যান, পেমেন্ট মেথড, সোর্স

**২. তোমার Telegram-এ মেসেজ আসবে** এভাবে:

```
🧾 NEW ORDER
━━━━━━━━━━━━━━
Order ID : MM-2026-4821
Name     : রাকিব হাসান
Email    : rakib@gmail.com
Telegram : @rakib_h
━━━━━━━━━━━━━━
Plan     : Entry
Amount   : $30
Payment  : বিকাশ
━━━━━━━━━━━━━━
```

**৩. তুমি পেমেন্ট ডিটেইলস পাঠাবে** (যে মেথড সে বেছেছে সেটার)

**৪. সে টাকা পাঠিয়ে স্ক্রিনশট দেবে**

**৫. তুমি যাচাই করে Telegram VIP লিংক পাঠাবে**

**৬. Google Sheet-এ গিয়ে:**
- `Status` কলামে লিখো: `Active`
- `Expiry` কলামে লিখো: আজ থেকে ৩০ দিন পরের তারিখ

---

## Google Sheet-এ Expiry অটো হিসাব

Sheet-এ **K1** ঘরে লিখো: `Days Left`

**K2** ঘরে এই সূত্র বসাও:

```
=IF(J2="","",J2-TODAY())
```

তারপর K2 ঘরটা কপি করে নিচের সব ঘরে পেস্ট করো।

এখন কত দিন বাকি অটো দেখাবে। **৩ দিনের কম হলে** ওই মেম্বারকে রিমাইন্ডার পাঠাও।

### রঙ দিয়ে চিহ্নিত করা

1. K কলাম সিলেক্ট করো
2. **Format** → **Conditional formatting**
3. **Less than** → `3` → লাল রঙ
4. **Done**

এখন যাদের মেয়াদ শেষ হতে যাচ্ছে তারা লাল দেখাবে।

---

## প্রতিদিনের রুটিন (১০ মিনিট)

```
সকাল:
□ Google Sheet খোলো
□ লাল রঙের সারি দেখো (মেয়াদ শেষের পথে)
□ তাদের Telegram-এ রিমাইন্ডার পাঠাও

সারাদিন:
□ নতুন অর্ডার এলে Telegram-এ উত্তর দাও
□ পেমেন্ট যাচাই করে অ্যাক্সেস দাও
□ Sheet আপডেট করো

রাত:
□ মেয়াদ শেষ হওয়া মেম্বারদের গ্রুপ থেকে সরাও
```

---

## রিমাইন্ডার মেসেজ টেমপ্লেট

**৩ দিন আগে:**
```
আসসালামু আলাইকুম [নাম],

আপনার Method Mafia মেম্বারশিপ আর ৩ দিন পর শেষ হবে।

রিনিউ করতে চাইলে $15 পাঠিয়ে দিন, আমি সাথে সাথে
আরো ৩০ দিন বাড়িয়ে দেব।

এই মাসে যা যোগ হয়েছে: [২-৩টা নতুন মেথডের নাম]
```

**মেয়াদ শেষের দিন:**
```
[নাম], আজই আপনার মেম্বারশিপের শেষ দিন।

আজ রিনিউ করলে কোনো বিরতি ছাড়াই চালু থাকবে।
```

**৭ দিন পর (ফিরিয়ে আনার চেষ্টা):**
```
[নাম], আপনাকে মিস করছি।

গত সপ্তাহে যা যোগ হয়েছে: [নতুন মেথড]

ফিরে আসতে চাইলে বলুন, এন্ট্রি ফি ছাড়াই সরাসরি
$15 দিয়ে ঢুকতে পারবেন।
```

---

# 🔍 PART 4 — Tracking দেখা

## Facebook Ads কেমন চলছে

```
business.facebook.com → Events Manager → তোমার Pixel
```

দেখবে: `PageView` (কতজন এসেছে), `ViewContent` (প্রাইসিং দেখেছে), `Lead` / `InitiateCheckout` (ফর্ম সাবমিট), `Purchase` (Entry Active — $30)

TikTok Events Manager-এ একই ফ্লো: `ViewContent` → `InitiateCheckout` → `CompletePayment` ($30, Entry only)

## কোন Ad থেকে বিক্রি আসছে

Ad-এর লিংকে এভাবে ট্যাগ লাগাও:

```
https://themethodmafia.com/?utm_source=facebook
https://themethodmafia.com/?utm_source=tiktok
https://themethodmafia.com/?utm_source=telegram
```

Google Sheet-এর **Source** কলামে দেখবে কোথা থেকে এসেছে।

**যেটা বেশি বিক্রি দিচ্ছে, সেখানে বেশি টাকা দাও।**

---

# 🆘 PART 5 — সমস্যা হলে

| সমস্যা | সমাধান |
|---|---|
| সাইট খোলে না | ৩০ মিনিট অপেক্ষা করো (DNS ছড়াতে সময় লাগে) |
| ছবি দেখা যায় না | `images` ফোল্ডার আপলোড হয়েছে কিনা দেখো |
| ভাষা বদলায় না | `js` ফোল্ডারের ৩টা ফাইলই আছে কিনা দেখো |
| ডিজাইন ভাঙা | `css` ফোল্ডার আপলোড হয়েছে কিনা দেখো |
| Sheet-এ order আসে না | Apps Script → Deploy → "Who has access: **Anyone**" আছে কিনা দেখো |
| ফর্ম কাজ করে না | ব্রাউজারে F12 চেপে Console-এ কী error দেখাচ্ছে দেখো |

**Cloudflare-এ deploy fail হলে:** প্রজেক্টে গিয়ে **Deployments** → সর্বশেষ deploy-এ ক্লিক → **View build log** দেখো।

---

# 💾 PART 6 — Backup

**তোমার সব কোড GitHub-এ আছে।** কিছু হারানোর ভয় নেই।

- Cloudflare মুছে গেলে → আবার connect করলেই হবে (৫ মিনিট)
- VPS লাগছেই না → সাইট Cloudflare-এ চলে, ফ্রি, চিরকাল
- মেম্বারদের তথ্য → Google Sheets-এ
- মেম্বাররা → Telegram-এ

**অতিরিক্ত নিরাপত্তার জন্য:** ZIP ফাইলটা Google Drive-এ রেখে দাও।

---

# ✅ PART 7 — চূড়ান্ত চেকলিস্ট

## আজ
```
□ ZIP ডাউনলোড ও খোলা
□ GitHub-এ আপলোড
□ Cloudflare Pages-এ deploy
□ Domain যুক্ত করা
□ সব টেস্ট করা
```

## এই সপ্তাহে
```
□ methodmafia.com redirect চালু
□ ৫ জন বন্ধু দিয়ে পুরো ফ্লো টেস্ট
□ Google Sheet-এ Days Left সূত্র বসানো
□ রিমাইন্ডার টেমপ্লেট তৈরি রাখা
```

## Launch-এর আগে
```
□ Telegram bot ঠিক করা
□ পেমেন্ট ডিটেইলস তৈরি রাখা
□ Ad creative বানানো
□ ছোট বাজেটে ad শুরু ($5-10/দিন)
```

---

# 📌 মনে রাখার ৩টা কথা

**১.** GitHub-এ যা push করবে, Cloudflare নিজেই লাইভ করে দেবে। আলাদা কিছু করতে হবে না।

**২.** `config.js` তোমার বন্ধু। ৯০% জিনিস ওখান থেকেই বদলানো যাবে — কোডিং ছাড়াই।

**৩.** Google Sheet তোমার আসল সম্পদ। যত টুলই ব্যবহার করো, ওখানে সব রেকর্ড রাখো।

---

**কোথাও আটকে গেলে screenshot দিয়ে জানিও।**

---

# 🆕 PART 8 — নতুন ফিচার (Sep 2026 আপডেট)

## দাম আপডেট
- **Entry regular price: $100** (কাটাকাটি দেখাবে) → **Entry price: $30** (70% OFF)
- `config.js`-এ বদলানো হয়েছে: `ENTRY_REGULAR_USD: "$100"`, `ENTRY_REGULAR_BDT: "৳১৩,১০০"`
- ভবিষ্যতে দাম বদলাতে শুধু `config.js` এডিট করলেই পুরো সাইটে বদলাবে।

---

## 📊 Apps Script আপগ্রেড (C1–C4)

`apps-script/OrderProcessor.gs` ফাইলে সম্পূর্ণ কোড আছে।

### একবারের সেটআপ:

**ধাপ ১: Apps Script খোলো**
1. Google Sheet খোলো
2. **Extensions** → **Apps Script**
3. যা আছে সব মুছে `apps-script/OrderProcessor.gs` ফাইলের সম্পূর্ণ কোড পেস্ট করো

**ধাপ ২: Config বসাও**
স্ক্রিপ্টের উপরে এই লাইনগুলো বদলাও:
```javascript
const SHEET_NAME   = 'Orders';          // তোমার Sheet-এর tab নাম
const ADMIN_TOKEN  = 'CHANGE_ME_NOW';   // একটা লম্বা random পাসওয়ার্ড দাও (random.org থেকে)
const DIGEST_EMAIL = 'info@themethodmafia.com';  // digest email ঠিকানা
```

**ধাপ ৩: Deploy করো**
1. **Deploy** → **New deployment**
2. Type: **Web App**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. **Deploy** চাপো → URL কপি করো
6. সেই URL → `config.js`-এ `SHEET_URL:` লাইনে বসাও

**ধাপ ৪: Sheet headers সেটআপ**
Apps Script editor-এ `setupSheetHeaders` ফাংশন সিলেক্ট করে ▶ Run চাপো।
Sheet-এ কলাম তৈরি হবে: Timestamp, Order ID, Name, Email, Telegram, Plan, Amount, Payment, **Source, Medium, Campaign**, Status, Expiry, Days Left, Notes, **FBclid, TTclid**

আগে থেকে Sheet চালু থাকলে শেষে দুটো কলাম যোগ করো: `FBclid` আর `TTclid` (Notes-এর পরে)। অথবা `setupSheetHeaders` আবার Run করো — শুধু হেডার রো আপডেট হবে।

---

### প্রতিদিনের কাজ — C1: Pending → Active (১-ক্লিক)

সকালে Daily Digest email আসবে `info@themethodmafia.com`-এ। তাতে:
- নতুন অর্ডারের তালিকা
- Pending অর্ডারের লিস্ট
- প্রতিটির নিচে **"Activate [Order ID]"** লিংক

সেই লিংকে ক্লিক করলে:
1. Order `Active` হয়ে যাবে
2. একটা **confirmation URL** দেখাবে — এটা কাস্টমারকে পাঠাও
3. **Purchase এখন Sheet থেকেই যায়** (Status → Active, Entry, $30) — কাস্টমারকে লিংক খুলতে হয় না
4. confirmation URL শুধু **optional backup** — খুললে ব্রাউজার pixel-ও fire হতে পারে (Entry only)

**অথবা সরাসরি URL দিয়ে:**
```
https://script.google.com/macros/.../exec?action=activate&orderId=MM-2026-XXXX&token=তোমার_টোকেন
```

---

### C2: Duplicate Detection

নতুন অর্ডার আসলে Apps Script আপনাআপনি দেখবে সেই Telegram বা Email আগে এসেছে কিনা।
Sheet-এর **Notes** কলামে `⚠️ DUPLICATE` লেখা দেখলে সেই অর্ডারটা একটু সতর্কতার সাথে যাচাই করো।

---

### C3: Daily Digest Setup

Apps Script editor → **Triggers** (⏰ আইকন) → **Add Trigger**:
```
Function:     dailyDigestTrigger
Event source: Time-driven
Type:         Day timer
Time:         9am to 10am
```
এখন প্রতিদিন সকাল ৯টায় digest email আসবে।

---

### C4: Expiry Reminder Setup

আরেকটা Trigger:
```
Function:     expiryReminderTrigger
Event source: Time-driven
Type:         Day timer
Time:         10am to 11am
```
৩ দিন বা কম বাকি থাকলে প্রতিদিন reminder email আসবে।

**ম্যানুয়ালি চালাতে:**
```
https://script.google.com/macros/.../exec?action=expiry&token=তোমার_টোকেন
```

---

## 📝 Blog পেজ (E4 — SEO)

নতুন ৪টি পেজ তৈরি হয়েছে:

| পেজ | URL |
|-----|-----|
| VIP-তে কী আছে | `/blog/vip-access.html` |
| Payment কীভাবে কাজ করে | `/blog/how-payment-works.html` |
| Freelancers-দের জন্য | `/blog/freelancer-tools.html` |
| নতুন মেম্বার গাইড | `/blog/getting-started.html` |

- Footer-এ link আছে
- Sitemap-এ add করা হয়েছে
- প্রতি পেজে CTA আছে `#order`-এ

---

## 📍 Order Status URL — Purchase Tracking

পেমেন্ট নিশ্চিত হলে কাস্টমারকে এই URL পাঠাও:
```
https://themethodmafia.com/order-status.html?orderId=MM-XXXX&confirmed=1&plan=Entry
```
(Apps Script-এর Activate লিংক থেকেও এই URL পাওয়া যাবে)

এই URL খুললে (optional backup, Entry only):
- GA-তে `purchase` event fire হবে
- FB Pixel-এ `Purchase` / TikTok-এ `CompletePayment` fire হবে (value $30, event_id = Order ID)
- "Payment Confirmed" banner দেখাবে কাস্টমারকে

**মূল Purchase এখন Google Sheet Status → Active থেকে যায়।** কাস্টমার এই লিংক না খুললেও ads conversion count হবে (PART 9 সেটআপ করলে)। Monthly-এ Purchase যাবে না।

---

## 🔗 UTM Tracking

এখন ad লিংকে UTM যোগ করলে Sheet-এ **Source, Medium, Campaign** কলামে যাবে:
```
https://themethodmafia.com/?utm_source=facebook&utm_medium=paid&utm_campaign=entry_sep26
https://themethodmafia.com/?utm_source=tiktok&utm_medium=paid&utm_campaign=promo_oct
https://themethodmafia.com/?utm_source=telegram&utm_medium=organic
```

---

## 🔒 Security Headers

`_headers` ফাইল যোগ করা হয়েছে — Cloudflare Pages এটা অটো লোড করে।
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` সব set আছে।

---

## 🌐 Google Analytics Fix

সব পেজে GA এখন সঠিকভাবে লোড হবে (`?id=G-HG9ELWF8ER` সহ)।
`config.js`-এ `GA_ID` বদলালে সব পেজে অটো আপডেট হবে।

---

# 🎯 PART 9 — Ads conversion (Meta CAPI + TikTok Events API)

Ads শুধু **Entry** টার্গেট করে। Purchase value **সবসময় $30**। Monthly ($15) এ Purchase যাবে না।

**মূল পথ:** তুমি Google Sheet-এ `Status` = `Active` লিখলেই Purchase চলে যায়। কাস্টমারকে `order-status.html?confirmed=1` খুলতে হয় না (সেটা শুধু backup)।

---

## English — one-time setup (10 minutes)

### 1) Paste the new Apps Script files

Google Sheet → **Extensions** → **Apps Script**

- Keep `OrderProcessor.gs` (replace with the repo file — it now has FBclid / TTclid columns)
- **+** → Script → name it `CapiPurchase` → paste `apps-script/CapiPurchase.gs`

Save (Ctrl+S).

### 2) Script Properties (tokens — never put tokens in the code)

Apps Script → ⚙️ **Project Settings** → scroll to **Script properties** → **Add script property**:

| Property | Where to get it |
|---|---|
| `META_PIXEL_ID` | Facebook Events Manager → your Pixel ID (same as `config.js` → `META_PIXEL`) |
| `META_ACCESS_TOKEN` | Events Manager → Settings → Conversions API → Generate access token |
| `TIKTOK_PIXEL_ID` | TikTok Events Manager → Pixel code (same as `config.js` → `TIKTOK_PIXEL`) |
| `TIKTOK_ACCESS_TOKEN` | TikTok Events Manager → Settings → Events API → Generate Access Token |

Optional (only while testing): `META_TEST_EVENT_CODE`, `TIKTOK_TEST_EVENT_CODE`

**Save**. Tokens stay in Script Properties. Do not paste them into GitHub.

### 3) Install the On edit trigger

Apps Script → ⏰ **Triggers** → **Add Trigger**:

```
Function:       onOrderStatusEdit
Deployment:     Head
Event source:   From spreadsheet
Event type:     On edit
```

Authorize when Google asks (your Google account sends the events).

This trigger is required. A normal `onEdit` cannot call the ads APIs.

### 4) Test

**A. Token check (editor)**
1. Optional but safer: add Script properties `META_TEST_EVENT_CODE` and `TIKTOK_TEST_EVENT_CODE` from Events Manager (Test events). Without these, `testCapiConnection` sends a real test Purchase.
2. Function dropdown → `testCapiConnection` → ▶ Run
3. **Executions** (left) → open the run → log should show `meta: ok` and/or `tiktok: ok`
4. Facebook Events Manager → Test events / Overview
5. TikTok Events Manager → Test events / Overview  
   Event: Meta `Purchase` / TikTok `CompletePayment`, value `30`, event_id starts with `TEST-`

**B. Real flow (Sheet)**
1. Add a test row: Plan = `Entry`, Status = `Pending`, Email = your email, Order ID = `MM-2026-TEST`
2. Change Status to `Active` (any capitalization is fine)
3. Notes should get `PURCHASE_SENT`
4. Changing Status again must NOT send a second Purchase
5. A Monthly row set to Active must NOT send Purchase

If Notes never gets `PURCHASE_SENT`: tokens missing, trigger not installed, or Plan is not Entry. Check **Executions**.

---

## বাংলা — একবারের সেটআপ

**ধাপ ১:** Sheet → Extensions → Apps Script। `OrderProcessor.gs` আপডেট করো। নতুন ফাইল `CapiPurchase` বানিয়ে `apps-script/CapiPurchase.gs` পেস্ট করো।

**ধাপ ২:** ⚙️ Project Settings → Script properties-এ ৪টা key বসাও: `META_PIXEL_ID`, `META_ACCESS_TOKEN`, `TIKTOK_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN`। টোকেন কোডে লিখবে না, GitHub-এও না।

**ধাপ ৩:** ⏰ Triggers → Add Trigger → Function `onOrderStatusEdit` → From spreadsheet → On edit। Authorize দাও।

**ধাপ ৪:** `testCapiConnection` Run করে Events Manager-এ event দেখো। তারপর একটা Entry রো-এর Status `Active` করো — Notes-এ `PURCHASE_SENT` আসবে, value $30।

---

## মনে রাখার নিয়ম

- Purchase **শুধু Entry**, value **সবসময় 30 USD**
- এক অর্ডারে একবারই যাবে (`PURCHASE_SENT`)
- `event_id` = Order ID — browser backup আর CAPI একই conversion হিসেবে গণনা হবে
- FBclid / TTclid কলাম Swa ignore করতে পারো — ads matching-এর জন্য
- Pixel ID বদলাতে `config.js` → `META_PIXEL` / `TIKTOK_PIXEL` (সাইট) **এবং** Script Properties (CAPI) দুটো জায়গায়


