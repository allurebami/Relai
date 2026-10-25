# Relai Studio

Relai aide à préparer la diffusion d’un même contenu sur Instagram, TikTok, YouTube, Facebook et LinkedIn.

Cette première version reprend le studio déjà créé : bibliothèque, déclinaisons, workflows, calendrier et exports. Le dépôt contient le code source et les migrations de base de données.

## Technologies

| Partie | Technologie |
| --- | --- |
| Langage | TypeScript |
| Interface | React, CSS et Tailwind CSS |
| Application et routes serveur | Vinext, avec la structure App Router de Next.js |
| Hébergement serveur prévu | Cloudflare Workers |
| Données | Cloudflare D1 / SQLite |
| Médias | Cloudflare R2 |
| Traitement local des médias | Canvas, MediaRecorder |

La V1 utilise Vinext pour exécuter l’application sur Workers. Elle ne se déploie pas telle quelle comme une application Node.js sur Vercel.

## Installation et lancement local

Prérequis : Git et Node.js **22.13 ou plus récent**. Le projet utilise **pnpm 11.25.0**, verrouillé dans `packageManager`.

~~~bash
git clone https://github.com/allurebami/Relai.git
cd Relai
npx pnpm@11.25.0 install --frozen-lockfile
npm run setup
npm run dev
~~~

Ouvrez **http://localhost:5173**.

`setup` compile l’application et applique les migrations à la base locale. Acceptez la confirmation des migrations si Wrangler la demande. Cette opération utilise des ressources locales, sans créer de compte Cloudflare ni de base en production. Les migrations déjà appliquées ne sont pas rejouées.

Pour les lancements suivants :

~~~bash
npm run dev
~~~

Après l’ajout d’une nouvelle migration :

~~~bash
npm run build
npm run db:migrate:local
~~~

Les données locales sont conservées sous `.wrangler/state`. Ce dossier reste hors du dépôt. Le serveur de développement doit rester sur votre ordinateur.

## Ce que vous pouvez utiliser

- Importer des images JPG, PNG ou WebP et des vidéos MP4, WebM ou MOV, jusqu’à **40 Mo**.
- Ajouter un texte ou une idée sans fichier.
- Préparer des déclinaisons par réseau et personnaliser leurs légendes.
- Réutiliser des workflows qui créent les brouillons à l’import.
- Conserver les textes déjà personnalisés sans créer de doublons.
- Adapter les images aux formats carré, vertical et paysage.
- Exporter des extraits vidéo jusqu’à **90 secondes** dans un navigateur compatible.
- Organiser les dates prévues dans un calendrier à l’heure du Cameroun.
- Télécharger les packs ZIP, les légendes, les données JSON et le calendrier ICS.

Les rendus vidéo dépendent du navigateur et prennent environ la durée de l’extrait. Les packs vidéo contiennent l’original ; les extraits adaptés s’exportent individuellement depuis l’éditeur.

## Ce qui reste à développer

Les réseaux sociaux ne sont pas encore connectés. Cette V1 ne publie pas automatiquement et n’importe pas les contenus depuis les réseaux. Les dates du calendrier servent à préparer une diffusion manuelle.

La suite du projet comprendra les connexions officielles aux réseaux, une file de publication en arrière-plan, les reprises sur erreur, les statuts de publication réels et, si nécessaire, le traitement vidéo serveur avec FFmpeg.

La V1 contient un espace de travail partagé privé. La gestion de plusieurs clients ou utilisateurs nécessitera une authentification et des autorisations par espace.

## Accès en production

Le Site privé initial conserve sa propre configuration et reste indépendant de ce dépôt.

Dans la version GitHub, le Worker refuse les requêtes de production tant qu’une passerelle privée n’a pas été configurée. Il renvoie `503` sans configuration et `401` si la preuve d’accès est absente ou invalide.

Une future passerelle doit authentifier le propriétaire, supprimer tout en-tête `x-relai-gateway-token` fourni par le visiteur et injecter son propre secret. Configurez `RELAI_GATEWAY_SECRET` côté serveur, avec au moins 32 caractères aléatoires, et gardez-le hors du code et du navigateur. Le Worker ne doit pas être exposé au public en contournant cette passerelle.

Le schéma de la base et les fichiers sont prêts pour un hébergement Cloudflare, mais les ressources, les secrets et le contrôle d’accès doivent être configurés avant tout déploiement autonome.

## Vérifications

~~~bash
npm run typecheck
npm test
npm run build
~~~

Les tests vérifient les cinq destinations, l’absence de doublons, la préservation des légendes, les limites de texte, les dates UTC, le repli des lignes Unicode du calendrier et le verrouillage des accès de production.

## Structure du projet

| Dossier | Contenu |
| --- | --- |
| `app/` | Écrans et routes API |
| `db/` | Schéma de la base de données |
| `drizzle/` | Migrations versionnées |
| `worker/` | Entrée du Worker et contrôle d’accès |
| `scripts/` | Installation locale, migrations et vérifications |
| `public/` | Ressources statiques |

Aucune clé d’accès aux réseaux sociaux n’est nécessaire pour essayer la préparation et l’export en local.
