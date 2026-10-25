# Activer les comptes sociaux de Relai

Les parcours OAuth sont implémentés pour Instagram, Facebook, YouTube, TikTok et LinkedIn. Ils doivent être configurés avec les applications développeur qui vous appartiennent. Les connexions ne sont pas simulées : aucun compte n’est indiqué comme autorisé avant un échange de code réussi, la lecture du profil auprès du réseau et la sauvegarde chiffrée.

Cette livraison **relie les comptes et vérifie leurs autorisations**. Elle n’implémente pas encore la publication directe ou programmée. Elle demande uniquement les permissions de lecture nécessaires pour identifier les profils, Pages et chaînes. Les droits de publication seront demandés quand le service d’envoi sera implémenté.

## 1. Fixer l’adresse de production

Dans le projet Vercel relié à `allurebami/Relai`, relever le domaine stable de production. Définir `RELAI_APP_URL` avec cette adresse HTTPS, sans chemin ni paramètre, par exemple `https://votre-domaine.example`. Utiliser votre domaine réel : l’exemple n’est pas une adresse de Relai.

Enregistrer les URL de retour ci-dessous à l’identique, avec ce domaine. Une URL de déploiement temporaire ou un domaine de Preview peut provoquer un refus du réseau. Les opérations de gestion sont volontairement limitées à l’origine définie par `RELAI_APP_URL`.

## 2. Installer le stockage sécurisé

Depuis Vercel Marketplace, installer **Upstash Redis** et l’attacher au projet Relai en Production. Choisir une offre et une région adaptées ; vérifier les conditions affichées avant validation.

Les variables serveur attendues sont `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`. Le jeton doit permettre l’écriture. Les alias `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont également acceptés si l’intégration les fournit. Aucun jeton de stockage n’est exposé au navigateur. Le client REST utilise `fetch` sans dépendance supplémentaire.

Ne pas utiliser un stockage éphémère pour les connexions réelles. Sans stockage configuré, les API de connexion restent désactivées et la préparation locale du studio continue de fonctionner.

## 3. Créer l’accès administrateur et la clé de chiffrement

Avec Node.js 24, dans le dépôt :

```bash
node scripts/create-social-secrets.mjs
```

Le script crée deux fichiers privés exclus de Git, sans afficher leurs secrets dans le terminal :

- `.env.social.local` contient `RELAI_TOKEN_ENCRYPTION_KEY` et `RELAI_ADMIN_PASSWORD_HASH` à ajouter aux variables serveur de Vercel en Production.
- `.relai-admin-password` contient le mot de passe à conserver dans votre gestionnaire de mots de passe. Il ouvre la rubrique Connexions de Relai ; ce n’est pas un mot de passe social.

Le script refuse d’écraser des fichiers existants. Ne pas publier ces fichiers, ne pas les ajouter au dépôt et ne pas coller leurs secrets dans un message ou une capture d’écran. Conserver une copie sûre de la clé AES : la remplacer rend les connexions précédemment chiffrées illisibles. Une rotation nécessite une migration ou le retrait préalable des connexions.

Les sessions administrateur durent 12 heures et sont révocables par déconnexion. Changer `RELAI_ADMIN_PASSWORD_HASH` invalide toutes les anciennes sessions. Les connexions sont communes à cet espace administrateur et accessibles depuis un autre appareil après identification ; les fichiers et brouillons restent locaux. Cette version n’est pas un système de comptes clients ou de droits par équipe.

## 4. Enregistrer les applications développeur

Remplacer `<origine>` par la valeur réelle de `RELAI_APP_URL`.

| Réseau | Configuration serveur | URL de retour | Permissions actuelles |
| --- | --- | --- | --- |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | `<origine>/api/social/callback/instagram` | `instagram_business_basic` |
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | `<origine>/api/social/callback/facebook` | `pages_show_list` |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `<origine>/api/social/callback/youtube` | `https://www.googleapis.com/auth/youtube.readonly` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `<origine>/api/social/callback/tiktok` | `user.info.basic` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `<origine>/api/social/callback/linkedin` | `openid profile` |

Chaque réseau est configurable séparément. Aucune de ces variables ne doit commencer par `NEXT_PUBLIC_`. Ajouter les variables en Production puis redéployer le projet pour les appliquer. Le fichier `.env.example` liste les noms attendus sans contenir de secret.

- **Instagram** : [Meta for Developers](https://developers.facebook.com/apps/), Instagram API avec Instagram Login. Utiliser l’App ID et le secret Instagram indiqués pour ce produit. Compte professionnel ou créateur requis ; pas de prise en charge des comptes personnels. L’intégration utilise la famille `instagram_business_*` et `graph.instagram.com`, indépendamment de Facebook.
- **Facebook** : [Meta for Developers](https://developers.facebook.com/apps/), configurer Facebook Login et la permission `pages_show_list`. Relai retrouve les Pages autorisées avec `/me/accounts`, y compris la pagination. Le fil personnel d’un profil Facebook n’est pas une destination prise en charge. La version Graph utilisée est `v25.0`.
- **YouTube** : [Google Cloud](https://console.cloud.google.com/apis/credentials), activer YouTube Data API v3, créer un client OAuth Application Web et configurer l’écran de consentement. Ajouter les utilisateurs de test tant que l’application est en test. Le mode Test de Google peut limiter la durée du refresh token. Relai identifie les chaînes autorisées avec `channels.list(mine=true)`. Une connexion ne donne pas accès à toutes les chaînes de marque : choisir la bonne identité dans le parcours Google.
- **TikTok** : [TikTok for Developers](https://developers.tiktok.com/apps/), activer Login Kit Web et `user.info.basic`, puis enregistrer l’URL HTTPS exacte. Utiliser les comptes autorisés dans le sandbox ou faire approuver l’application pour la production.
- **LinkedIn** : [LinkedIn Developers](https://www.linkedin.com/developers/apps), demander le produit Sign In with LinkedIn using OpenID Connect. Cette version relie un profil personnel ; elle ne gère pas les organisations. Les refresh tokens LinkedIn ne sont pas disponibles à toutes les applications : Relai demande une reconnexion après expiration.

Les validations, modes de test, vérifications d’entreprise et permissions disponibles sont déterminés par chaque plateforme. Les identifiants seuls ne garantissent pas l’approbation de l’application. Configurer les URL de confidentialité `<origine>/privacy`, de conditions `<origine>/terms` et de suppression `<origine>/data-deletion` dans les consoles concernées. Ces pages décrivent le comportement de cette version ; l’administrateur doit les adapter à l’identité et au contact réels de son service avant ouverture à des clients.

## 5. Autoriser vos comptes dans Relai

1. Ouvrir la rubrique **Connexions** sur le domaine de production.
2. Vérifier les quatre indicateurs de configuration et ouvrir l’espace avec le mot de passe administrateur Relai.
3. Cliquer **Connecter** sur un réseau configuré, choisir le compte et accepter les permissions dans l’interface officielle du réseau.
4. Au retour, Relai affiche les noms réels reçus du réseau. Une autorisation annulée, expirée ou sans compte accessible ne crée pas de connexion.
5. Utiliser **Vérifier la connexion** pour contrôler l’accès. Les jetons YouTube et TikTok sont renouvelés si nécessaire ; les nouveaux refresh tokens TikTok sont conservés. Instagram est renouvelé lorsque son jeton est éligible et proche de l’expiration. Sans renouvellement disponible, Relai indique qu’une reconnexion est nécessaire.

Une autorisation est conservée par réseau : reconnecter remplace l’autorisation précédente de ce réseau et les comptes associés. Facebook peut renvoyer plusieurs Pages pour cette autorisation. Les mots de passe et jetons des réseaux ne sont jamais demandés dans le formulaire Relai.

**Retirer de Relai** supprime les informations et jetons de ce réseau dans le stockage actif. Cette action n’affirme pas révoquer l’autorisation chez le réseau : le lien **Gérer l’autorisation** ouvre les réglages officiels pour la retirer également. Supprimer une connexion ne supprime pas les brouillons locaux.

## Vérifications et limites

```bash
npm test
npm run typecheck
npm run build
```

Les tests OAuth interceptent uniquement les appels sortants avec des réponses contractuelles de test ; ils couvrent les parcours de code, la liaison à la session, l’unicité de l’état, les refus, le renouvellement, le chiffrement, l’isolation de l’accès administrateur et la suppression. Ils ne prouvent pas l’approbation des applications ni un consentement réel. Une vérification réelle par réseau devra être effectuée avec ses identifiants développeur et votre consentement.

L’application ne journalise pas les corps des réponses OAuth ni les secrets. Préserver cette règle dans les outils d’observabilité. Les renouvellements se font à la demande lors d’une vérification : aucun job de renouvellement ni envoi planifié n’est encore installé.

## Références officielles

- [Instagram Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Facebook Login côté serveur](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- [OAuth Google côté serveur](https://developers.google.com/identity/protocols/oauth2/web-server)
- [TikTok Login Kit Web](https://developers.tiktok.com/docs/en/login-kit-web)
- [TikTok : cycle de vie des jetons](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
- [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Upstash Redis REST](https://upstash.com/docs/redis/features/restapi)
