# Links Bénévoles — preview (maquette uniquement)

**Aucune implémentation** : pas de migration, pas de table, aucun fichier de l'appli modifié. Tout est dans ce dossier, avec des données fictives en dur.

## Ouvrir la maquette
- Double-clic sur `linkers-preview.html` (fichier unique, fonctionne hors ligne ; seules les polices Google demandent internet).
- Ou : `node mockups/links-benevoles/serve.mjs` puis http://localhost:5599 (les fichiers `index.html`, `characters.js`, `app.js` sont les sources).

## Ce qu'on y trouve
- Espace Linker en format téléphone, 12 écrans : présentation, inscription + choix du personnage, profil (rayon + typologie en direct), accueil, notification push, carte + liste des Links, fiche d'un Link, mission, récompense (choix du style), évolution animée, garde-robe, boutique.
- Côté partenaire (formulaire avec conditions + notifications) et côté responsable d'antenne (onglet « Links Bénévoles »).
- Panneau « mode dev » : saut au level 1/10/20/30/40/50, changement de personnage/style/mode de déplacement, un autre Linker prend un Link, évolution à chaque palier.
- « Vitrine » : les 4 personnages × 6 stades avec tenue, et les 3 styles × 10 catégories × 5 versions.
- Périmètre : Fraise, Banane, Carotte, Tomate ; Cowboy, Chef, Magicien. Les 16 autres personnages et 7 autres styles sont en silhouette « ? » / verrouillés.

## Typologies proposées
À pied / vélo (1 typologie par km) : 1 Petit marcheur · 2 Marcheur · 3 Grand marcheur · 4 Randonneur · 5 Cycliste du dimanche · 6 Cycliste · 7 Grand cycliste · 8 Coursier · 9 Pédaleur fou · 10 Tour de France.
Voiture (tranches de 10 km) : ≤10 Drive · ≤20 Super Driver · ≤30 Roi de la route · ≤40 Pilote de rallye · ≤50 Fou du volant.

## Choix de design
- Style kawaii et joyeux : gros yeux et joues rondes au stade bébé (qui rapetissent en grandissant), couleurs de plus en plus vives, reflet à partir de « adulte », étincelles au stade « géant », aura + rayons animés au stade « légendaire ».
- Personnage et accessoires sont dessinés dans le même repère avec des points d'ancrage (tête, yeux, cou, taille, pieds, mains) : les vêtements sont découpés sur la forme du corps, donc ils s'adaptent à chaque fruit ou légume et à chaque stade.
- Les 5 versions d'un accessoire suivent la même progression dans les trois styles : simple → renforcé → de qualité → d'élite → doré (avec étincelles).
- Tenue complète (10 catégories, même style) : aura + fond thématique (désert, cuisine, nuit étoilée).
- Onboarding en 3 cartes : principe (25 kg / 80 kg, magasin → asso), 4 étapes, puis ajout à l'écran d'accueil (avec l'avertissement iPhone).
- Carte dessinée à la main dans la maquette ; l'appli utilisera Leaflet + OpenStreetMap.

## Points flous ou risqués du brief
1. **1 Link = 1 level, mais une fiche Link affiche de l'« XP à gagner ».** J'ai supposé 100 XP = 1 level, la jauge se remplissant par étapes (accepté, collecté, livré). À confirmer, ou supprimer la notion d'XP.
2. **Un level par Link, jusqu'au level 50 = 50 Links livrés.** Un Linker très actif aurait fini le jeu en quelques semaines ; prévoir une suite après le 50 (prestiges, saisons) ou un rythme plus lent.
3. **Accessoire d'évolution exclusif aux paliers 10/20/30/40/50** : il s'ajoute à l'accessoire du level. Il faut décider ce qu'il est (cape, aura, autre) et où il se range dans les 10 catégories.
4. **Évolution des accessoires** : un accessoire garde la version du stade où il a été gagné. Quand le personnage évolue, ses anciens accessoires restent-ils en version 1 ? Autre option : les faire évoluer avec le personnage.
5. **500 accessoires et 120 stades de personnages à dessiner.** Prévoir un générateur (comme cette maquette) ou un illustrateur : c'est le gros poste de travail.
6. **Notifications push sur iPhone** : uniquement pour une PWA installée sur l'écran d'accueil (iOS 16.4+), et l'utilisateur doit accepter. D'où l'écran d'onboarding ; le taux d'activation sera à surveiller.
7. **Premier arrivé, premier servi + appel obligatoire à l'asso** : risque de Link « réservé mais jamais livré ». Prévoir un délai d'expiration, une annulation par le Linker et une remise en circulation automatique.
8. **Confiance et sécurité** : ce sont des particuliers qui portent des produits alimentaires. À cadrer : chaîne du froid, responsabilité en cas de problème, données personnelles (le partenaire ne voit que prénom, personnage et niveau), et anti-triche (distance réelle, poids déclaré).
9. **Poids réel saisi à la livraison** : déclaratif. Prévoir des seuils d'alerte (poids très supérieur à la limite 25/80 kg) et une validation par l'asso ou le partenaire.
10. **Matching** : « association ouverte la plus proche » dépend des horaires des fiches Bénéficiaires, aujourd'hui en texte libre. Il faudra des horaires structurés jour par jour, ainsi que la capacité et les denrées acceptées par l'asso.
11. **Position** : sans suivi en arrière-plan en V1, les Links proches sont calculés à l'ouverture de l'app ; les notifications push se basent donc sur l'adresse de référence tant que l'app est fermée.
12. **Temps réel + tier gratuit** : Supabase Realtime a des limites de connexions simultanées ; OK au démarrage à Lyon, à surveiller.
13. **Capacitor plutôt qu'Expo/React Native** : je confirme Capacitor. La webapp Next.js est déjà écrite ; Capacitor l'emballe et donne push natif, géoloc en arrière-plan et les stores. Expo/React Native serait plus fluide pour de grosses animations natives, mais obligerait à réécrire toute l'interface. Point d'attention : l'espace Linker doit rester 100 % client (export statique), sans dépendre des routes serveur de Next.js.
14. **Feature flag et données de démo (`is_demo`)** : à prévoir dans chaque table du module, avec des policies RLS qui l'appliquent côté serveur, et des fonctions de nettoyage qui ne touchent jamais aux données réelles.
15. **Doublons de rôles** : le Linker est un compte distinct des rôles existants. Il faut décider s'il peut aussi être partenaire ou bénéficiaire (a priori non).
