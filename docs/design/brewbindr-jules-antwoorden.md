# Antwoorden op je vragen — BrewBindr design implementatie

## 1. Team
Link "Team" naar de bestaande `BrewerySettings` component. Geen nieuwe component nodig.

## 2. Importeren
Trek de import-functionaliteit uit waar ze nu zit en maak er een aparte `ImportView` van. Geen logica dupliceren — gewoon verplaatsen en de bestaande code hergebruiken.

## 3. Brouwinstallatie
Volledig nieuw — bouw vanaf nul. Gebruik **BeerXML** als basis voor de datastructuur, zowel voor de installatiegegevens als voor de mash profiles. BeerXML-bestanden bevatten typisch ook equipment- en mash profile-data, dus die kunnen via Importeren binnenkomen.

De pagina krijgt twee tabs:
- **Installatie** — fysieke componenten (ketel, vergistingsvat, koeler, enz.)
- **Mash profiles** — herbruikbare temperatuurprofielen, gekoppeld aan de installatie

## 4. Voorraad
Toon een overzicht van alle ingrediënten met naam, type, hoeveelheid en eenheid. De hoeveelheid wordt visueel weergegeven als een **bierglas dat vult of leegt** naargelang de beschikbare voorraad. De kleur van het bier volgt de SRM-schaal: kristalhelder geel (vol) → goudblond → amber → bruin → donker stout (leeg). Het percentage-label en de mini-balk in de lijstweergave gebruiken groen/oranje/rood als statuskleur.

Zie de bijgevoegde bestanden:
- `brewbindr-voorraad-indicator.html` — interactief visueel prototype
- `GlassIndicator.tsx` — kant-en-klare React component, klaar om te gebruiken

De component exporteert:
- `GlassIndicator` — voor de kaartweergave (groot glas met label en hoeveelheid)
- `MiniGlassBar` — voor de lijstweergave (klein glas + horizontale balk naast elkaar)

## 5. Wordmark
Bouw dit op met HTML/CSS en de Outfit font zoals beschreven in de taakomschrijving. Geen aparte SVG nodig.

```css
font-family: 'Outfit', sans-serif;
font-weight: 800;
text-transform: uppercase;
letter-spacing: -0.3px;
/* "BREW" in var(--color-text), "BINDR" in var(--color-accent) */
```

## 6. Navigatie iconen
Gebruik **FontAwesome** overal — sidebar én mobiel. De emoji's in de taakomschrijving waren puur illustratief bedoeld.

## 7. Bubbles animatie
Ja, direct implementeren als onderdeel van de amber gradiënt achtergrond. Zie `brewbindr-v4.html` voor de exacte CSS + JS implementatie (±25 regels).

## 8. Klik op gated item
**Redirect naar de auth view.** Niets doen is slechte UX — een klik op een gated item is een actieve uitnodiging om in te loggen.

## 9. Landing page op basis van auth status
Ja, bepaal de initiële view state op basis van auth status in de root-component of router:
- **Ingelogd** → Brouwerij > Recepten
- **Gast** → Bibliotheek > Recepten
