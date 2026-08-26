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
│   └── main.js         ← সব কাজ করার কোড
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

দেখবে: `PageView` (কতজন এসেছে), `InitiateCheckout` (কতজন ফর্ম পূরণ করেছে)

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
