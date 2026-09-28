import { createContext, useContext, useState, ReactNode } from "react";

export type Lang = "en" | "rw" | "sw" | "fr" | "zh";

const translations: Record<string, Partial<Record<Lang, string>>> = {
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
  "logistics.title": { en: "Reliable Delivery Services", rw: "Serivisi z'Ikohereza Zizewe" },
  "logistics.subtitle": { en: "Fast, secure, and trackable logistics across Africa and the world.", rw: "Gutwara byihuse, byizewe, kandi bishobora gukurikiranwa muri Afurika no ku isi hose." },
  "logistics.requestDelivery": { en: "Request Delivery", rw: "Saba Ikohereza" },
  "logistics.realTimeTracking": { en: "Real-time Tracking", rw: "Gukurikirana mu gihe nyacyo" },
  "logistics.pricingCalculator": { en: "Pricing Calculator", rw: "Kubara Igiciro" },
  "logistics.orderHistory": { en: "Order History", rw: "Amateka y'Ibyo Wakoze" },
  "logistics.submitRequest": { en: "Submit Request", rw: "Ohereza Icyifuzo" },
  "logistics.requestTitle": { en: "Request a Delivery", rw: "Saba Ikohereza" },
  "logistics.pickup": { en: "Pickup Location", rw: "Aho Gufata" },
  "logistics.dropoff": { en: "Drop-off Location", rw: "Aho Gushyira" },
  "logistics.weight": { en: "Weight (kg)", rw: "Uburemere (kg)" },
  "logistics.date": { en: "Preferred Date", rw: "Itariki Ushaka" },

  // Packaging
  "packaging.title": { en: "Professional Packaging Solutions", rw: "Ibisubizo by'Ubwenge byo Gupakira" },
  "packaging.subtitle": { en: "Secure and reliable packaging for all your needs.", rw: "Gupakira byizewe ku byo ukeneye byose." },
  "packaging.requestTitle": { en: "Request Packaging", rw: "Saba Gupakira" },
  "packaging.itemDesc": { en: "Item Description", rw: "Ibisobanuro by'Igicuruzwa" },
  "packaging.quantity": { en: "Quantity", rw: "Umubare" },
  "packaging.pickupDate": { en: "Pickup Date", rw: "Itariki yo Gufata" },
  "packaging.submit": { en: "Submit Request", rw: "Ohereza Icyifuzo" },

  // Marketplace
  "marketplace.title": { en: "Shop the Best Products", rw: "Gura Ibicuruzwa Byiza" },
  "marketplace.search": { en: "Search products...", rw: "Shakisha ibicuruzwa..." },
  "marketplace.filters": { en: "Filters", rw: "Guhitamo" },
  "marketplace.addToCart": { en: "Add to Cart", rw: "Shyira mu Gatebo" },

  // E-Library
  "elibrary.title": { en: "Read & Learn Online", rw: "Soma & Wige kuri Interineti" },
  "elibrary.subtitle": { en: "Browse our collection of books and read them directly in your browser — no downloads needed.", rw: "Reba itsinda ry'ibitabo byacu ubisome mu buryo butaziguye — nta gukurura bisabwa." },
  "elibrary.search": { en: "Search books by title or author...", rw: "Shakisha ibitabo ku izina cyangwa umwanditsi..." },
  "elibrary.readNow": { en: "Read Now", rw: "Soma Nonaha" },
  "elibrary.pages": { en: "pages", rw: "impapuro" },

  // Featured
  "featured.products": { en: "Featured Products", rw: "Ibicuruzwa Byihariye" },
  "featured.books": { en: "Featured Books", rw: "Ibitabo Byihariye" },
  "featured.viewAll": { en: "View all", rw: "Reba byose" },
  "featured.browseLibrary": { en: "Browse library", rw: "Reba ibitabo" },

  // CTA
  "cta.joinToday": { en: "Join Today", rw: "Iyandikishe Uyu Munsi" },
  "cta.title": { en: "Start for Just", rw: "Tangira ku" },
  "cta.subtitle": { en: "Try every ISOKO GROUP service free for 20 minutes, then 50 RWF for your first week and 200 RWF a month after. Pay with Mobile Money.", rw: "Gerageza serivisi zose za ISOKO GROUP ku buntu mu minota 20, hanyuma 50 RWF icyumweru cya mbere na 200 RWF buri kwezi. Ishyura ukoresheje Mobile Money." },
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
  "cta.getStarted": { en: "Get Started Now", rw: "Tangira Nonaha" },
  "cta.benefit1": { en: "Access all services — Logistics, Packaging, Marketplace, E-Library", rw: "Koresha serivisi zose — Gutwara, Gupakira, Isoko, Ibitabo" },
  "cta.benefit2": { en: "Connect with verified sellers and buyers", rw: "Hura n'abacuruzi n'abaguzi bemejwe" },
  "cta.benefit3": { en: "Read unlimited books online", rw: "Soma ibitabo bitagira ingano kuri interineti" },
  "cta.benefit4": { en: "Real-time tracking and order management", rw: "Gukurikirana no gucunga ibyo wakoze" },

  // Auth
  "auth.welcomeBack": { en: "Welcome Back", rw: "Murakaza Neza" },
  "auth.subtitle": { en: "Login or create an account to get started.", rw: "Injira cyangwa ufungure konti kugira ngo utangire." },
  "auth.login": { en: "Login", rw: "Injira" },
  "auth.register": { en: "Register", rw: "Iyandikishe" },
  "auth.email": { en: "Email", rw: "Imeri" },
  "auth.password": { en: "Password", rw: "Ijambo ry'Ibanga" },
  "auth.fullName": { en: "Full Name", rw: "Amazina Yose" },
  "auth.createAccount": { en: "Create Account", rw: "Fungura Konti" },
  "auth.forgot": { en: "Forgot your password?", rw: "Wibagiwe ijambo ry'ibanga?" },
  "auth.forgotTitle": { en: "Reset your password", rw: "Hindura ijambo ry'ibanga" },
  "auth.forgotSubtitle": { en: "Enter your account's email and we'll send you a link to choose a new password.", rw: "Andika imeri ya konti yawe tukoherereze link yo guhitamo ijambo ry'ibanga rishya." },
  "auth.sendLink": { en: "Send reset link", rw: "Ohereza link" },
  "auth.linkSent": { en: "If an account uses this email, a reset link is on its way. It works once and expires in 1 hour. Check your spam folder too.", rw: "Niba hari konti ikoresha iyi meri, link iraje. Ikora rimwe gusa kandi ita agaciro nyuma y'isaha 1. Reba no muri spam." },
  "auth.tooMany": { en: "Too many requests. Wait a minute and try again.", rw: "Wasabye kenshi. Tegereza umunota umwe wongere ugerageze." },
  "auth.backToLogin": { en: "Back to login", rw: "Subira ku kwinjira" },
  "auth.newPassword": { en: "New password", rw: "Ijambo ry'ibanga rishya" },
  "auth.confirmPassword": { en: "Repeat new password", rw: "Subiramo ijambo ry'ibanga rishya" },
  "auth.passwordRule": { en: "At least 8 characters.", rw: "Nibura inyuguti 8." },
  "auth.passwordMismatch": { en: "The two passwords are different.", rw: "Amagambo y'ibanga yombi ntabwo ahuye." },
  "auth.savePassword": { en: "Save new password", rw: "Bika ijambo ry'ibanga rishya" },
  "auth.passwordSaved": { en: "Password changed. You're signed in here and signed out everywhere else.", rw: "Ijambo ry'ibanga ryahinduwe. Winjiye hano, kandi wasohowe ahandi hose." },
  "auth.linkInvalid": { en: "This reset link is invalid or has expired. Ask for a new one.", rw: "Iyi link ntikora cyangwa yataye agaciro. Saba indi nshya." },
  "auth.newLink": { en: "Get a new link", rw: "Saba link nshya" },
  "auth.subscription": { en: "Free for 20 minutes, then 50 RWF for your first week and 200 RWF a month", rw: "Ubuntu mu minota 20, hanyuma 50 RWF icyumweru cya mbere na 200 RWF buri kwezi" },

  // Seller
  "seller.title": { en: "Become a Seller", rw: "Ba Umucuruzi" },
  "seller.subtitle": { en: "Join our marketplace and reach thousands of buyers across Africa and the world.", rw: "Injira mu isoko ryacu uhure n'abaguzi ibihumbi muri Afurika no ku isi hose." },
  "seller.rules": { en: "Seller Rules", rw: "Amategeko y'Abacuruzi" },
  "seller.form": { en: "Registration Form", rw: "Ifishi yo Kwiyandikisha" },
  "seller.fullName": { en: "Full Name", rw: "Amazina Yose" },
  "seller.businessName": { en: "Business Name", rw: "Izina ry'Ubucuruzi" },
  "seller.phone": { en: "Phone", rw: "Telefoni" },
  "seller.idNumber": { en: "ID Number (for verification)", rw: "Nimero y'Indangamuntu" },
  "seller.submit": { en: "Submit Application", rw: "Ohereza Ubusabe", sw: "Tuma Ombi", fr: "Envoyer la demande", zh: "提交申请" },
  "seller.reapply": { en: "Re-apply", rw: "Saba kongera", sw: "Omba tena", fr: "Postuler à nouveau", zh: "重新申请" },
  "seller.submitNewApplication": { en: "Submit a new application", rw: "Ohereza ubusabe bushya", sw: "Tuma ombi mpya", fr: "Soumettre une nouvelle demande", zh: "提交新的申请" },
  "seller.formInstructions": { en: "All fields are required. Please provide accurate information — applications with missing or invalid details will be rejected.", rw: "Imirima yose irakenewe. Nyamuneka utange amakuru y'ukuri — ubusabe bufite amakuru abura cyangwa atari yo buzahana.", sw: "Sehemu zote ni muhimu. Tafadhali toa taarifa sahihi — maombi yenye taarifa zinazokosekana au batili yatakataliwa.", fr: "Tous les champs sont obligatoires. Veuillez fournir des informations exactes — les candidatures incomplètes ou invalides seront rejetées.", zh: "所有字段均为必填项。请提供准确的信息——缺失或无效信息的申请将被拒绝。" },

  // Footer
  "footer.services": { en: "Services", rw: "Serivisi" },
  "footer.company": { en: "Company", rw: "Ikigo" },
  "footer.contact": { en: "Contact", rw: "Twandikire" },
  "footer.tagline": { en: "Everything You Need in One Platform — Logistics, Marketplace & Knowledge Combined.", rw: "Ibyo Ukeneye Byose kuri Urubuga Rumwe — Gutwara, Isoko n'Ubumenyi Hamwe." },
  "footer.aboutUs": { en: "About Us", rw: "Abo Turi Bo" },
  "footer.rights": { en: "All rights reserved.", rw: "Uburenganzira bwose bwabikiwe." },

  // Admin
  "admin.title": { en: "Admin Dashboard", rw: "Ubuyobozi" },
  "admin.users": { en: "Users", rw: "Abakoresha" },
  "admin.orders": { en: "Orders", rw: "Ibyo Bakoze" },
  "admin.commissions": { en: "Commissions", rw: "Komisiyo" },
  "admin.analytics": { en: "Analytics", rw: "Isesengura" },
  "admin.totalUsers": { en: "Total Users", rw: "Abakoresha Bose" },
  "admin.totalOrders": { en: "Total Orders", rw: "Ibyo Bakoze Byose" },
  "admin.revenue": { en: "Revenue", rw: "Amafaranga Yinjiye" },
  "admin.commission": { en: "Commission (10%)", rw: "Komisiyo (10%)" },
};

type I18nContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLang] = useState<Lang>("en");
  const t = (key: string) => translations[key]?.[lang] ?? translations[key]?.en ?? key;
  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
