/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — CONTROL PANEL
   ═══════════════════════════════════════════════════════════

   এই ফাইলটাই তোমার কন্ট্রোল প্যানেল।
   দাম, লিংক, নম্বর বদলাতে চাইলে শুধু এখানে edit করো।
   অন্য কোনো ফাইলে হাত দেওয়ার দরকার নেই।

   ⚠️ নিয়ম: শুধু " " এর ভেতরের লেখা বদলাবে।
            কমা (,) বা উদ্ধৃতি (") মুছবে না।
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {

  /* ─── ব্র্যান্ড ─────────────────────────────────────────── */
  BRAND_NAME: "THE METHOD MAFIA",

  /* মূল ডোমেইন (methodmafia.com এখান থেকে redirect হবে) */
  DOMAIN: "https://themethodmafia.com",
  DOMAIN_ALT: "https://methodmafia.com",


  /* ─── দাম ───────────────────────────────────────────────
     দাম বদলাতে চাইলে এই ৪টা লাইন বদলাও */

  ENTRY_USD: "$30",
  ENTRY_BDT: "৳৩,৯৩০",

  MONTHLY_USD: "$15",
  MONTHLY_BDT: "৳১,৯২০",


  /* ─── TELEGRAM ──────────────────────────────────────────
     ⚠️ VIP চ্যানেলের লিংক এখানে কখনো দিও না।
        শুধু পেমেন্ট করা মেম্বারদের নিজে পাঠাবে। */

  PUBLIC_CHANNEL: "https://t.me/TheMethodMafia",

  /* "পূর্ণ তালিকা" ট্যাবে ক্লিক করলে যে পোস্টে যাবে */
  FULL_LIST_POST: "https://t.me/TheMethodmafia1/95",
  SUPPORT: "https://t.me/MMHQ_Support",

  /* Facebook পেজ */
  FACEBOOK_PAGE: "https://www.facebook.com/share/19Q7KrfTBT/",
  SUPPORT_HANDLE: "@MMHQ_Support",


  /* ─── যোগাযোগ ──────────────────────────────────────────── */
  EMAIL: "info@themethodmafia.com",


  /* ─── TRACKING ──────────────────────────────────────────
     Pixel ID বদলাতে চাইলে এখানে */

  META_PIXEL: "1041150375454334",
  TIKTOK_PIXEL: "DA6ITFJC77U72JPLUACG",
  GA_ID: "G-HG9ELWF8ER",


  /* ─── GOOGLE SHEETS ─────────────────────────────────────
     সব order এখানে জমা হবে */

  SHEET_URL: "https://script.google.com/macros/s/AKfycbydy3E_pQANu4eNcCjF3IdqVT_S9UeHZEhHiTARTepjmbHclazx-STuG7plSuXTKKM/exec",


  /* ─── কমিউনিটি সংখ্যা ───────────────────────────────────
     এগুলো hero সেকশনে দেখাবে */

  STAT_VIP: 2900,
  STAT_COMMUNITY: 60000,
  STAT_METHODS: 1000,
  /* সংখ্যা দিলে গুনে গুনে উঠবে। টেক্সট দিলে (যেমন "50-70+") সরাসরি দেখাবে */
  STAT_UPDATES: "50-70+",


  /* ─── LIVE ACTIVITY POPUP ───────────────────────────────
     "ঢাকা থেকে রাকিব জয়েন করেছেন" — এই ধরনের popup

     true  = চালু
     false = বন্ধ

     ⚠️ পরামর্শ: শুরুতে false রাখো।
        আসল order আসা শুরু হলে true করো। */

  SHOW_LIVE_ACTIVITY: false,


  /* ─── COUNTDOWN TIMER ───────────────────────────────────
     কত ঘণ্টার কাউন্টডাউন দেখাবে */

  COUNTDOWN_HOURS: 24,


  /* ─── ভাষা ──────────────────────────────────────────────
     ডিফল্ট কোন ভাষায় খুলবে
     "en" = English | "bn" = বাংলা | "hi" = हिन्दी */

  DEFAULT_LANG: "en"

};
