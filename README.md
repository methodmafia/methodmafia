# The Method Mafia — Website

Premium VIP Community landing site. Trilingual (English / বাংলা / हिन्दी).

## Structure
```
index.html          Main sales page
payment.html        Payment instructions
order-status.html   Order status checker
about.html          About us
terms.html          Terms & conditions
privacy.html        Privacy policy
refund.html         Refund policy

config.js           ⭐ CONTROL PANEL — prices, links, pixels
css/style.css       All styling
js/translations.js  Main page text (3 languages)
js/pages.js         Inner page text (3 languages)
js/main.js          All functionality
images/             Logo & banner
```

## Quick edits
| What | Where |
|---|---|
| Prices, links, pixel IDs | `config.js` |
| Main page text | `js/translations.js` |
| Inner page text | `js/pages.js` |
| Colours | `css/style.css` → `:root` |

## Deploy
Cloudflare Pages. Push to `main` → auto-deploys.
Full instructions in `GUIDE.md`.
