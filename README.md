# QCM Médecine

Banque de QCM par UE et par matière (site statique, sans installation).

## Mise en ligne sur GitHub Pages
1. Glisser **tout le contenu de ce dossier** à la racine du dépôt (`index.html` doit être à la racine).
2. *Settings → Pages* → Source : *Deploy from a branch* → branche `main`, dossier `/ (root)`.
3. Le site est disponible à l'adresse `https://<pseudo>.github.io/<depot>/`.

Le site fonctionne aussi en ouvrant simplement `index.html` dans un navigateur.

## Contenu
- `index.html` — la page
- `assets/style.css`, `assets/app.js` — interface et logique
- `data/questions.js` — toutes les questions (format JSON)
- `img/` — schémas, coupes histologiques, imagerie

## Fonctionnement
- **S'entraîner** : toutes les questions d'une matière, dans l'ordre des sources (filtre par source possible).
- **Test** : 20 QCM tirés au hasard (nombre réglable). Les questions d'un dossier progressif restent groupées, dans l'ordre, avec l'énoncé du dossier et les précisions des questions précédentes.
- **Paramètres** : chronomètre (par question ou pour tout le test), correction immédiate ou en fin de test, nombre de QCM, inclusion des QCM complétés.
- **⚠** : question dont certains items ont été ajoutés (ou dont la correction a été proposée) par Claude — à vérifier avec le cours.
- La progression est enregistrée dans le navigateur (localStorage), uniquement sur l'appareil utilisé.

Barème des tests : 0 discordance = 1 point · 1 discordance = 0,5 · 2 discordances = 0,2 · 3 et plus = 0.
