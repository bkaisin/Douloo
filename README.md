# Douloo

Douloo suit les variations des 300 plus grosses cryptos (hors stablecoins) sur 8 périodes : 15 min, 30 min, 1 h, 4 h, 1 jour, 1 semaine, 1 mois et 1 an.

C'est une web app (PWA) pensée pour l'iPhone et l'iPad : on l'ouvre dans Safari, puis **Partager → Sur l'écran d'accueil**, et elle se lance en plein écran comme une app native.

## Fonctions

- **3 affichages** (boutons à droite des périodes) :
  - **Liste** : rang, prix, variation sur chaque période, capitalisation, liens CoinGecko / TradingView. Tri par colonne. Les cartes du haut donnent la médiane et le nombre de tokens en hausse / en baisse pour chaque période ; toucher une carte sélectionne la période.
  - **Essaim** : bulles placées horizontalement selon leur variation ; la ligne verticale est le 0 % (zone rouge à gauche, verte à droite). Leur taille dépend de la variation (surface proportionnelle à la variation en valeur absolue), pas de la capitalisation. Quand une variation est si forte que sa bulle deviendrait trop grande, seule cette bulle est ramenée à une taille maximale, calculée d'après la taille de l'écran et le nombre de bulles affichées (deux fois la taille qu'aurait chaque bulle si elles étaient toutes égales). Les bulles occupent toute la hauteur disponible sans se chevaucher : quand une colonne est pleine, les bulles en trop sont décalées horizontalement vers la place libre la plus proche, sans changer de taille ni passer de l'autre côté du 0 %. Les valeurs extrêmes sont placées au bord (leur étiquette garde la vraie valeur). Les bulles flottent légèrement comme dans un liquide, on peut les pousser du doigt, et elles se réarrangent quand on passe du portrait au paysage.
  - **Heatmap** : tuiles proportionnelles à la capitalisation (échelle racine), couleur = variation.
- **Tokens / Narratifs** : les narratifs (L1, L2, DeFi, DEX, Perps, Lending, Meme, AI, RWA, Oracle, Liquid Staking, Privacy, Gaming, DePIN, ZK, CEX, Actions, Or) affichent la variation moyenne pondérée par la capitalisation de leurs tokens.
- **Plages** 1-100, 101-200, 201-300 ou Tous dans les vues graphiques.
- **Fiche détaillée** au toucher d'une bulle, d'une tuile ou d'une ligne : variation 1H / 1D / 1W / 1M / 1Y, prix et market cap.
- **Recherche** dans la liste, et **ajout** de n'importe quel token CoinGecko hors top 300 (il est ajouté aux favoris).
- **Favoris** : étoile sur chaque ligne ou dans la fiche, filtre « Favoris ».
- **Thème sombre** (par défaut) **et clair**.
- **Mise en page adaptative** : le nombre de colonnes de la liste et la disposition des commandes s'adaptent à la largeur disponible (iPhone portrait/paysage, iPad, Split View).
- Rafraîchissement automatique toutes les 60 s. Les dernières données sont gardées sur l'appareil pour un démarrage instantané, même hors ligne.

## Sources de données (gratuites, sans clé)

| Données | Source |
| --- | --- |
| Liste, prix, capitalisation, variations 1H / 1D / 1W / 1M / 1Y, recherche | [CoinGecko](https://www.coingecko.com/) API publique |
| Variations 15M / 30M / 4H | [DefiLlama](https://defillama.com/) `coins.llama.fi/percentage` (indexé par id CoinGecko) |
| Complément 15M / 30M | [Coinpaprika](https://coinpaprika.com/) |
| Narratifs | Catégories CoinGecko (`app/data/narratives.json`) |

Les trois API autorisent les appels directs depuis le navigateur (CORS) : aucun serveur n'est nécessaire. Certains fonds tokenisés très peu échangés n'ont pas de donnée 15M / 30M ; ils affichent « — » et sont exclus des bulles pour ces périodes.

Si CoinGecko limite les requêtes, une clé « Demo » gratuite peut être saisie dans **Réglages**.

## Héberger gratuitement avec GitHub Pages

Le workflow `.github/workflows/pages.yml` publie le dossier `app/` à chaque push sur `main`.

1. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. Merger la pull request (ou relancer le workflow « Déployer sur GitHub Pages » depuis l'onglet Actions).
3. L'app est disponible sur `https://<compte>.github.io/<dépôt>/`, par exemple `https://bkaisin.github.io/Douloo/`.

GitHub Pages est gratuit pour un dépôt **public**. Pour un dépôt privé, il faut un abonnement GitHub payant.

## Installer sur iPhone / iPad

1. Ouvrir l'adresse GitHub Pages dans **Safari**.
2. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.

## Développement

Aucune dépendance ni étape de build : HTML, CSS et JavaScript (modules ES).

```bash
python3 -m http.server 8000 -d app
```

Puis ouvrir http://localhost:8000.

Pour régénérer la correspondance token → narratif (Node 18+) :

```bash
node tools/build-narratives.mjs
```

### Structure

```
app/
  index.html, manifest.webmanifest, sw.js
  css/app.css
  js/
    app.js       orchestration, état, rafraîchissement
    api.js       appels CoinGecko / DefiLlama / Coinpaprika
    data.js      fusion des sources, top 300, narratifs, statistiques
    list.js      liste adaptative
    bubbles.js   essaim de bulles (simulation « liquide »)
    treemap.js   heatmap
    sheet.js     fiche détaillée et réglages
    config.js, format.js, colors.js, icons.js, store.js
  data/narratives.json
  icons/
tools/build-narratives.mjs
```
