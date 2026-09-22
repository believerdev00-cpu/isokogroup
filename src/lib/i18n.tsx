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
  "nav.about": { en: "About", rw: "Ibyerekeye", sw: "Kuhusu", fr: "À propos", zh: "关于" },
  "nav.dashboard": { en: "Dashboard", rw: "Ikarita", sw: "Dashibodi", fr: "Tableau de bord", zh: "仪表盘" },
  "nav.insights": { en: "Insights", rw: "Ibyiyumvo", sw: "Uchambuzi", fr: "Aperçus", zh: "洞察" },
  "nav.orders": { en: "Orders", rw: "Amabwiriza", sw: "Maagizo", fr: "Commandes", zh: "订单" },
  "nav.seller": { en: "Seller", rw: "Umucuruzi", sw: "Muuzaji", fr: "Vendeur", zh: "卖家" },
  "nav.plan": { en: "Plan", rw: "Gahunda", sw: "Mpango", fr: "Forfait", zh: "计划" },
  "nav.myOrders": { en: "My Orders", rw: "Amabwiriza yanjye", sw: "Maagizo yangu", fr: "Mes commandes", zh: "我的订单" },
  "nav.subscription": { en: "Subscription", rw: "Iyandikishe", sw: "Usajili", fr: "Abonnement", zh: "订阅" },

  // Hero
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
  "services.academyTitle": { en: "Tech Academy", rw: "Ishuri rya Tekinoloji", sw: "Chuo cha Teknolojia", fr: "Académie tech", zh: "科技学院" },
  "services.academyDesc": { en: "Learn coding, design and digital skills from Isoko Academy.", rw: "Wige gutunganya porogaramu, igishushanyo n'ubumenyi bw'ikoranabuhanga muri Isoko Academy.", sw: "Jifunze uandishi wa programu, muundo na ujuzi wa kidijitali kutoka Isoko Academy.", fr: "Apprenez le codage, le design et les compétences numériques avec Isoko Academy.", zh: "从 ISOKO 学院学习编码、设计和数字技能。" },

  // Logistics
  "logistics.title": { en: "Reliable Delivery Services", rw: "Serivisi z'Ikohereza Zizewe" },
  "logistics.subtitle": { en: "Fast, secure, and trackable logistics across Rwanda.", rw: "Gutwara byihuse, byizewe, kandi bishobora gukurikiranwa mu Rwanda hose." },
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
  "cta.subtitle": { en: "Unlock all ISOKO GROUP services with a single affordable subscription. Pay via Mobile Money, Card, or PayPal.", rw: "Fungura serivisi zose za ISOKO GROUP n'ubwishyu bumwe bworoshye. Ishyura ukoresheje Mobile Money, Ikarita, cyangwa PayPal." },
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
  "auth.subscription": { en: "Subscription: 200 RWF to unlock all services", rw: "Kwiyandikisha: 200 RWF kugira ngo ufungure serivisi zose" },

  // Seller
  "seller.title": { en: "Become a Seller", rw: "Ba Umucuruzi" },
  "seller.subtitle": { en: "Join our marketplace and reach thousands of buyers across Rwanda.", rw: "Injira mu isoko ryacu uhure n'abaguzi ibihumbi mu Rwanda hose." },
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
