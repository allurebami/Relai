# Relai Studio

Une application de préparation de contenus pour Instagram, TikTok, YouTube, Facebook et LinkedIn.

## Déployer sur Vercel

Cette version utilise **Next.js standard**, React et TypeScript. Elle remplace la configuration Vinext/Cloudflare du premier import.

1. Importer le dépôt **allurebami/Relai** dans Vercel.
2. Sélectionner la branche **main** et sa dernière version.
3. Conserver les paramètres suivants :

| Paramètre | Valeur |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | ./ |
| Build Command | npm run build |
| Output Directory | .next |
| Node.js | 24.x |
| Install Command | Détection automatique via packageManager et pnpm-lock.yaml |
| Variables d’environnement | Aucune pour la préparation locale ; voir le guide pour les connexions sociales |

Le fichier vercel.json définit le framework et la sortie. Les scripts package.json lancent les commandes Next.js natives.

Si un premier déploiement a échoué, relancer l’import ou créer un déploiement à partir du **dernier commit de main**. Redéployer l’ancien commit conserve son ancienne configuration Cloudflare.

## Sauvegarde des données

Cette V1 stocke les textes, les workflows et les fichiers dans **IndexedDB, à l’intérieur du navigateur utilisé**. L’interface affiche ce mode de sauvegarde.

- Les données restent disponibles après rechargement sur le même navigateur et la même adresse.
- Elles ne sont pas synchronisées avec un autre appareil ou navigateur.
- Effacer les données du site, utiliser la navigation privée ou dépasser le quota du navigateur peut affecter leur conservation.
- Télécharger les packs et sauvegardes utiles avant d’effacer les données du site.
- Les médias ne passent pas par une fonction Vercel et ne sont pas envoyés à un stockage partagé.

Utiliser l’adresse de production habituelle pour retrouver son espace. Une URL d’aperçu différente possède un espace de stockage distinct.

Le stockage partagé entre appareils et la gestion des utilisateurs nécessiteront une base de données, un stockage de fichiers et des autorisations côté serveur. Le Site privé initial reste indépendant de cette version GitHub ; ses anciennes données ne sont pas migrées automatiquement.

## Fonctionnalités de la V1

- Bibliothèque d’images, de vidéos et de textes.
- Imports JPG, PNG, WebP, MP4, WebM et MOV, jusqu’à 40 Mo par fichier dans la limite du stockage disponible.
- Déclinaisons et légendes modifiables pour cinq réseaux.
- Workflows de préparation automatique à l’import.
- Prévention des doublons et préservation des textes déjà personnalisés.
- Formats carré, vertical et paysage pour les images.
- Extraits vidéo jusqu’à 90 secondes dans un navigateur compatible.
- Calendrier à l’heure du Cameroun et export ICS.
- Packs ZIP et sauvegarde JSON des réglages, textes et dates.

Les packs vidéo contiennent l’original. Les extraits adaptés s’exportent individuellement depuis l’éditeur et leur encodage prend environ la durée de l’extrait.

Les parcours de connexion OAuth pour Instagram, Facebook, YouTube, TikTok et LinkedIn sont implémentés. Leur activation exige un stockage sécurisé et les applications développeur correspondantes : **[guide de configuration](docs/social-connections.md)**. Aucun compte n’est affiché comme autorisé avant une réponse réelle du réseau.

La publication directe et programmée n’est pas encore implémentée. Le calendrier organise une diffusion manuelle et ne déclenche pas d’envoi automatique. Les connexions sont communes à un espace administrateur unique ; les fichiers et brouillons restent locaux.

## Installation locale

Prérequis : Git et **Node.js 24**.

~~~bash
git clone https://github.com/allurebami/Relai.git
cd Relai
npx pnpm@11.25.0 install --frozen-lockfile
npm run dev
~~~

Ouvrir http://localhost:3000.

## Vérifications

~~~bash
npm test
npm run typecheck
npm run build
npm start
~~~

Les tests vérifient les parcours OAuth avec des réponses réseau interceptées (aucun consentement réel simulé dans le produit), puis les déclinaisons, le calendrier, la conservation des textes, la persistance IndexedDB, les conflits entre onglets et l’import/lecture/suppression des médias. La simulation IndexedDB sous Node complète les vérifications du navigateur.

## Structure

| Chemin | Rôle |
| --- | --- |
| app/ | Interface Next.js et traitement des médias |
| lib/local-studio.ts | Stockage IndexedDB et contrôle des versions |
| lib/studio-schema.ts | Validation des données |
| lib/use-media-url.ts | Lecture des médias locaux dans l’interface |
| lib/social/ | Autorisations OAuth, chiffrement, sessions et stockage sécurisé |
| app/api/social/ | API serveur de connexion et de gestion des comptes |
| app/social-connections.tsx | Interface des comptes sociaux et configuration |
| docs/social-connections.md | Activation des réseaux et variables serveur |
| scripts/verify-core.mjs, scripts/verify-social.mjs | Tests du studio et des connexions |
| vercel.json | Configuration du déploiement |
