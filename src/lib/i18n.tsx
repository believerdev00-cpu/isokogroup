import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type Lang = "en" | "rw" | "sw" | "fr" | "zh";

export const LANGS: Lang[] = ["en", "rw", "sw", "fr", "zh"];

/** Each language in its own name, for the selector */
export const LANG_NAMES: Record<Lang, string> = { en: "English", rw: "Kinyarwanda", sw: "Kiswahili", fr: "Français", zh: "中文" };

/** Where the chosen language is kept between visits */
export const LANG_STORAGE_KEY = "isoko-lang";

export const translations: Record<string, Partial<Record<Lang, string>>> = {
  // Nav
  "nav.home": { en: "Home", rw: "Ahabanza", sw: "Nyumbani", fr: "Accueil", zh: "首页" },
  "nav.logistics": { en: "Logistics", rw: "Gutwara ibintu", sw: "Usafirishaji", fr: "Logistique", zh: "物流" },
  "nav.packaging": { en: "Packaging", rw: "Gupakira", sw: "Ufungaji", fr: "Emballage", zh: "包装" },
  "nav.marketplace": { en: "Marketplace", rw: "Isoko", sw: "Soko", fr: "Marché", zh: "市场" },
  "nav.elibrary": { en: "E-Library", rw: "Ibitabo", sw: "Maktaba ya Mtandaoni", fr: "Bibliothèque", zh: "电子图书馆" },
  "nav.entertainment": { en: "Entertainment", rw: "Imyidagaduro", sw: "Burudani", fr: "Divertissement", zh: "娱乐" },
  "nav.becomeSeller": { en: "Become a Seller", rw: "Ba Umucuruzi", sw: "Kuwa Muuzaji", fr: "Devenir vendeur", zh: "成为卖家" },
  "nav.login": { en: "Login / Register", rw: "Injira / Iyandikishe", sw: "Ingia / Jisajili", fr: "Se connecter / S'inscrire", zh: "登录 / 注册" },
  "nav.logout": { en: "Logout", rw: "Sohoka", sw: "Toka", fr: "Se déconnecter", zh: "登出" },
  "nav.admin": { en: "Admin", rw: "Ubuyobozi", sw: "Msimamizi", fr: "Admin", zh: "管理" },
  "nav.software": { en: "Software", rw: "Software", sw: "Programu", fr: "Logiciels", zh: "软件" },
  "nav.trainingCenter": { en: "Training Center", rw: "Ikigo cy'Amahugurwa", sw: "Kituo cha Mafunzo", fr: "Centre de formation", zh: "培训中心" },
  "nav.about": { en: "About", rw: "Ibyerekeye", sw: "Kuhusu", fr: "À propos", zh: "关于" },
  "nav.track": { en: "Track", rw: "Kurikirana", sw: "Fuatilia", fr: "Suivi", zh: "追踪" },
  "nav.account": { en: "Account", rw: "Konti", sw: "Akaunti", fr: "Compte", zh: "账户" },
  "nav.search": { en: "Search services", rw: "Shakisha serivisi", sw: "Tafuta huduma", fr: "Rechercher un service", zh: "搜索服务" },
  "nav.services": { en: "Services", rw: "Serivisi", sw: "Huduma", fr: "Services", zh: "服务" },
  "nav.workspace": { en: "Workspace", rw: "Aho gukorera", sw: "Eneo la kazi", fr: "Espace de travail", zh: "工作区" },
  "nav.travel": { en: "Travel Agency", rw: "Ikigo cy'ingendo", sw: "Wakala wa Usafiri", fr: "Agence de voyage", zh: "旅行社" },
  "nav.consultancy": { en: "Consultancy", rw: "Ubujyanama", sw: "Ushauri", fr: "Conseil", zh: "咨询" },
  "nav.dataAnalysis": { en: "Data Analysis", rw: "Isesengura ry'amakuru", sw: "Uchambuzi wa Data", fr: "Analyse de données", zh: "数据分析" },
  "nav.dashboard": { en: "Dashboard", rw: "Ikarita", sw: "Dashibodi", fr: "Tableau de bord", zh: "仪表盘" },
  "nav.insights": { en: "Insights", rw: "Ibyiyumvo", sw: "Uchambuzi", fr: "Aperçus", zh: "洞察" },
  "nav.orders": { en: "Orders", rw: "Amabwiriza", sw: "Maagizo", fr: "Commandes", zh: "订单" },
  "nav.seller": { en: "Seller", rw: "Umucuruzi", sw: "Muuzaji", fr: "Vendeur", zh: "卖家" },
  "nav.plan": { en: "Plan", rw: "Gahunda", sw: "Mpango", fr: "Forfait", zh: "计划" },
  "nav.myOrders": { en: "My Orders", rw: "Amabwiriza yanjye", sw: "Maagizo yangu", fr: "Mes commandes", zh: "我的订单" },
  "nav.subscription": { en: "Subscription", rw: "Iyandikishe", sw: "Usajili", fr: "Abonnement", zh: "订阅" },
  "nav.register": { en: "Register", rw: "Iyandikishe", sw: "Jisajili", fr: "S'inscrire", zh: "注册" },
  "nav.signIn": { en: "Sign in", rw: "Injira", sw: "Ingia", fr: "Se connecter", zh: "登录" },
  "nav.language": { en: "Language", rw: "Ururimi", sw: "Lugha", fr: "Langue", zh: "语言" },
  "nav.theme": { en: "Theme", rw: "Isura", sw: "Mandhari", fr: "Thème", zh: "主题" },
  "nav.serviceHub": { en: "Service Hub", rw: "Serivisi zose", sw: "Kituo cha Huduma", fr: "Hub des services", zh: "服务中心" },
  "nav.openServiceHub": { en: "Open the Service Hub", rw: "Fungura serivisi zose", sw: "Fungua Kituo cha Huduma", fr: "Ouvrir le hub des services", zh: "打开服务中心" },
  "nav.sellerAgreement": { en: "Seller Agreement", rw: "Amasezerano y'Umucuruzi", sw: "Mkataba wa Muuzaji", fr: "Contrat vendeur", zh: "卖家协议" },
  "nav.fashionHub": { en: "Isoko Fashion Hub", rw: "Isoko Fashion Hub", sw: "Isoko Fashion Hub", fr: "Isoko Fashion Hub", zh: "Isoko 时尚中心" },

  // Hero
  "home.title": { en: "Deliveries across Africa and the world, handled end to end.", rw: "Kohereza ibintu muri Afurika no ku isi hose, tubyitaho kuva bitangiye kugeza birangiye.", sw: "Usafirishaji kote Afrika na duniani, tunashughulikia kila hatua.", fr: "Des livraisons à travers l'Afrique et le monde, prises en charge de bout en bout.", zh: "覆盖非洲及全球的配送，全程为您负责。" },
  "home.subtitle": { en: "Pickup, packaging and delivery with live tracking. And when you need more, every other Isoko service is one search away.", rw: "Gufata, gupakira no kugeza ibintu, ukurikirana aho bigeze. N'izindi serivisi zose za Isoko uzibona ushakishije rimwe.", sw: "Kuchukua, kufunga na kufikisha mizigo kwa ufuatiliaji wa moja kwa moja. Huduma nyingine zote za Isoko ziko karibu kwa utafutaji mmoja.", fr: "Enlèvement, emballage et livraison avec suivi en direct. Et tous les autres services Isoko sont à une recherche près.", zh: "取件、包装与配送，实时追踪。需要更多？Isoko 的所有服务一搜即得。" },
  "home.requestDelivery": { en: "Request a delivery", rw: "Saba koherezwa", sw: "Omba usafirishaji", fr: "Demander une livraison", zh: "预约配送" },
  "home.track": { en: "Track a shipment", rw: "Kurikirana ibyoherejwe", sw: "Fuatilia mzigo", fr: "Suivre un colis", zh: "追踪包裹" },
  "home.explore": { en: "Explore Isoko services", rw: "Menya serivisi za Isoko", sw: "Gundua huduma za Isoko", fr: "Découvrir les services Isoko", zh: "探索 Isoko 服务" },
  "home.exploreSub": { en: "Grouped so you find what you need in seconds.", rw: "Zishyize mu byiciro kugira ngo ubone icyo ukeneye vuba.", sw: "Zimepangwa ili upate unachohitaji kwa sekunde.", fr: "Classés pour trouver ce qu'il vous faut en quelques secondes.", zh: "分类清晰，几秒即可找到所需服务。" },
  "home.allServices": { en: "All services", rw: "Serivisi zose", sw: "Huduma zote", fr: "Tous les services", zh: "全部服务" },
  "hero.badge": { en: "Welcome to ISOKO GROUP", rw: "Murakaza neza kuri ISOKO GROUP", sw: "Karibu ISOKO GROUP", fr: "Bienvenue chez ISOKO GROUP", zh: "欢迎来到ISOKO集团" },
  "hero.title1": { en: "All-in-One Platform for", rw: "Urubuga rwanyu rw'ibintu byose ku", sw: "Jukwaa lako la kila kitu kwa", fr: "Plateforme tout-en-un pour", zh: "一站式平台" },
  "hero.logistics": { en: "Logistics", rw: "Gutwara", sw: "Usafirishaji", fr: "Logistique", zh: "物流" },
  "hero.marketplace": { en: "Marketplace", rw: "Isoko", sw: "Soko", fr: "Marché", zh: "市场" },
  "hero.knowledge": { en: "Knowledge", rw: "Ubumenyi", sw: "Maarifa", fr: "Connaissance", zh: "知识" },
  "hero.subtitle": { en: "ISOKO GROUP brings together six trusted services — logistics, packaging, marketplace, e-library, entertainment, and ISOKO Training Center — in one smart and connected ecosystem. We create practical solutions that make it easier for people and businesses to connect, learn, trade, create, and grow in a rapidly changing world.", rw: "Kuva ku gutwara no gupakira kugeza ku isoko, ibitabo, imyidagaduro na software — ISOKO GROUP ihuza serivisi esheshatu zizewe kugira ngo Abanyarwanda babeho, bige kandi bakore neza.", sw: "Kutoka usafirishaji na ufungaji hadi soko, maktaba ya mtandaoni, burudani na programu — ISOKO GROUP inaunganisha huduma sita zinazotegemewa kusaidia Wanyarwanda kuishi, kujifunza na kufanya biashara vizuri zaidi.", fr: "De la logistique et l'emballage à un marché, une bibliothèque en ligne, des divertissements et un logiciel — ISOKO GROUP réunit six services fiables pour aider les Rwandais à mieux vivre, apprendre et faire des affaires.", zh: "从物流和包装到市场、电子图书馆、娱乐和软件 — ISOKO GROUP 汇聚六项值得信赖的服务，帮助卢旺达人更好地生活、学习和经商。" },
  "hero.getStarted": { en: "Get Started", rw: "Tangira", sw: "Anza", fr: "Commencer", zh: "开始" },
  "hero.browseMarketplace": { en: "Browse Marketplace", rw: "Reba Isoko", sw: "Tafuta Soko", fr: "Parcourir le marché", zh: "浏览市场" },
  "hero.fastDelivery": { en: "Fast delivery", rw: "Kohereza byihuse", sw: "Usafirishaji wa haraka", fr: "Livraison rapide", zh: "快速送达" },
  "hero.securePacking": { en: "Secure packing", rw: "Gupakira neza", sw: "Ufungaji salama", fr: "Emballage sécurisé", zh: "安全包装" },
  "hero.buySell": { en: "Buy & sell", rw: "Gura & Gucuruza", sw: "Nunua & uze", fr: "Acheter & vendre", zh: "买卖" },
  "hero.discover": { en: "Discover more", rw: "Menya byinshi", sw: "Gundua zaidi", fr: "En savoir plus", zh: "了解更多" },
  "hero.readOnline": { en: "Read online", rw: "Soma kuri interineti", sw: "Soma mtandaoni", fr: "Lire en ligne", zh: "在线阅读" },

  // Services
  "services.title": { en: "Everything You Need in One Place", rw: "Ibyo Ukeneye Byose Ahantu Hamwe", sw: "Kila unachohitaji mahali pamoja", fr: "Tout ce dont vous avez besoin en un seul endroit", zh: "所需一切，一站实现" },
  "services.subtitle": { en: "From logistics to digital learning, ISOKO GROUP delivers comprehensive solutions tailored to your needs.", rw: "Kuva ku gutwara ibintu kugeza ku kwiga kuri interineti, ISOKO GROUP itanga ibisubizo byuzuye bikwiye ibyo ukeneye.", sw: "Kuanzia usafirishaji hadi kujifunza kidijitali, ISOKO GROUP inatoa suluhisho kamili kulingana na mahitaji yako.", fr: "De la logistique à l'apprentissage numérique, ISOKO GROUP propose des solutions complètes adaptées à vos besoins.", zh: "从物流到数字学习，ISOKO GROUP 提供量身定制的综合解决方案。" },
  "services.learnMore": { en: "Learn more", rw: "Menya byinshi", sw: "Jifunze zaidi", fr: "En savoir plus", zh: "了解更多" },
  "services.ourServices": { en: "Our Services", rw: "Serivisi Zacu", sw: "Huduma Zetu", fr: "Nos services", zh: "我们的服务" },
  "services.softwareTitle": { en: "Software", rw: "Software", sw: "Programu", fr: "Logiciels", zh: "软件" },
  "services.softwareDesc": { en: "Custom websites, mobile apps and tech classes by Isoko Studioz.", rw: "Imbuga zahari, porogaramu za telefoni na amasomo ya tekinike bya Isoko Studioz.", sw: "Tovuti za kawaida, programu za simu na madarasa ya teknolojia na Isoko Studioz.", fr: "Sites web personnalisés, applications mobiles et cours tech par Isoko Studioz.", zh: "Isoko Studioz 提供定制网站、移动应用和技术课程。" },
  "services.sourcingTitle": { en: "Sourcing & Procurement", rw: "Gushaka no Kugura", sw: "Ununuzi & Ugavi", fr: "Approvisionnement", zh: "采购与供应" },
  "services.sourcingDesc": { en: "We source goods locally and internationally on your behalf.", rw: "Turashaka ibicuruzwa imbere mu gihugu no mu mahanga ku nyungu zawe.", sw: "Tunapata bidhaa ndani na nje ya nchi kwa niaba yako.", fr: "Nous achetons des produits localement et à l'international pour vous.", zh: "我们代表您在国内外采购商品。" },
  "services.supplyChainTitle": { en: "Supply Chain", rw: "Umuyoboro w'Ububiko", sw: "Ugavi na Ugavi", fr: "Chaîne d'approvisionnement", zh: "供应链" },
  "services.supplyChainDesc": { en: "End-to-end shipments with customs, taxes and live tracking.", rw: "Gutwara ibintu kuva aho byaturutse kugeza aho bijya, n'ubugenzuzi, imisoro n'uburyo bwo gukurikirana.", sw: "Usafirishaji wa mwisho hadi mwisho pamoja na ada za forodha, kodi na ufuatiliaji wa moja kwa moja.", fr: "Expéditions de bout en bout avec douanes, taxes et suivi en direct.", zh: "端到端运输，含清关、税费和实时跟踪。" },
  "services.softwareBookingTitle": { en: "Software Booking", rw: "Gutanga Icyifuzo cya Software", sw: "Uhifadhi wa Programu", fr: "Réservation de logiciel", zh: "软件预订" },
  "services.softwareBookingDesc": { en: "Book a session with our developers for your next project.", rw: "Tegereza inama n'abatekinisiye bacu ku mushinga wawe utaha.", sw: "Weka kikao na watengenezaji wetu kwa mradi wako ujao.", fr: "Réservez une session avec nos développeurs pour votre prochain projet.", zh: "为您的下一个项目预订我们的开发人员会议。" },
  "services.trainingTitle": { en: "Isoko Training Center", rw: "Ikigo cy'Amahugurwa cya Isoko", sw: "Kituo cha Mafunzo cha Isoko", fr: "Centre de formation Isoko", zh: "ISOKO 培训中心" },
  "services.trainingDesc": { en: "Practical programs in coding, design and digital skills, with Isoko certificates.", rw: "Amasomo ngiro yo gutunganya porogaramu, igishushanyo n'ubumenyi bw'ikoranabuhanga, ahabwa impamyabumenyi za Isoko.", sw: "Programu za vitendo za uandishi wa programu, muundo na ujuzi wa kidijitali, pamoja na vyeti vya Isoko.", fr: "Des programmes pratiques en codage, design et compétences numériques, avec certificat Isoko.", zh: "编程、设计和数字技能实践课程，颁发 ISOKO 证书。" },

  // Logistics
  "logistics.title": { en: "Reliable Delivery Services", rw: "Serivisi z'Ikohereza Zizewe", sw: "Huduma za Usafirishaji Zinazotegemewa", fr: "Des services de livraison fiables", zh: "可靠的配送服务" },
  "logistics.subtitle": { en: "Fast, secure, and trackable logistics across Africa and the world.", rw: "Gutwara byihuse, byizewe, kandi bishobora gukurikiranwa muri Afurika no ku isi hose.", sw: "Usafirishaji wa haraka, salama na unaofuatiliwa kote Afrika na duniani.", fr: "Une logistique rapide, sûre et traçable à travers l'Afrique et le monde.", zh: "覆盖非洲及全球的快速、安全、可追踪的物流。" },
  "logistics.requestDelivery": { en: "Request Delivery", rw: "Saba Ikohereza", sw: "Omba Usafirishaji", fr: "Demander une livraison", zh: "预约配送" },
  "logistics.realTimeTracking": { en: "Real-time Tracking", rw: "Gukurikirana mu gihe nyacyo", sw: "Ufuatiliaji wa Moja kwa Moja", fr: "Suivi en temps réel", zh: "实时追踪" },
  "logistics.pricingCalculator": { en: "Pricing Calculator", rw: "Kubara Igiciro", sw: "Kikokotoo cha Bei", fr: "Calculateur de prix", zh: "价格计算器" },
  "logistics.orderHistory": { en: "Order History", rw: "Amateka y'Ibyo Wakoze", sw: "Historia ya Maagizo", fr: "Historique des commandes", zh: "订单历史" },
  "logistics.submitRequest": { en: "Submit Request", rw: "Ohereza Icyifuzo", sw: "Tuma Ombi", fr: "Envoyer la demande", zh: "提交请求" },
  "logistics.requestTitle": { en: "Request a Delivery", rw: "Saba Ikohereza", sw: "Omba Usafirishaji", fr: "Demander une livraison", zh: "预约配送" },
  "logistics.pickup": { en: "Pickup Location", rw: "Aho Gufata", sw: "Mahali pa Kuchukua", fr: "Lieu d'enlèvement", zh: "取件地点" },
  "logistics.dropoff": { en: "Drop-off Location", rw: "Aho Gushyira", sw: "Mahali pa Kufikisha", fr: "Lieu de livraison", zh: "送达地点" },
  "logistics.weight": { en: "Weight (kg)", rw: "Uburemere (kg)", sw: "Uzito (kg)", fr: "Poids (kg)", zh: "重量（公斤）" },
  "logistics.date": { en: "Preferred Date", rw: "Itariki Ushaka", sw: "Tarehe Unayopendelea", fr: "Date souhaitée", zh: "期望日期" },

  // Packaging
  "packaging.title": { en: "Professional Packaging Solutions", rw: "Ibisubizo by'Ubwenge byo Gupakira", sw: "Suluhisho za Ufungaji wa Kitaalamu", fr: "Des solutions d'emballage professionnelles", zh: "专业包装解决方案" },
  "packaging.subtitle": { en: "Secure and reliable packaging for all your needs.", rw: "Gupakira byizewe ku byo ukeneye byose.", sw: "Ufungaji salama na wa kuaminika kwa mahitaji yako yote.", fr: "Un emballage sûr et fiable pour tous vos besoins.", zh: "安全可靠的包装，满足您的所有需求。" },
  "packaging.requestTitle": { en: "Request Packaging", rw: "Saba Gupakira", sw: "Omba Ufungaji", fr: "Demander un emballage", zh: "申请包装" },
  "packaging.itemDesc": { en: "Item Description", rw: "Ibisobanuro by'Igicuruzwa", sw: "Maelezo ya Bidhaa", fr: "Description de l'article", zh: "物品描述" },
  "packaging.quantity": { en: "Quantity", rw: "Umubare", sw: "Idadi", fr: "Quantité", zh: "数量" },
  "packaging.pickupDate": { en: "Pickup Date", rw: "Itariki yo Gufata", sw: "Tarehe ya Kuchukua", fr: "Date d'enlèvement", zh: "取件日期" },
  "packaging.submit": { en: "Submit Request", rw: "Ohereza Icyifuzo", sw: "Tuma Ombi", fr: "Envoyer la demande", zh: "提交请求" },

  // Marketplace
  "marketplace.title": { en: "Shop the Best Products", rw: "Gura Ibicuruzwa Byiza", sw: "Nunua Bidhaa Bora", fr: "Achetez les meilleurs produits", zh: "选购优质商品" },
  "marketplace.search": { en: "Search products...", rw: "Shakisha ibicuruzwa...", sw: "Tafuta bidhaa...", fr: "Rechercher des produits...", zh: "搜索商品..." },
  "marketplace.filters": { en: "Filters", rw: "Guhitamo", sw: "Vichujio", fr: "Filtres", zh: "筛选" },
  "marketplace.addToCart": { en: "Add to Cart", rw: "Shyira mu Gatebo", sw: "Weka kwenye Kikapu", fr: "Ajouter au panier", zh: "加入购物车" },

  // E-Library
  "elibrary.title": { en: "Read & Learn Online", rw: "Soma & Wige kuri Interineti", sw: "Soma na Ujifunze Mtandaoni", fr: "Lire et apprendre en ligne", zh: "在线阅读与学习" },
  "elibrary.subtitle": { en: "Browse our collection of books and read them directly in your browser — no downloads needed.", rw: "Reba itsinda ry'ibitabo byacu ubisome mu buryo butaziguye — nta gukurura bisabwa.", sw: "Vinjari mkusanyiko wetu wa vitabu na uvisome moja kwa moja kwenye kivinjari chako — hakuna kupakua.", fr: "Parcourez notre collection de livres et lisez-les directement dans votre navigateur, sans téléchargement.", zh: "浏览我们的图书馆藏，直接在浏览器中阅读，无需下载。" },
  "elibrary.search": { en: "Search books by title or author...", rw: "Shakisha ibitabo ku izina cyangwa umwanditsi...", sw: "Tafuta vitabu kwa jina au mwandishi...", fr: "Rechercher un livre par titre ou auteur...", zh: "按书名或作者搜索图书..." },
  "elibrary.readNow": { en: "Read Now", rw: "Soma Nonaha", sw: "Soma Sasa", fr: "Lire maintenant", zh: "立即阅读" },
  "elibrary.pages": { en: "pages", rw: "impapuro", sw: "kurasa", fr: "pages", zh: "页" },

  // Featured
  "featured.products": { en: "Featured Products", rw: "Ibicuruzwa Byihariye", sw: "Bidhaa Maalum", fr: "Produits en vedette", zh: "精选商品" },
  "featured.books": { en: "Featured Books", rw: "Ibitabo Byihariye", sw: "Vitabu Maalum", fr: "Livres en vedette", zh: "精选图书" },
  "featured.viewAll": { en: "View all", rw: "Reba byose", sw: "Tazama vyote", fr: "Voir tout", zh: "查看全部" },
  "featured.browseLibrary": { en: "Browse library", rw: "Reba ibitabo", sw: "Vinjari maktaba", fr: "Parcourir la bibliothèque", zh: "浏览图书馆" },

  // CTA
  "cta.joinToday": { en: "Join Today", rw: "Iyandikishe Uyu Munsi", sw: "Jiunge Leo", fr: "Rejoignez-nous aujourd'hui", zh: "立即加入" },
  "cta.title": { en: "Start for Just", rw: "Tangira ku", sw: "Anza kwa", fr: "Commencez pour seulement", zh: "起步价仅" },
  "cta.subtitle": { en: "Try every ISOKO GROUP service free for 10 minutes, then 50 RWF for 7 days or 200 RWF for a month. Sellers: 1,500 RWF a month. Pay with Mobile Money.", rw: "Gerageza serivisi zose za ISOKO GROUP ku buntu mu minota 10, hanyuma 50 RWF ku minsi 7 cyangwa 200 RWF ku kwezi. Abacuruzi: 1,500 RWF ku kwezi. Ishyura ukoresheje Mobile Money.", sw: "Jaribu kila huduma ya ISOKO GROUP bure kwa dakika 10, kisha RWF 50 kwa siku 7 au RWF 200 kwa mwezi. Wauzaji: RWF 1,500 kwa mwezi. Lipa kwa Mobile Money.", fr: "Essayez tous les services ISOKO GROUP gratuitement pendant 10 minutes, puis 50 RWF pour 7 jours ou 200 RWF par mois. Vendeurs : 1 500 RWF par mois. Payez par Mobile Money.", zh: "免费试用 ISOKO GROUP 全部服务 10 分钟，之后 7 天 50 卢旺达法郎或 1 个月 200 卢旺达法郎。卖家：每月 1,500 卢旺达法郎。通过 Mobile Money 支付。" },
  "story.title": { en: "See what we do", rw: "Reba ibyo dukora", sw: "Tazama tunachofanya", fr: "Découvrez ce que nous faisons", zh: "看看我们做什么" },
  "story.sub": { en: "Watch the pictures, or tap the speaker to listen.", rw: "Reba amashusho, cyangwa ukande ku kimenyetso cy'ijwi wumve.", sw: "Tazama picha, au bonyeza spika usikilize.", fr: "Regardez les images, ou touchez le haut-parleur pour écouter.", zh: "观看图片，或点击喇叭收听。" },
  "story.intro": { en: "ISOKO GROUP: many services in one place, on your phone.", rw: "ISOKO GROUP: serivisi nyinshi ahantu hamwe, kuri telefoni yawe.", sw: "ISOKO GROUP: huduma nyingi mahali pamoja, kwenye simu yako.", fr: "ISOKO GROUP : de nombreux services en un seul endroit, sur votre téléphone.", zh: "ISOKO GROUP：多种服务，一站汇聚，尽在手机。" },
  "story.delivery": { en: "We pick up your package and deliver it. You can follow it on the map.", rw: "Dufata ipaki yawe tukayikugereza. Ushobora kuyikurikirana ku ikarita.", sw: "Tunachukua kifurushi chako na kukifikisha. Unaweza kukifuatilia kwenye ramani.", fr: "Nous récupérons votre colis et le livrons. Vous le suivez sur la carte.", zh: "我们上门取件并送达，您可在地图上跟踪。" },
  "story.packaging": { en: "We make strong bags and boxes for your shop.", rw: "Dukora imifuka n'amakarito akomeye y'iduka ryawe.", sw: "Tunatengeneza mifuko na masanduku imara kwa duka lako.", fr: "Nous fabriquons des sacs et des cartons solides pour votre boutique.", zh: "我们为您的店铺制作结实的袋子和纸箱。" },
  "story.market": { en: "Buy from local sellers, or sell your own goods.", rw: "Gura ku bacuruzi bo hafi, cyangwa ucuruze ibyawe.", sw: "Nunua kutoka kwa wauzaji wa karibu, au uza bidhaa zako.", fr: "Achetez auprès de vendeurs locaux, ou vendez vos produits.", zh: "向本地卖家购买，或出售您自己的商品。" },
  "story.learning": { en: "Learn new skills, read books online and get a certificate.", rw: "Iga ubumenyi bushya, usome ibitabo kuri interineti, uhabwe impamyabumenyi.", sw: "Jifunze ujuzi mpya, soma vitabu mtandaoni na upate cheti.", fr: "Apprenez de nouvelles compétences, lisez des livres en ligne et obtenez un certificat.", zh: "学习新技能，在线阅读，并获得证书。" },
  "story.fun": { en: "Watch and listen to entertainment.", rw: "Reba kandi wumve imyidagaduro.", sw: "Tazama na usikilize burudani.", fr: "Regardez et écoutez des divertissements.", zh: "观看和收听娱乐节目。" },
  "story.business": { en: "We build websites and apps, and help businesses with advice and data.", rw: "Dukora imbuga za interineti na porogaramu, tugafasha ibigo inama n'amakuru.", sw: "Tunatengeneza tovuti na programu, na kusaidia biashara kwa ushauri na takwimu.", fr: "Nous créons des sites web et des applications, et conseillons les entreprises.", zh: "我们开发网站和应用，并为企业提供咨询和数据服务。" },
  "story.travel": { en: "We plan your trip in Rwanda.", rw: "Dutegura urugendo rwawe mu Rwanda.", sw: "Tunapanga safari yako nchini Rwanda.", fr: "Nous organisons votre voyage au Rwanda.", zh: "我们为您规划卢旺达之旅。" },
  "story.pay": { en: "Try it free, then pay a small fee with Mobile Money.", rw: "Gerageza ku buntu, hanyuma wishyure make ukoresheje Mobile Money.", sw: "Jaribu bure, kisha lipa kiasi kidogo kwa Mobile Money.", fr: "Essayez gratuitement, puis payez une petite somme par Mobile Money.", zh: "先免费试用，再用手机钱包支付少量费用。" },
  "story.open": { en: "Open", rw: "Fungura", sw: "Fungua", fr: "Ouvrir", zh: "打开" },
  "story.play": { en: "Play", rw: "Tangiza", sw: "Cheza", fr: "Lecture", zh: "播放" },
  "story.pause": { en: "Pause", rw: "Hagarika", sw: "Simamisha", fr: "Pause", zh: "暂停" },
  "story.next": { en: "Next", rw: "Ibikurikira", sw: "Inayofuata", fr: "Suivant", zh: "下一个" },
  "story.prev": { en: "Previous", rw: "Ibibanza", sw: "Iliyotangulia", fr: "Précédent", zh: "上一个" },
  "story.listen": { en: "Listen", rw: "Umva", sw: "Sikiliza", fr: "Écouter", zh: "收听" },
  "story.watch": { en: "See what we do", rw: "Reba ibyo dukora", sw: "Tazama tunachofanya", fr: "Voir ce que nous faisons", zh: "看看我们做什么" },
  "cta.getStarted": { en: "Get Started Now", rw: "Tangira Nonaha", sw: "Anza Sasa", fr: "Commencer maintenant", zh: "立即开始" },
  "cta.benefit1": { en: "Access all services — Logistics, Packaging, Marketplace, E-Library", rw: "Koresha serivisi zose — Gutwara, Gupakira, Isoko, Ibitabo", sw: "Fikia huduma zote — Usafirishaji, Ufungaji, Soko, Maktaba ya Mtandaoni", fr: "Accédez à tous les services : logistique, emballage, marché, bibliothèque", zh: "使用全部服务：物流、包装、市场、电子图书馆" },
  "cta.benefit2": { en: "Connect with verified sellers and buyers", rw: "Hura n'abacuruzi n'abaguzi bemejwe", sw: "Ungana na wauzaji na wanunuzi waliothibitishwa", fr: "Échangez avec des vendeurs et acheteurs vérifiés", zh: "与经过验证的买家和卖家联系" },
  "cta.benefit3": { en: "Read unlimited books online", rw: "Soma ibitabo bitagira ingano kuri interineti", sw: "Soma vitabu visivyo na kikomo mtandaoni", fr: "Lisez des livres en ligne sans limite", zh: "在线无限阅读图书" },
  "cta.benefit4": { en: "Real-time tracking and order management", rw: "Gukurikirana no gucunga ibyo wakoze", sw: "Ufuatiliaji wa moja kwa moja na usimamizi wa maagizo", fr: "Suivi en temps réel et gestion des commandes", zh: "实时追踪与订单管理" },

  // Auth
  "auth.welcomeBack": { en: "Welcome Back", rw: "Murakaza Neza", sw: "Karibu Tena", fr: "Bon retour", zh: "欢迎回来" },
  "auth.subtitle": { en: "Login or create an account to get started.", rw: "Injira cyangwa ufungure konti kugira ngo utangire.", sw: "Ingia au fungua akaunti ili uanze.", fr: "Connectez-vous ou créez un compte pour commencer.", zh: "登录或创建账户即可开始。" },
  "auth.login": { en: "Login", rw: "Injira", sw: "Ingia", fr: "Se connecter", zh: "登录" },
  "auth.register": { en: "Register", rw: "Iyandikishe", sw: "Jisajili", fr: "S'inscrire", zh: "注册" },
  "auth.email": { en: "Email", rw: "Imeri", sw: "Barua pepe", fr: "E-mail", zh: "电子邮箱" },
  "auth.password": { en: "Password", rw: "Ijambo ry'Ibanga", sw: "Nenosiri", fr: "Mot de passe", zh: "密码" },
  "auth.fullName": { en: "Full Name", rw: "Amazina Yose", sw: "Jina Kamili", fr: "Nom complet", zh: "全名" },
  "auth.createAccount": { en: "Create Account", rw: "Fungura Konti", sw: "Fungua Akaunti", fr: "Créer un compte", zh: "创建账户" },
  "auth.forgot": { en: "Forgot your password?", rw: "Wibagiwe ijambo ry'ibanga?", sw: "Umesahau nenosiri lako?", fr: "Mot de passe oublié ?", zh: "忘记密码？" },
  "auth.forgotTitle": { en: "Reset your password", rw: "Hindura ijambo ry'ibanga", sw: "Weka upya nenosiri lako", fr: "Réinitialiser votre mot de passe", zh: "重置密码" },
  "auth.forgotSubtitle": { en: "Enter your account's email and we'll send you a link to choose a new password.", rw: "Andika imeri ya konti yawe tukoherereze link yo guhitamo ijambo ry'ibanga rishya.", sw: "Andika barua pepe ya akaunti yako na tutakutumia kiungo cha kuchagua nenosiri jipya.", fr: "Saisissez l'e-mail de votre compte et nous vous enverrons un lien pour choisir un nouveau mot de passe.", zh: "输入账户邮箱，我们会向您发送设置新密码的链接。" },
  "auth.sendLink": { en: "Send reset link", rw: "Ohereza link", sw: "Tuma kiungo", fr: "Envoyer le lien", zh: "发送重置链接" },
  "auth.linkSent": { en: "If an account uses this email, a reset link is on its way. It works once and expires in 1 hour. Check your spam folder too.", rw: "Niba hari konti ikoresha iyi meri, link iraje. Ikora rimwe gusa kandi ita agaciro nyuma y'isaha 1. Reba no muri spam.", sw: "Ikiwa akaunti inatumia barua pepe hii, kiungo kinakuja. Kinafanya kazi mara moja na kinaisha baada ya saa 1. Angalia pia folda ya spam.", fr: "Si un compte utilise cet e-mail, un lien est en route. Il fonctionne une seule fois et expire dans 1 heure. Vérifiez aussi vos spams.", zh: "如果有账户使用此邮箱，重置链接已在发送中。链接仅可使用一次，1 小时后失效。请同时检查垃圾邮件。" },
  "auth.tooMany": { en: "Too many requests. Wait a minute and try again.", rw: "Wasabye kenshi. Tegereza umunota umwe wongere ugerageze.", sw: "Maombi mengi mno. Subiri dakika moja kisha ujaribu tena.", fr: "Trop de demandes. Patientez une minute et réessayez.", zh: "请求过于频繁。请等待一分钟后重试。" },
  "auth.emailRateLimit": { en: "Too many email requests were made. Please wait a moment and try again.", rw: "Hasabwe imeri nyinshi icyarimwe. Nyamuneka tegereza gato wongere ugerageze.", sw: "Maombi mengi ya barua pepe yametumwa. Tafadhali subiri kidogo kisha ujaribu tena.", fr: "Trop de demandes d'e-mail. Patientez un instant et réessayez.", zh: "邮件请求过多。请稍候再试。" },
  "auth.resendIn": { en: "Send the link again in {s}s", rw: "Ohereza link nanone mu masegonda {s}", sw: "Tuma kiungo tena baada ya sekunde {s}", fr: "Renvoyer le lien dans {s} s", zh: "{s} 秒后可重新发送链接" },
  "auth.backToLogin": { en: "Back to login", rw: "Subira ku kwinjira", sw: "Rudi kwenye kuingia", fr: "Retour à la connexion", zh: "返回登录" },
  "auth.newPassword": { en: "New password", rw: "Ijambo ry'ibanga rishya", sw: "Nenosiri jipya", fr: "Nouveau mot de passe", zh: "新密码" },
  "auth.confirmPassword": { en: "Repeat new password", rw: "Subiramo ijambo ry'ibanga rishya", sw: "Rudia nenosiri jipya", fr: "Répétez le nouveau mot de passe", zh: "再次输入新密码" },
  "auth.passwordRule": { en: "At least 8 characters.", rw: "Nibura inyuguti 8.", sw: "Angalau herufi 8.", fr: "Au moins 8 caractères.", zh: "至少 8 个字符。" },
  "auth.passwordMismatch": { en: "The two passwords are different.", rw: "Amagambo y'ibanga yombi ntabwo ahuye.", sw: "Manenosiri hayo mawili ni tofauti.", fr: "Les deux mots de passe sont différents.", zh: "两次输入的密码不一致。" },
  "auth.savePassword": { en: "Save new password", rw: "Bika ijambo ry'ibanga rishya", sw: "Hifadhi nenosiri jipya", fr: "Enregistrer le nouveau mot de passe", zh: "保存新密码" },
  "auth.passwordSaved": { en: "Password changed. You're signed in here and signed out everywhere else.", rw: "Ijambo ry'ibanga ryahinduwe. Winjiye hano, kandi wasohowe ahandi hose.", sw: "Nenosiri limebadilishwa. Umeingia hapa na umetolewa kila mahali pengine.", fr: "Mot de passe modifié. Vous êtes connecté ici et déconnecté partout ailleurs.", zh: "密码已更改。您已在此登录，其他设备均已退出。" },
  "auth.linkInvalid": { en: "This reset link is invalid or has expired. Ask for a new one.", rw: "Iyi link ntikora cyangwa yataye agaciro. Saba indi nshya.", sw: "Kiungo hiki si sahihi au kimeisha muda. Omba kipya.", fr: "Ce lien est invalide ou a expiré. Demandez-en un nouveau.", zh: "此重置链接无效或已过期。请重新申请。" },
  "auth.newLink": { en: "Get a new link", rw: "Saba link nshya", sw: "Pata kiungo kipya", fr: "Obtenir un nouveau lien", zh: "获取新链接" },
  "auth.subscription": { en: "Free for 10 minutes, then 50 RWF for 7 days or 200 RWF for a month", rw: "Ubuntu mu minota 10, hanyuma 50 RWF ku minsi 7 cyangwa 200 RWF ku kwezi", sw: "Bure kwa dakika 10, kisha RWF 50 kwa siku 7 au RWF 200 kwa mwezi", fr: "Gratuit pendant 10 minutes, puis 50 RWF pour 7 jours ou 200 RWF par mois", zh: "免费 10 分钟，之后 7 天 50 卢旺达法郎或 1 个月 200 卢旺达法郎" },

  // Seller
  "seller.title": { en: "Become a Seller", rw: "Ba Umucuruzi", sw: "Kuwa Muuzaji", fr: "Devenir vendeur", zh: "成为卖家" },
  "seller.subtitle": { en: "Join our marketplace and reach thousands of buyers across Africa and the world.", rw: "Injira mu isoko ryacu uhure n'abaguzi ibihumbi muri Afurika no ku isi hose.", sw: "Jiunge na soko letu na ufikie maelfu ya wanunuzi kote Afrika na duniani.", fr: "Rejoignez notre marché et touchez des milliers d'acheteurs en Afrique et dans le monde.", zh: "加入我们的市场，触达非洲及全球数千名买家。" },
  "seller.rules": { en: "Seller Rules", rw: "Amategeko y'Abacuruzi", sw: "Sheria za Wauzaji", fr: "Règles du vendeur", zh: "卖家规则" },
  "seller.form": { en: "Registration Form", rw: "Ifishi yo Kwiyandikisha", sw: "Fomu ya Usajili", fr: "Formulaire d'inscription", zh: "注册表单" },
  "seller.fullName": { en: "Full Name", rw: "Amazina Yose", sw: "Jina Kamili", fr: "Nom complet", zh: "全名" },
  "seller.businessName": { en: "Business Name", rw: "Izina ry'Ubucuruzi", sw: "Jina la Biashara", fr: "Nom de l'entreprise", zh: "企业名称" },
  "seller.phone": { en: "Phone", rw: "Telefoni", sw: "Simu", fr: "Téléphone", zh: "电话" },
  "seller.idNumber": { en: "ID Number (for verification)", rw: "Nimero y'Indangamuntu", sw: "Nambari ya Kitambulisho (kwa uthibitisho)", fr: "Numéro d'identité (pour vérification)", zh: "身份证号（用于验证）" },
  "seller.submit": { en: "Submit Application", rw: "Ohereza Ubusabe", sw: "Tuma Ombi", fr: "Envoyer la demande", zh: "提交申请" },
  "seller.reapply": { en: "Re-apply", rw: "Saba kongera", sw: "Omba tena", fr: "Postuler à nouveau", zh: "重新申请" },
  "seller.submitNewApplication": { en: "Submit a new application", rw: "Ohereza ubusabe bushya", sw: "Tuma ombi mpya", fr: "Soumettre une nouvelle demande", zh: "提交新的申请" },
  "seller.formInstructions": { en: "All fields are required. Please provide accurate information — applications with missing or invalid details will be rejected.", rw: "Imirima yose irakenewe. Nyamuneka utange amakuru y'ukuri — ubusabe bufite amakuru abura cyangwa atari yo buzahana.", sw: "Sehemu zote ni muhimu. Tafadhali toa taarifa sahihi — maombi yenye taarifa zinazokosekana au batili yatakataliwa.", fr: "Tous les champs sont obligatoires. Veuillez fournir des informations exactes — les candidatures incomplètes ou invalides seront rejetées.", zh: "所有字段均为必填项。请提供准确的信息——缺失或无效信息的申请将被拒绝。" },

  // Footer
  "footer.services": { en: "Services", rw: "Serivisi", sw: "Huduma", fr: "Services", zh: "服务" },
  "footer.company": { en: "Company", rw: "Ikigo", sw: "Kampuni", fr: "Entreprise", zh: "公司" },
  "footer.contact": { en: "Contact", rw: "Twandikire", sw: "Wasiliana", fr: "Contact", zh: "联系我们" },
  "footer.tagline": { en: "Everything You Need in One Platform — Logistics, Marketplace & Knowledge Combined.", rw: "Ibyo Ukeneye Byose kuri Urubuga Rumwe — Gutwara, Isoko n'Ubumenyi Hamwe.", sw: "Kila Unachohitaji kwenye Jukwaa Moja — Usafirishaji, Soko na Maarifa Pamoja.", fr: "Tout ce dont vous avez besoin sur une seule plateforme : logistique, marché et savoir réunis.", zh: "一个平台满足所有需求：物流、市场与知识融为一体。" },
  "footer.aboutUs": { en: "About Us", rw: "Abo Turi Bo", sw: "Kuhusu Sisi", fr: "À propos de nous", zh: "关于我们" },
  "footer.rights": { en: "All rights reserved.", rw: "Uburenganzira bwose bwabikiwe.", sw: "Haki zote zimehifadhiwa.", fr: "Tous droits réservés.", zh: "版权所有。" },
  "footer.findUs": { en: "Find us", rw: "Aho turi", sw: "Tupate", fr: "Nous trouver", zh: "找到我们" },
  "footer.openMaps": { en: "Open in Google Maps", rw: "Fungura muri Google Maps", sw: "Fungua kwenye Google Maps", fr: "Ouvrir dans Google Maps", zh: "在 Google 地图中打开" },
  "footer.whatsapp": { en: "WhatsApp", rw: "WhatsApp", sw: "WhatsApp", fr: "WhatsApp", zh: "WhatsApp" },
  "footer.call": { en: "Call", rw: "Hamagara", sw: "Piga simu", fr: "Appeler", zh: "致电" },

  // About
  "about.office": { en: "Office", rw: "Ibiro", sw: "Ofisi", fr: "Bureau", zh: "办公室" },
  "about.phone": { en: "Phone", rw: "Telefoni", sw: "Simu", fr: "Téléphone", zh: "电话" },
  "about.email": { en: "Email", rw: "Imeri", sw: "Barua pepe", fr: "E-mail", zh: "电子邮箱" },

  // Admin
  "admin.title": { en: "Admin Dashboard", rw: "Ubuyobozi", sw: "Dashibodi ya Msimamizi", fr: "Tableau de bord admin", zh: "管理仪表盘" },
  "admin.users": { en: "Users", rw: "Abakoresha", sw: "Watumiaji", fr: "Utilisateurs", zh: "用户" },
  "admin.orders": { en: "Orders", rw: "Ibyo Bakoze", sw: "Maagizo", fr: "Commandes", zh: "订单" },
  "admin.commissions": { en: "Commissions", rw: "Komisiyo", sw: "Kamisheni", fr: "Commissions", zh: "佣金" },
  "admin.analytics": { en: "Analytics", rw: "Isesengura", sw: "Takwimu", fr: "Analyses", zh: "分析" },
  "admin.totalUsers": { en: "Total Users", rw: "Abakoresha Bose", sw: "Jumla ya Watumiaji", fr: "Utilisateurs au total", zh: "用户总数" },
  "admin.totalOrders": { en: "Total Orders", rw: "Ibyo Bakoze Byose", sw: "Jumla ya Maagizo", fr: "Commandes au total", zh: "订单总数" },
  "admin.revenue": { en: "Revenue", rw: "Amafaranga Yinjiye", sw: "Mapato", fr: "Revenus", zh: "收入" },
  "admin.commission": { en: "Commission", rw: "Komisiyo", sw: "Kamisheni", fr: "Commission", zh: "佣金" },

  // Isoko Entertainment navigation
  "ent.home": { en: "Home", rw: "Ahabanza", sw: "Nyumbani", fr: "Accueil", zh: "首页" },
  "ent.film": { en: "Film", rw: "Filime", sw: "Filamu", fr: "Film", zh: "影视" },
  "ent.genre": { en: "Genre", rw: "Ubwoko", sw: "Aina", fr: "Genre", zh: "类型" },
  "ent.movies": { en: "Movies", rw: "Filime", sw: "Sinema", fr: "Films", zh: "电影" },
  "ent.tvSeries": { en: "TV Series", rw: "Ibiganiro bikurikiranye", sw: "Mfululizo wa TV", fr: "Séries TV", zh: "电视剧" },
  "ent.podcasts": { en: "Podcasts", rw: "Podcasts", sw: "Podikasti", fr: "Podcasts", zh: "播客" },
  "ent.photoStudio": { en: "Photo Studio", rw: "Studio y'amafoto", sw: "Studio ya Picha", fr: "Studio photo", zh: "摄影工作室" },
  "ent.artDesign": { en: "Art & Design", rw: "Ubuhanzi n'Igishushanyo", sw: "Sanaa na Ubunifu", fr: "Art & Design", zh: "艺术与设计" },
  "ent.fashion": { en: "Fashion", rw: "Imideli", sw: "Mitindo", fr: "Mode", zh: "时尚" },
  "ent.fashionHub": { en: "Fashion Hub", rw: "Fashion Hub", sw: "Kituo cha Mitindo", fr: "Fashion Hub", zh: "时尚中心" },
  "ent.live": { en: "Live", rw: "Mu buryo butaziguye", sw: "Moja kwa moja", fr: "En direct", zh: "直播" },
  "ent.events": { en: "Events", rw: "Ibirori", sw: "Matukio", fr: "Événements", zh: "活动" },
  "ent.search": { en: "Search", rw: "Shakisha", sw: "Tafuta", fr: "Rechercher", zh: "搜索" },
  "ent.signIn": { en: "Sign in", rw: "Injira", sw: "Ingia", fr: "Se connecter", zh: "登录" },
  "ent.saved": { en: "Saved", rw: "Ibyabitswe", sw: "Vilivyohifadhiwa", fr: "Enregistrés", zh: "已收藏" },
  "ent.manage": { en: "Manage", rw: "Gucunga", sw: "Simamia", fr: "Gérer", zh: "管理" },
  "ent.allGenres": { en: "All genres", rw: "Ubwoko bwose", sw: "Aina zote", fr: "Tous les genres", zh: "全部类型" },
  "ent.nothingYet": { en: "Nothing here yet", rw: "Nta kintu kirahaba", sw: "Hakuna kitu bado", fr: "Rien ici pour le moment", zh: "暂无内容" },
  "ent.seasons": { en: "Seasons", rw: "Ibihembwe", sw: "Misimu", fr: "Saisons", zh: "季" },
  "ent.episodes": { en: "Episodes", rw: "Ibice", sw: "Vipindi", fr: "Épisodes", zh: "集" },
  "ent.season": { en: "Season", rw: "Igihembwe", sw: "Msimu", fr: "Saison", zh: "第季" },
  "ent.trailer": { en: "Trailer", rw: "Agashusho", sw: "Trela", fr: "Bande-annonce", zh: "预告片" },
  "ent.watch": { en: "Watch", rw: "Reba", sw: "Tazama", fr: "Regarder", zh: "观看" },
  "ent.browseBy": { en: "Browse by genre", rw: "Reba ukurikije ubwoko", sw: "Vinjari kwa aina", fr: "Parcourir par genre", zh: "按类型浏览" },
  "ent.allMovies": { en: "All movies", rw: "Filime zose", sw: "Sinema zote", fr: "Tous les films", zh: "全部电影" },
  "ent.allSeries": { en: "All series", rw: "Ibiganiro byose", sw: "Mfululizo wote", fr: "Toutes les séries", zh: "全部剧集" },
  "ent.backToFilm": { en: "Back to Film", rw: "Subira kuri Filime", sw: "Rudi kwenye Filamu", fr: "Retour à Film", zh: "返回影视" },

  // Isoko Fashion Hub
  "hub.title": { en: "Isoko Fashion Hub", rw: "Isoko Fashion Hub", sw: "Isoko Fashion Hub", fr: "Isoko Fashion Hub", zh: "Isoko 时尚中心" },
  "hub.intro": { en: "Styles designed and made by Isoko. Ask about any style, or ask us to make it for you.", rw: "Imideli yashushanyijwe kandi ikozwe na Isoko. Baza ku mudeli uwo ari wo wose, cyangwa udusabe kuwugukorera.", sw: "Mitindo iliyobuniwa na kutengenezwa na Isoko. Uliza kuhusu mtindo wowote, au tuombe tukutengenezee.", fr: "Des styles conçus et confectionnés par Isoko. Renseignez-vous sur un style, ou demandez-nous de le réaliser pour vous.", zh: "由 Isoko 设计并制作的款式。欢迎咨询任何款式，或请我们为您定制。" },
  "hub.interested": { en: "I'm interested", rw: "Ndabishaka", sw: "Ninavutiwa", fr: "Je suis intéressé(e)", zh: "我感兴趣" },
  "hub.ask": { en: "Ask about this style", rw: "Baza kuri uyu mudeli", sw: "Uliza kuhusu mtindo huu", fr: "Se renseigner sur ce style", zh: "咨询此款式" },
  "hub.request": { en: "Request Isoko to produce this", rw: "Saba Isoko kuwugukorera", sw: "Omba Isoko ikutengenezee", fr: "Demander à Isoko de le réaliser", zh: "请 Isoko 制作此款" },
  "hub.colors": { en: "Available colors", rw: "Amabara ahari", sw: "Rangi zinazopatikana", fr: "Couleurs disponibles", zh: "可选颜色" },
  "hub.sizes": { en: "Available sizes", rw: "Ingano zihari", sw: "Saizi zinazopatikana", fr: "Tailles disponibles", zh: "可选尺码" },
  "hub.fabric": { en: "Fabric / material", rw: "Igitambaro", sw: "Kitambaa / nyenzo", fr: "Tissu / matière", zh: "面料 / 材质" },
  "hub.designer": { en: "Designer", rw: "Umushushanyi", sw: "Mbunifu", fr: "Styliste", zh: "设计师" },
  "hub.availability": { en: "Availability", rw: "Kuboneka", sw: "Upatikanaji", fr: "Disponibilité", zh: "供应情况" },
  "hub.category": { en: "Category", rw: "Icyiciro", sw: "Kategoria", fr: "Catégorie", zh: "类别" },
  "hub.style": { en: "Style", rw: "Umudeli", sw: "Mtindo", fr: "Style", zh: "款式" },
  "hub.myRequests": { en: "My fashion requests", rw: "Ibyo nasabye ku mideli", sw: "Maombi yangu ya mitindo", fr: "Mes demandes mode", zh: "我的时尚请求" },
  "hub.accountNeeded": { en: "An account is required to send a request. Register or sign in and you'll come back to this style.", rw: "Konti irakenewe kugira ngo wohereze icyifuzo. Iyandikishe cyangwa winjire, uzagaruka kuri uyu mudeli.", sw: "Akaunti inahitajika ili kutuma ombi. Jisajili au ingia na utarudi kwenye mtindo huu.", fr: "Un compte est nécessaire pour envoyer une demande. Inscrivez-vous ou connectez-vous : vous reviendrez à ce style.", zh: "发送请求需要账户。注册或登录后将返回此款式。" },
  "hub.noDesigns": { en: "No styles have been published yet. Check back soon.", rw: "Nta mideli iratangazwa. Ongera ugaruke vuba.", sw: "Hakuna mitindo iliyochapishwa bado. Rudi tena hivi karibuni.", fr: "Aucun style n'a encore été publié. Revenez bientôt.", zh: "尚未发布任何款式，敬请期待。" },
  "hub.message": { en: "Your message", rw: "Ubutumwa bwawe", sw: "Ujumbe wako", fr: "Votre message", zh: "您的留言" },
  "hub.size": { en: "Size", rw: "Ingano", sw: "Saizi", fr: "Taille", zh: "尺码" },
  "hub.color": { en: "Preferred color", rw: "Ibara ushaka", sw: "Rangi unayopendelea", fr: "Couleur souhaitée", zh: "偏好颜色" },
  "hub.fabricPref": { en: "Preferred fabric", rw: "Igitambaro ushaka", sw: "Kitambaa unachopendelea", fr: "Tissu souhaité", zh: "偏好面料" },
  "hub.quantity": { en: "Quantity", rw: "Umubare", sw: "Idadi", fr: "Quantité", zh: "数量" },
  "hub.customization": { en: "Customization", rw: "Impinduka ushaka", sw: "Mabadiliko maalum", fr: "Personnalisation", zh: "定制要求" },
  "hub.send": { en: "Send", rw: "Ohereza", sw: "Tuma", fr: "Envoyer", zh: "发送" },
  "hub.sent": { en: "Sent. Isoko will reply to you here and by email.", rw: "Byoherejwe. Isoko izagusubiza hano no kuri imeri.", sw: "Imetumwa. Isoko itakujibu hapa na kwa barua pepe.", fr: "Envoyé. Isoko vous répondra ici et par e-mail.", zh: "已发送。Isoko 将在此处及通过电子邮件回复您。" },
  "hub.noPromise": { en: "Price, availability and production time are confirmed by Isoko after reviewing your request.", rw: "Igiciro, kuboneka n'igihe cyo gukora byemezwa na Isoko imaze gusuzuma icyifuzo cyawe.", sw: "Bei, upatikanaji na muda wa utengenezaji huthibitishwa na Isoko baada ya kupitia ombi lako.", fr: "Le prix, la disponibilité et le délai de production sont confirmés par Isoko après examen de votre demande.", zh: "价格、供应情况和制作时间将由 Isoko 审核您的请求后确认。" },
  "hub.status.submitted": { en: "Submitted", rw: "Byoherejwe", sw: "Imetumwa", fr: "Envoyée", zh: "已提交" },
  "hub.status.under_review": { en: "Under review", rw: "Birasuzumwa", sw: "Inakaguliwa", fr: "En cours d'examen", zh: "审核中" },
  "hub.status.more_info_required": { en: "More information required", rw: "Hakenewe andi makuru", sw: "Taarifa zaidi zinahitajika", fr: "Informations supplémentaires requises", zh: "需要更多信息" },
  "hub.status.accepted": { en: "Accepted", rw: "Byemewe", sw: "Imekubaliwa", fr: "Acceptée", zh: "已接受" },
  "hub.status.in_production": { en: "In production", rw: "Birakorwa", sw: "Inatengenezwa", fr: "En production", zh: "制作中" },
  "hub.status.ready": { en: "Ready", rw: "Byarangiye", sw: "Tayari", fr: "Prête", zh: "已完成制作" },
  "hub.status.completed": { en: "Completed", rw: "Byasojwe", sw: "Imekamilika", fr: "Terminée", zh: "已完成" },
  "hub.status.declined": { en: "Declined", rw: "Byanzwe", sw: "Imekataliwa", fr: "Refusée", zh: "已拒绝" },

  // Subscription status
  "sub.title": { en: "Subscription", rw: "Iyandikishe", sw: "Usajili", fr: "Abonnement", zh: "订阅" },
  "sub.status.trial": { en: "Free trial", rw: "Igerageza ry'ubuntu", sw: "Jaribio la bure", fr: "Essai gratuit", zh: "免费试用" },
  "sub.status.active": { en: "Active subscription", rw: "Iyandikishe rikora", sw: "Usajili unaotumika", fr: "Abonnement actif", zh: "订阅有效" },
  "sub.status.expiring": { en: "Expiring soon", rw: "Rigiye kurangira", sw: "Unakaribia kuisha", fr: "Expire bientôt", zh: "即将到期" },
  "sub.status.expired": { en: "Expired", rw: "Ryarangiye", sw: "Umeisha", fr: "Expiré", zh: "已过期" },
  "sub.status.none": { en: "No subscription", rw: "Nta yandikishe", sw: "Hakuna usajili", fr: "Pas d'abonnement", zh: "无订阅" },
  "sub.status.pending": { en: "Payment awaiting confirmation", rw: "Ubwishyu butegereje kwemezwa", sw: "Malipo yanasubiri uthibitisho", fr: "Paiement en attente de confirmation", zh: "付款待确认" },
  "sub.until": { en: "Until {date}", rw: "Kugeza {date}", sw: "Hadi {date}", fr: "Jusqu'au {date}", zh: "有效期至 {date}" },
  "sub.left": { en: "{time} left", rw: "Hasigaye {time}", sw: "Imebaki {time}", fr: "{time} restant", zh: "剩余 {time}" },
  "sub.manage": { en: "Manage subscription", rw: "Gucunga iyandikishe", sw: "Dhibiti usajili", fr: "Gérer l'abonnement", zh: "管理订阅" },
  "sub.subscribe": { en: "Subscribe", rw: "Iyandikishe", sw: "Jisajili", fr: "S'abonner", zh: "订阅" },
  "sub.renew": { en: "Renew", rw: "Ongera wishyure", sw: "Sasisha", fr: "Renouveler", zh: "续订" },
  "sub.trialEndsWarning": { en: "Your free trial ends soon. Subscribe to keep access.", rw: "Igerageza ryawe ry'ubuntu rigiye kurangira. Iyandikishe kugira ngo ukomeze.", sw: "Jaribio lako la bure linakaribia kuisha. Jisajili ili kuendelea kupata huduma.", fr: "Votre essai gratuit se termine bientôt. Abonnez-vous pour conserver l'accès.", zh: "您的免费试用即将结束。订阅以保持访问权限。" },
  "sub.noSub": { en: "You have an account but no active subscription. Protected services open as soon as a payment is confirmed.", rw: "Ufite konti ariko nta yandikishe rikora. Serivisi zirinzwe zifungurwa ubwishyu bukimara kwemezwa.", sw: "Una akaunti lakini huna usajili unaotumika. Huduma zilizolindwa hufunguka mara malipo yanapothibitishwa.", fr: "Vous avez un compte mais aucun abonnement actif. Les services protégés s'ouvrent dès qu'un paiement est confirmé.", zh: "您已有账户但没有有效订阅。付款确认后即可使用受保护的服务。" },

  // Account required before a protected service
  "sub.accountKept": { en: "Your account is still here. Only the member services wait until a payment is confirmed; your orders, requests and dashboard stay yours.", rw: "Konti yawe iracyahari. Serivisi z'abanyamuryango gusa ni zo zitegereza kwemezwa kw'ubwishyu; ibyo watumije, ubusabe bwawe n'ikarita yawe biguma ari ibyawe.", sw: "Akaunti yako bado ipo. Huduma za wanachama pekee ndizo zinasubiri malipo kuthibitishwa; maagizo, maombi na dashibodi yako vinabaki vyako.", fr: "Votre compte est toujours là. Seuls les services réservés aux membres attendent la confirmation d'un paiement ; vos commandes, demandes et votre tableau de bord restent à vous.", zh: "您的账户仍然存在。只有会员服务需要等待付款确认；您的订单、请求和仪表盘仍然属于您。" },
  "sub.goDashboard": { en: "Go to my dashboard", rw: "Jya ku ikarita yanjye", sw: "Nenda kwenye dashibodi yangu", fr: "Aller à mon tableau de bord", zh: "前往我的仪表盘" },
  "access.accountRequired": { en: "An account is required for this service", rw: "Iyi serivisi isaba konti", sw: "Huduma hii inahitaji akaunti", fr: "Un compte est nécessaire pour ce service", zh: "此服务需要账户" },
  "access.explain": { en: "Create a free account or sign in to continue. You'll come back here afterwards.", rw: "Fungura konti y'ubuntu cyangwa winjire kugira ngo ukomeze. Uzagaruka hano nyuma.", sw: "Fungua akaunti ya bure au ingia ili kuendelea. Utarudi hapa baadaye.", fr: "Créez un compte gratuit ou connectez-vous pour continuer. Vous reviendrez ici ensuite.", zh: "创建免费账户或登录以继续。之后您将返回此处。" },
  "access.register": { en: "Create account", rw: "Fungura konti", sw: "Fungua akaunti", fr: "Créer un compte", zh: "创建账户" },
  "access.signIn": { en: "Sign in", rw: "Injira", sw: "Ingia", fr: "Se connecter", zh: "登录" },

  // Consent bar for the Google tag (docs/GOOGLE_ADS.md)
  "consent.title": { en: "Cookies for advertising", rw: "Kuki zo kwamamaza", sw: "Vidakuzi vya matangazo", fr: "Cookies publicitaires", zh: "广告 Cookie" },
  "consent.text": { en: "With your permission, Isoko uses Google's tag to show you relevant Isoko ads later and to count visits. You can decline; the website works the same.", rw: "Niba ubyemeye, Isoko ikoresha ikimenyetso cya Google kugira ngo ikwereke amatangazo ya Isoko akwiriye nyuma no kubara abasura. Ushobora kubyanga; urubuga rukora kimwe.", sw: "Kwa ruhusa yako, Isoko hutumia lebo ya Google kukuonyesha matangazo ya Isoko yanayokufaa baadaye na kuhesabu ziara. Unaweza kukataa; tovuti inafanya kazi vilevile.", fr: "Avec votre accord, Isoko utilise la balise Google pour vous montrer plus tard des annonces Isoko pertinentes et compter les visites. Vous pouvez refuser ; le site fonctionne de la même façon.", zh: "经您同意，Isoko 使用 Google 代码在之后向您展示相关的 Isoko 广告并统计访问量。您可以拒绝，网站功能不受影响。" },
  "consent.accept": { en: "Accept", rw: "Emera", sw: "Kubali", fr: "Accepter", zh: "接受" },
  "consent.decline": { en: "Decline", rw: "Anga", sw: "Kataa", fr: "Refuser", zh: "拒绝" },

  // Paying the company: the Mobile Money code (tap to dial) and the bank account
  "pay.momoTitle": { en: "Pay to our Mobile Money", rw: "Ishyura kuri Mobile Money yacu", sw: "Lipa kwa Mobile Money yetu", fr: "Payez sur notre Mobile Money", zh: "支付到我们的 Mobile Money" },
  "pay.momoTitleAmount": { en: "Pay {amount} to our Mobile Money", rw: "Ishyura {amount} kuri Mobile Money yacu", sw: "Lipa {amount} kwa Mobile Money yetu", fr: "Payez {amount} sur notre Mobile Money", zh: "向我们的 Mobile Money 支付 {amount}" },
  "pay.tapToDial": { en: "Tap the code to dial it", rw: "Kanda kode uyihamagare", sw: "Gusa msimbo ili kuupiga", fr: "Touchez le code pour le composer", zh: "点击代码即可拨号" },
  "pay.copy": { en: "Copy", rw: "Koporora", sw: "Nakili", fr: "Copier", zh: "复制" },
  "pay.copied": { en: "Copied", rw: "Byakoporowe", sw: "Imenakiliwa", fr: "Copié", zh: "已复制" },
  "pay.bankTitle": { en: "Outside Rwanda or no Mobile Money? Bank transfer", rw: "Uri hanze y'u Rwanda cyangwa nta Mobile Money ufite? Ohereza kuri banki", sw: "Uko nje ya Rwanda au huna Mobile Money? Hamisho la benki", fr: "Hors du Rwanda ou sans Mobile Money ? Virement bancaire", zh: "在卢旺达境外或没有 Mobile Money？银行转账" },
  "pay.bankHint": { en: "Transfer to the company account below, then enter the transfer reference or upload the receipt.", rw: "Ohereza kuri konti ya kompanyi iri hano, hanyuma wandike nimero y'ikohereza cyangwa wohereze inyemezabwishyu.", sw: "Hamisha kwenye akaunti ya kampuni hapa chini, kisha andika kumbukumbu ya hamisho au pakia risiti.", fr: "Virez sur le compte de la société ci-dessous, puis indiquez la référence du virement ou envoyez le reçu.", zh: "转账到下方公司账户，然后填写转账参考号或上传收据。" },
  "pay.bank": { en: "Bank", rw: "Banki", sw: "Benki", fr: "Banque", zh: "银行" },
  "pay.accountNumber": { en: "Account number", rw: "Nimero ya konti", sw: "Namba ya akaunti", fr: "Numéro de compte", zh: "账号" },
  "pay.accountName": { en: "Account name", rw: "Izina rya konti", sw: "Jina la akaunti", fr: "Nom du compte", zh: "账户名称" },
  "pay.swift": { en: "SWIFT / BIC", rw: "SWIFT / BIC", sw: "SWIFT / BIC", fr: "SWIFT / BIC", zh: "SWIFT / BIC" },
  "pay.reference": { en: "Use {reference} as the payment reference.", rw: "Koresha {reference} nk'ikimenyetso cy'ubwishyu.", sw: "Tumia {reference} kama kumbukumbu ya malipo.", fr: "Indiquez {reference} comme référence du paiement.", zh: "请使用 {reference} 作为付款参考号。" },

  // The live intake band on the homepage (components/IntakeTicker)
  "ticker.label": { en: "Training Center intake announcements", rw: "Amatangazo y'amahugurwa", sw: "Matangazo ya mafunzo", fr: "Annonces des sessions de formation", zh: "培训招生公告" },
  "ticker.center": { en: "Training Center", rw: "Ikigo cy'Amahugurwa", sw: "Kituo cha Mafunzo", fr: "Centre de formation", zh: "培训中心" },
  "ticker.centerShort": { en: "Training", rw: "Amahugurwa", sw: "Mafunzo", fr: "Formation", zh: "培训" },
  "ticker.new": { en: "New intake", rw: "Amahugurwa mashya", sw: "Mafunzo mapya", fr: "Nouvelle session", zh: "新招生" },
  "ticker.open": { en: "Applications open", rw: "Kwiyandikisha birafunguye", sw: "Maombi yafunguliwa", fr: "Inscriptions ouvertes", zh: "报名进行中" },
  "ticker.closingSoon": { en: "Closing in {days} days", rw: "Bifunga mu minsi {days}", sw: "Inafungwa baada ya siku {days}", fr: "Clôture dans {days} jours", zh: "{days} 天后截止" },
  "ticker.lastDay": { en: "Last day to apply", rw: "Umunsi wa nyuma wo kwiyandikisha", sw: "Siku ya mwisho kuomba", fr: "Dernier jour pour s'inscrire", zh: "报名最后一天" },
  "ticker.comingSoon": { en: "Opens {date}", rw: "Bifungura {date}", sw: "Yafunguliwa {date}", fr: "Ouvre le {date}", zh: "{date} 开放" },
  "ticker.apply": { en: "Apply now", rw: "Iyandikishe", sw: "Omba sasa", fr: "Postuler", zh: "立即报名" },
  "ticker.andMore": { en: "and {n} more", rw: "n’andi {n}", sw: "na mengine {n}", fr: "et {n} autres", zh: "等 {n} 项" },
  "ticker.pause": { en: "Pause the announcements", rw: "Hagarika amatangazo", sw: "Simamisha matangazo", fr: "Mettre en pause", zh: "暂停公告" },
  "ticker.resume": { en: "Play the announcements", rw: "Komeza amatangazo", sw: "Endelea na matangazo", fr: "Reprendre", zh: "继续播放" },
};

export type TranslateVars = Record<string, string | number>;

type I18nContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** The text for a key in the current language (English when missing); {name} placeholders are filled from vars */
  t: (key: string, vars?: TranslateVars) => string;
};

const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as string[]).includes(v);

/** The language kept from the last visit, or English */
export const storedLang = (): Lang => {
  try {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LANG_STORAGE_KEY) : null;
    return isLang(saved) ? saved : "en";
  } catch {
    return "en"; // storage blocked (private mode): English for this visit
  }
};

/** The text for a key in a language, with {name} placeholders filled in */
export const translate = (lang: Lang, key: string, vars?: TranslateVars) => {
  const text = translations[key]?.[lang] ?? translations[key]?.en ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
};

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (key, vars) => translate("en", key, vars),
});

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(storedLang);

  // The page declares its language (screen readers, hyphenation, fonts) and the choice stays for next time
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    if (isLang(next)) setLangState(next);
  }, []);
  const t = useCallback((key: string, vars?: TranslateVars) => translate(lang, key, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
