# Worktide — Brand Assets

Bildzeichen **04e "Tide-Crop"**: gestaffelte Wellen als steigender Pegel im Bullauge,
mit Coral-Kante als „aktueller Stand".

## Inhalt

```
worktide-brand-book.html      Interaktiver Styleguide (hell/dunkel, alles an einem Ort)
logo/
  worktide-icon.svg           Bildzeichen solo (64×64)
  worktide-lockup.svg         Icon + Wortmarke, helle Flächen
  worktide-lockup-dark.svg    Icon + Wortmarke, dunkle Flächen
favicon/
  favicon.svg                 Vereinfachte Fassung fürs Kleinformat
  favicon.ico                 16 / 32 / 48
  favicon-16/32/48/180.png
  apple-touch-icon.png        180×180
css/
  brand.css                   Farb-Tokens (Tide-Rampe + Coral) + semantische Variablen
png/
  worktide-icon-512.png
  worktide-lockup.png / -dark.png
```

Wortmarke: **Space Grotesk** Medium, als Vektorpfade eingebettet (keine Schrift nötig).
Body: Inter · Code/Werte: JetBrains Mono. Alle SIL OFL.

## Favicon einbinden

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Farb-Kern

| Token        | Hex      | Rolle                          |
|--------------|----------|--------------------------------|
| `--wt-tide`  | #0F8C72  | Primär · Links · Ring          |
| `--wt-deep`  | #0B5E4D  | Tiefstes Band · dunkle Flächen |
| `--wt-mid`   | #1D9E75  | Mittleres Band                 |
| `--wt-light` | #5DCAA5  | Helles Band                    |
| `--wt-foam`  | #DCF4EC  | Tints / Schaum                 |
| `--wt-coral` | #E0623A  | Akzent · Alerts · Kamm         |

Dark-Mode: `--wt-tide` → `#2BB78F`, BG `#0E1714`. Details siehe `css/brand.css`.
