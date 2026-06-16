# BrewBindr — Design implementatie

> Taakomschrijving voor Jules · Referentie: `brewbindr-v4.html`

---

## 1. Design tokens

Voeg onderstaande CSS custom properties toe aan `:root` in `index.css`. Alle kleur-, typografie- en spatiëringsbeslissingen vertrekken hiervan.

```css
:root {
  /* Kleuren */
  --color-bg:          #FFFFFF;
  --color-bg-subtle:   #F5F7FA;
  --color-bg-hover:    #EDF1F7;
  --color-border:      #E2E8F0;
  --color-border-strong: #CBD5E1;
  --color-text:        #0F1B2D;
  --color-text-muted:  #64748B;
  --color-text-xmuted: #94A3B8;
  --color-accent:      #F59E0B;
  --color-accent-light:#FEF3C7;
  --color-accent-dark: #D97706;
  --color-blue:        #3B82F6;
  --color-blue-light:  #EFF6FF;
  --color-green:       #10B981;
  --color-green-light: #ECFDF5;
  --color-purple:      #7C3AED;
  --color-purple-light:#F5F3FF;

  /* Typografie */
  --font-body:    'Inter', sans-serif;
  --font-display: 'Playfair Display', serif;
  --font-brand:   'Outfit', sans-serif;

  /* Ruimte & vorm */
  --radius:    10px;
  --radius-sm:  6px;
  --sidebar-w: 240px;
  --topbar-h:   56px;
  --bottomnav-h:60px;

  /* Schaduwen */
  --shadow-sm: 0 1px 3px rgba(15,27,45,.06), 0 1px 2px rgba(15,27,45,.04);
  --shadow:    0 4px 12px rgba(15,27,45,.08), 0 1px 3px rgba(15,27,45,.05);
}
```

Google Fonts toevoegen in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
```

---

## 2. Logo

### Mark
- Achtergrond: `var(--color-accent)` (#F59E0B)
- Icoon: bierglas SVG, wit (#FFFFFF)
- Formaat: 32×32px, border-radius 8px

```svg
<svg viewBox="0 0 24 24" fill="#FFFFFF">
  <path d="M5 3l1.5 14.5A2 2 0 008.5 19h7a2 2 0 002-1.5L19 3H5zm2.2 2h9.6l-1.2 12H8.4L7.2 5zm1.3 2l.8 8h5l.8-8H8.5z"/>
</svg>
```

### Wordmark
- Font: `Outfit`, weight 800, uppercase, letter-spacing -0.3px
- Kleur: `var(--color-text)` voor "BREW", `var(--color-accent)` voor "BINDR"
- Weergave: `BREW`**`BINDR`**

### Achtergrond (buiten sidebar/content)
Amber gradiënt als body-achtergrond:
```css
background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 40%, #fde68a 100%);
```

Optioneel: subtiele oprijzende belletjes als CSS-animatie (zie mockup voor implementatie).

---

## 3. Navigatiestructuur

### Desktop: vaste sidebar (240px)

```
BROUWERIJ
  🍺  Recepten
  📋  Brouwlogboek
  ⭐  Proefnotities
  📦  Voorraad          ← alleen zichtbaar als stockbeheer ingeschakeld (zie §6)
  👥  Team
  ⬆️  Importeren
  🌡️  Brouwinstallatie  ← bevat tabs: Installatie | Mash profiles

BIBLIOTHEEK
  🍺  Recepten          ← publiek, geen login vereist
  🌿  Ingrediënten      ← publiek, geen login vereist

SYSTEEM
  ⚙️  Instellingen      ← bevat toggle voor stockbeheer
```

Onderaan sidebar: gebruikerskaart (naam, rol, brouwerij) of aanmeld-CTA als gast.

### Mobiel: bottom navigation (4 tabs + Meer)

| Tab | Icoon | Inhoud |
|-----|-------|--------|
| Recepten | fa-flask | Brouwerij > Recepten |
| Logboek | fa-clipboard-list | Brouwlogboek (dot als actieve sessie) |
| Proeven | fa-star-half-stroke | Proefnotities |
| Bibliotheek | fa-book-open | Bibliotheek recepten + ingrediënten |
| Meer | fa-ellipsis | Voorraad, Team, Importeren, Brouwinstallatie, Instellingen |

---

## 4. Authenticatie-states

De app is publiek toegankelijk zonder login. Enkel de **Bibliotheek** is zichtbaar zonder account.

### Gast (niet ingelogd)

- Brouwerij-navigatie-items: zichtbaar maar **grayed out** (opacity 0.38), niet klikbaar
- Elk grayed item toont bij hover een tooltip: *"Aanmelden voor toegang"*
- Topbar: prominente **"Aanmelden"** knop (accent-kleur)
- Amber infobanner onder topbar: *"Je bekijkt de publieke bibliotheek. Meld je aan om eigen recepten te bewaren..."*
- Sidebar footer: aanmeld-knop + "Account aanmaken" knop
- Landingspagina: **Bibliotheek > Recepten** (actief in nav)
- Dashboard-stats en AI-notice: **verborgen**
- Mobiel: "Aanmelden"-knop in topbar, Brouwerij-tabs in bottom nav grayed out

### Ingelogd

- Alle navigatie-items klikbaar
- Landingspagina: **Brouwerij > Recepten**
- Dashboard-stats zichtbaar (recepten, brouwsessies, proefnotities, team)
- AI-notice zichtbaar
- Brouwlogboek-tabel zichtbaar
- Sidebar footer: gebruikerskaart

---

## 5. Receptenkaart

Elke kaart heeft:
- **Kleurstreep** bovenaan (5px hoog) op basis van SRM-waarde van het recept
- **Style-pill** (bijv. "Belgian Tripel")
- **AI-badge** als het recept AI-gegenereerd is
- **Stats-rij**: ABV · IBU · SRM · Volume
- **Footer**: brouwbaar-badge (groen) of status + actieknoppen

Tabs boven de grid: **Alle · Brouwbaar · In fermentatie**

---

## 6. Stockbeheer (feature flag)

Stockbeheer is een optionele feature, instelbaar via **Instellingen**.

**Als uitgeschakeld:**
- "Voorraad" verdwijnt uit de sidebar
- Geen voorraad-stat op het dashboard
- "Brouwbaar"-badges op recepten tonen niet (stock onbekend)

**Als ingeschakeld:**
- "Voorraad" verschijnt in sidebar onder Proefnotities
- Extra stat-kaart "Voorraad" op dashboard
- "Brouwbaar"-badges worden berekend op basis van beschikbare stock

Implementatie: sla de voorkeur op in `user_preferences` (Supabase) en lees die uit bij app-start.

---

## 7. Brouwinstallatie

Pagina met twee tabs:

1. **Installatie** — beheer van fysieke componenten (ketel, vergistingsvat, koeler, enz.)
2. **Mash profiles** — herbruikbare temperatuurprofielen, gekoppeld aan de installatie

---

## 8. Bibliotheek

De bibliotheek is **altijd publiek toegankelijk** (geen login vereist).

- **Recepten**: doorzoekbare publieke receptencollectie van alle brouwerijen
- **Ingrediënten**: publieke database van mout, hop, gist, additieven — met beschrijvingen

Geen aparte "Publiek"-menuoptie meer nodig: de Bibliotheek ís per definitie publiek.

---

## 9. Referentiebestand

Het volledige interactieve mockup (desktop + mobiel, gast + ingelogd) is beschikbaar als `brewbindr-v4.html`. Gebruik dit als visuele referentie voor alle bovenstaande beslissingen.
