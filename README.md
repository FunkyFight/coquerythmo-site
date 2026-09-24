# Site de présentation de Coquerythmo

Site statique (Vite + JavaScript vanilla). Il reprend l'interface de Coquerythmo : la barre de menus sert de navigation, les onglets ouvrent les espaces de travail, et les boutons de téléchargement sont des répliques sur une vraie bande rythmo.

## Commandes

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # génère dist/, à déposer sur n'importe quel hébergeur statique
npm run preview  # sert dist/ en local
```

## Référencement

Le site est publié sur https://coquelicot.world. `npm run build` utilise cette adresse pour :

- le lien canonique ;
- les balises Open Graph (aperçus Discord et réseaux sociaux) ;
- les données structurées `SoftwareApplication`.

Il écrit aussi `robots.txt` et `sitemap.xml` dans `dist/`. L'image d'aperçu `public/og-image.png` (1200 × 630) est une capture de la fenêtre du site.

Les icônes du site (`favicon.ico`, `icon-192.png`, `apple-touch-icon.png`, `logo.png`) sont des carrés tirés de `app-icon.png` : Google ignore un favicon qui n'est pas carré. `logo.png` est l'image principale déclarée à Google dans les données structurées, et `robots.txt` interdit `/icons/` à Googlebot-Image pour qu'une bouche dessinée ne serve pas de miniature dans les résultats.

Pour publier ailleurs, la variable `SITE_URL` remplace l'adresse :

```sh
SITE_URL=https://autre-adresse.fr npm run build              # bash
$env:SITE_URL="https://autre-adresse.fr"; npm run build     # PowerShell
```

## Organisation

- `index.html` : la fenêtre (menus, onglets, copie de travail, barre d'outils, bande). Les sections sont incluses au build depuis `src/sections/*/*.html` et `src/workspaces/*/*.html` (voir `vite.config.js`).
- `src/band/engine.js` : moteur de bande rythmo en canvas. Barre de lecture fixe, texte étiré sur la durée, étiquettes de personnage, marqueurs, karaoké, dessin. Les lignes d'action sont de vrais liens `<a>` superposés.
- `src/lib/downloads.js` : lit les versions publiées sur `funkyfight/coquerythmo-releases` (le dépôt de l'updater). Pour chaque système, il choisit la version la plus récente qui contient un build. Si l'API est indisponible, il se rabat sur un instantané intégré.
- `src/styles/tokens.css` : couleurs et tailles reprises de `src/ui/theme.rs`.
- `public/icons/` : icônes et dessins de bouches de l'app.

## Contenu fictif

Les dialogues, personnages, salons, prises audio et bulles de Comic Dub sont des démonstrations fictives, signalées comme telles sur la page. La planche de Comic Dub est une grille vierge : le site n'embarque aucune illustration.

Le site ne permet pas d'utiliser le logiciel : il n'importe aucun fichier du visiteur et n'exporte rien. Les démos travaillent sur leur propre contenu d'exemple.
