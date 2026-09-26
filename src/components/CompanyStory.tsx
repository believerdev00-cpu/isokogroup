import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpen, Briefcase, Check, ChevronLeft, ChevronRight, Film, Gift, GraduationCap, MapPin, Music,
  Package, Pause, Play, Plane, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles, Truck, Volume2, VolumeX,
  type LucideIcon, type LucideProps,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isLiteMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Homepage: what ISOKO GROUP does, told in moving pictures so a visitor who
// can't read (or doesn't read English) still understands it. Each scene is one
// service; a voice can read it aloud where the browser has a voice for the
// visitor's language. The scenes play while the section is on screen.

const SCENE_MS = 6500;

/* ---------- Drawing pieces (one 400 x 240 picture per scene) ---------- */

const Sky = ({ from = "#fee2e2", to = "#fff7ed" }: { from?: string; to?: string }) => (
  <>
    <defs>
      <linearGradient id="story-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </linearGradient>
    </defs>
    <rect width="400" height="240" fill="url(#story-sky)" />
  </>
);

// Rwanda: hills everywhere
const Hills = () => (
  <g>
    <path d="M0 172 Q50 128 110 160 T230 150 T400 138 V240 H0Z" fill="#9fd4a0" />
    <path d="M0 204 Q90 164 180 196 T400 186 V240 H0Z" fill="#5aa867" />
  </g>
);

const Sun = () => <circle className="story-pulse" cx="345" cy="48" r="18" fill="#fbbf24" />;

const Person = ({ x, y, shirt, className, delay = 0 }: { x: number; y: number; shirt: string; className?: string; delay?: number }) => (
  <g className={className} style={{ animationDelay: `${delay}s` }}>
    <circle cx={x} cy={y} r="9" fill="#7c4a2d" />
    <path d={`M${x - 14} ${y + 36} Q${x} ${y + 2} ${x + 14} ${y + 36}Z`} fill={shirt} />
  </g>
);

const Icon = ({ icon: I, x, y, size = 24, className = "text-primary", ...rest }: { icon: ComponentType<LucideProps>; x: number; y: number; size?: number } & LucideProps) => (
  <I x={x - size / 2} y={y - size / 2} width={size} height={size} className={className} {...rest} />
);

const Bubble = ({ x, y, icon, delay }: { x: number; y: number; icon: LucideIcon; delay: number }) => (
  <g className="story-pop" style={{ animationDelay: `${delay}s` }}>
    <circle cx={x} cy={y} r="22" fill="#fff" className="stroke-primary" strokeWidth="3" />
    <Icon icon={icon} x={x} y={y} />
  </g>
);

const Done = ({ x, y, delay, r = 11 }: { x: number; y: number; delay: number; r?: number }) => (
  <g className="story-pop" style={{ animationDelay: `${delay}s` }}>
    <circle cx={x} cy={y} r={r} fill="#16a34a" />
    <Icon icon={Check} x={x} y={y} size={r * 1.3} className="text-white" strokeWidth={3.5} />
  </g>
);

const House = ({ x, wall }: { x: number; wall: string }) => (
  <g>
    <rect x={x} y="160" width="50" height="36" fill={wall} />
    <polygon points={`${x - 6},162 ${x + 25},136 ${x + 56},162`} className="fill-primary" />
    <rect x={x + 19} y="176" width="12" height="20" fill="#92400e" />
  </g>
);

const Phone = ({ x, y, w = 70, h = 130 }: { x: number; y: number; w?: number; h?: number }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx="12" fill="#111827" />
    <rect x={x + 6} y={y + 12} width={w - 12} height={h - 24} rx="4" fill="#fff" />
  </g>
);

/* ---------- The scenes ---------- */

const IntroArt = () => (
  <>
    <Sky />
    <Sun />
    <Hills />
    {[[95, 62], [305, 62], [62, 128], [338, 128], [118, 190], [282, 190]].map(([x, y], i) => (
      <path key={i} d={`M200 110 L${x} ${y}`} className="story-draw stroke-primary" pathLength={1} strokeWidth="2" strokeDasharray="1" fill="none" style={{ animationDelay: `${0.4 + i * 0.2}s`, opacity: 0.5 }} />
    ))}
    <g className="story-rise">
      <Phone x={165} y={42} />
      <circle cx="200" cy="100" r="21" className="fill-primary" />
      <text x="200" y="104" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">ISOKO</text>
      <rect x="182" y="132" width="36" height="5" rx="2.5" fill="#e5e7eb" />
      <rect x="187" y="142" width="26" height="5" rx="2.5" fill="#e5e7eb" />
    </g>
    {[Truck, Package, ShoppingBag, GraduationCap, Film, Plane].map((icon, i) => {
      const [x, y] = [[95, 62], [305, 62], [62, 128], [338, 128], [118, 190], [282, 190]][i];
      return <Bubble key={i} x={x} y={y} icon={icon} delay={0.7 + i * 0.25} />;
    })}
  </>
);

const DeliveryArt = () => (
  <>
    <Sky />
    <Sun />
    <Hills />
    <path d="M20 208 C120 188 260 226 380 198" stroke="#6b7280" strokeWidth="14" fill="none" strokeLinecap="round" />
    <path d="M20 208 C120 188 260 226 380 198" stroke="#fff" strokeWidth="2" strokeDasharray="8 8" fill="none" />
    <House x={28} wall="#fde68a" />
    <House x={318} wall="#bfdbfe" />
    {/* the moto rides from the first house to the second */}
    <g className="story-drive">
      <g className="story-bob">
        <rect x="262" y="170" width="18" height="16" fill="#d97706" stroke="#92400e" />
        <rect x="262" y="176" width="18" height="3" className="fill-primary" />
        <path d="M268 198 L288 186 L312 190 L308 199 Z" className="fill-primary" />
        <circle cx="289" cy="164" r="7" fill="#1f2937" />
        <rect x="283" y="171" width="12" height="17" rx="4" fill="#374151" />
      </g>
      <circle cx="273" cy="202" r="9" fill="#111827" />
      <circle cx="273" cy="202" r="3.5" fill="#9ca3af" />
      <circle cx="307" cy="202" r="9" fill="#111827" />
      <circle cx="307" cy="202" r="3.5" fill="#9ca3af" />
    </g>
    <g className="story-drop" style={{ animationDelay: "2.5s" }}>
      <Icon icon={MapPin} x={343} y={112} size={32} className="text-primary" fill="#fff" />
    </g>
    <Done x={372} y={128} delay={3} />
  </>
);

const PackagingArt = () => (
  <>
    <Sky from="#fff7ed" to="#fef3c7" />
    <rect x="30" y="186" width="340" height="12" fill="#a16207" />
    <rect x="50" y="198" width="10" height="42" fill="#854d0e" />
    <rect x="340" y="198" width="10" height="42" fill="#854d0e" />
    {/* the box closes, is taped and labelled */}
    <rect x="150" y="128" width="80" height="58" fill="#d6a064" stroke="#a0702f" strokeWidth="2" />
    <rect className="story-fold" style={{ animationDelay: "0.3s" }} x="150" y="112" width="40" height="16" fill="#e2b27a" stroke="#a0702f" />
    <rect className="story-fold" style={{ animationDelay: "0.6s" }} x="190" y="112" width="40" height="16" fill="#e2b27a" stroke="#a0702f" />
    <rect className="story-type fill-primary" style={{ animationDelay: "1.1s" }} x="150" y="124" width="80" height="8" />
    <g className="story-pop" style={{ animationDelay: "1.5s" }}>
      <rect x="170" y="146" width="40" height="22" rx="3" fill="#fff" />
      <text x="190" y="161" textAnchor="middle" fontSize="9" fontWeight="800" className="fill-primary">ISOKO</text>
    </g>
    {/* bags for shops */}
    <g className="story-drop" style={{ animationDelay: "1.9s" }}>
      <path d="M270 136 C270 116 296 116 296 136" className="stroke-primary" strokeWidth="4" fill="none" />
      <path d="M260 136 H306 L302 186 H264 Z" className="fill-primary" />
      <text x="283" y="166" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">ISOKO</text>
    </g>
    <g className="story-drop" style={{ animationDelay: "2.2s" }}>
      <path d="M92 152 C92 138 110 138 110 152" stroke="#8b6a3e" strokeWidth="3" fill="none" />
      <path d="M84 152 H118 L115 186 H87 Z" fill="#c8a26b" />
    </g>
    <g className="story-pop" style={{ animationDelay: "2.6s" }}>
      <Icon icon={Sparkles} x={318} y={104} size={26} className="text-amber-500" />
    </g>
  </>
);

const MarketArt = () => (
  <>
    <Sky />
    <Hills />
    {/* a market stall */}
    <rect x="44" y="92" width="5" height="100" fill="#78350f" />
    <rect x="181" y="92" width="5" height="100" fill="#78350f" />
    {[0, 1, 2, 3, 4].map((i) => (
      <g key={i}>
        <rect x={40 + i * 30} y="80" width="30" height="20" className={i % 2 ? "fill-white" : "fill-primary"} />
        <circle cx={55 + i * 30} cy="100" r="15" className={i % 2 ? "fill-white" : "fill-primary"} clipPath="url(#story-scallop)" />
      </g>
    ))}
    <defs>
      <clipPath id="story-scallop"><rect x="0" y="100" width="400" height="16" /></clipPath>
    </defs>
    <Person x={150} y={124} shirt="#0ea5e9" className="story-bob" />
    <rect x="40" y="150" width="150" height="42" fill="#92400e" />
    <circle cx="62" cy="143" r="8" fill="#f97316" />
    <circle cx="79" cy="143" r="8" fill="#84cc16" />
    <circle cx="70" cy="132" r="7" fill="#ef4444" />
    <Icon icon={Shirt} x={112} y={138} size={24} className="text-sky-700" fill="#7dd3fc" />
    {/* the goods go into the cart on the phone, and it's paid */}
    <Phone x={262} y={40} w={72} h={150} />
    <g className="story-fly-in" style={{ animationDelay: "0.7s" }}><circle cx="289" cy="104" r="6" fill="#f97316" /></g>
    <g className="story-fly-in" style={{ animationDelay: "1.1s" }}><circle cx="304" cy="106" r="6" fill="#84cc16" /></g>
    <g className="story-fly-in" style={{ animationDelay: "1.5s" }}><Icon icon={Shirt} x={297} y={86} size={16} className="text-sky-700" fill="#7dd3fc" /></g>
    <Icon icon={ShoppingCart} x={298} y={126} size={30} />
    <g className="story-pop" style={{ animationDelay: "2.3s" }}>
      <rect x="275" y="150" width="46" height="20" rx="10" fill="#facc15" />
      <Icon icon={Check} x={298} y={160} size={14} className="text-black" strokeWidth={3.5} />
    </g>
  </>
);

const LearningArt = () => (
  <>
    <Sky from="#e0e7ff" to="#f5f3ff" />
    {/* the board fills with lessons */}
    <rect x="40" y="38" width="150" height="90" rx="4" fill="#14532d" stroke="#a16207" strokeWidth="4" />
    {[[55, 58, 90], [55, 74, 112], [55, 90, 70], [55, 106, 98]].map(([x, y, w], i) => (
      <rect key={i} className="story-type" style={{ animationDelay: `${0.3 + i * 0.35}s` }} x={x} y={y} width={w} height="4" rx="2" fill="#fff" />
    ))}
    {/* a book whose pages turn */}
    <path d="M124 194 Q162 180 200 194 L200 148 Q162 134 124 148Z" className="fill-primary" transform="translate(-4 4)" />
    <path d="M200 194 Q238 180 276 194 L276 148 Q238 134 200 148Z" className="fill-primary" transform="translate(4 4)" />
    <path d="M124 190 Q162 176 200 190 V146 Q162 132 124 146Z" fill="#fff" stroke="#d1d5db" />
    <path d="M200 190 Q238 176 276 190 V146 Q238 132 200 146Z" fill="#fff" stroke="#d1d5db" />
    <path className="story-turn" d="M200 190 Q238 176 276 190 V146 Q238 132 200 146Z" fill="#f9fafb" stroke="#d1d5db" />
    {/* the student gets a cap and a certificate */}
    <Person x={330} y={114} shirt="#6366f1" />
    <g className="story-drop" style={{ animationDelay: "1.4s" }}>
      <polygon points="310,102 330,92 350,102 330,112" fill="#111827" />
      <rect x="346" y="102" width="2" height="12" fill="#facc15" />
    </g>
    <g className="story-pop" style={{ animationDelay: "2.2s" }}>
      <rect x="214" y="30" width="66" height="46" rx="3" fill="#fffbeb" stroke="#d97706" strokeWidth="2" />
      <rect x="224" y="42" width="40" height="3" fill="#d97706" />
      <rect x="224" y="51" width="30" height="3" fill="#fcd34d" />
      <circle cx="266" cy="64" r="8" fill="#f59e0b" />
    </g>
  </>
);

const FunArt = () => (
  <>
    <defs>
      <linearGradient id="story-screen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ef4444" />
        <stop offset="1" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
    <rect width="400" height="240" fill="#1e1b4b" />
    {[[40, 30], [120, 18], [290, 24], [360, 60], [70, 90]].map(([x, y], i) => (
      <circle key={i} className="story-pulse" style={{ animationDelay: `${i * 0.4}s` }} cx={x} cy={y} r="2.5" fill="#fde68a" />
    ))}
    <rect x="100" y="36" width="200" height="120" rx="10" fill="#111827" stroke="#374151" strokeWidth="4" />
    <rect className="story-rise" x="108" y="44" width="184" height="104" rx="4" fill="url(#story-screen)" />
    <g className="story-pulse" style={{ animationDelay: "0.8s" }}>
      <polygon points="186,78 186,118 220,98" fill="#fff" />
    </g>
    <rect x="186" y="156" width="28" height="14" fill="#374151" />
    <rect x="160" y="168" width="80" height="6" rx="3" fill="#4b5563" />
    {[[40, 140, 0], [336, 120, 1.2], [70, 190, 2]].map(([x, y, d], i) => (
      <g key={i} className="story-float" style={{ animationDelay: `${d}s` }}>
        <Icon icon={Music} x={x} y={y} size={28} className="text-pink-300" />
      </g>
    ))}
    {[150, 200, 250].map((x, i) => (
      <g key={x} className="story-bob" style={{ animationDelay: `${i * 0.5}s` }}>
        <circle cx={x} cy="208" r="13" fill="#312e81" />
        <rect x={x - 20} y="220" width="40" height="30" rx="14" fill="#312e81" />
      </g>
    ))}
  </>
);

const BusinessArt = () => (
  <>
    <Sky from="#e0f2fe" to="#f8fafc" />
    <rect x="30" y="188" width="340" height="10" fill="#a16207" />
    {/* a laptop writing code */}
    <rect x="70" y="92" width="130" height="85" rx="6" fill="#1f2937" />
    <rect x="78" y="100" width="114" height="69" fill="#0f172a" />
    {[[86, 110, 50, "#f87171"], [94, 120, 70, "#60a5fa"], [94, 130, 40, "#34d399"], [86, 140, 60, "#fbbf24"], [94, 150, 80, "#a78bfa"]].map(([x, y, w, c], i) => (
      <rect key={i} className="story-type" style={{ animationDelay: `${0.3 + i * 0.3}s` }} x={x as number} y={y as number} width={w as number} height="4" rx="2" fill={c as string} />
    ))}
    <path d="M55 177 H215 L205 188 H65Z" fill="#9ca3af" />
    {/* the business grows */}
    <path d="M250 80 V186 H365" stroke="#94a3b8" strokeWidth="3" fill="none" />
    {[[262, 40], [290, 64], [318, 92], [346, 70]].map(([x, h], i) => (
      <rect key={i} className="story-grow fill-primary" opacity={i === 2 ? 1 : 0.55} style={{ animationDelay: `${0.8 + i * 0.25}s` }} x={x} y={186 - h * 1.1} width="18" height={h * 1.1} rx="2" />
    ))}
    <path className="story-draw" style={{ animationDelay: "2s" }} d="M256 150 L292 124 L318 132 L360 84" pathLength={1} strokeDasharray="1" stroke="#16a34a" strokeWidth="4" fill="none" strokeLinecap="round" />
    <g className="story-pop" style={{ animationDelay: "2.8s" }}>
      <circle cx="360" cy="84" r="14" fill="#16a34a" />
      <Icon icon={Briefcase} x={360} y={84} size={16} className="text-white" />
    </g>
  </>
);

const TravelArt = () => (
  <>
    <Sky from="#bae6fd" to="#f0f9ff" />
    <Sun />
    {/* volcanoes, hills and a lake */}
    <path d="M200 176 L262 88 L324 176Z" fill="#64748b" />
    <path d="M280 176 L330 110 L380 176Z" fill="#475569" />
    <g className="story-drift"><ellipse cx="262" cy="92" rx="26" ry="8" fill="#fff" opacity="0.9" /></g>
    <g className="story-drift" style={{ animationDelay: "-4s" }}><ellipse cx="80" cy="50" rx="30" ry="9" fill="#fff" opacity="0.9" /></g>
    <Hills />
    <ellipse cx="96" cy="216" rx="64" ry="11" fill="#60a5fa" />
    <g className="story-plane">
      <path d="M130 64 L170 60 L182 46 L188 48 L182 62 L204 64 L182 66 L188 80 L182 82 L170 68 Z" fill="#fff" stroke="#334155" strokeWidth="1.5" />
    </g>
    {/* a safari car on the road */}
    <path d="M150 226 C220 214 300 232 400 218" stroke="#a8a29e" strokeWidth="10" fill="none" />
    <g className="story-drive">
      <rect x="292" y="198" width="40" height="18" rx="4" fill="#15803d" />
      <rect x="300" y="190" width="24" height="10" rx="2" fill="#86efac" />
      <circle cx="302" cy="218" r="6" fill="#111827" />
      <circle cx="324" cy="218" r="6" fill="#111827" />
    </g>
    <g className="story-drop" style={{ animationDelay: "2.2s" }}>
      <Icon icon={MapPin} x={262} y={70} size={28} className="text-primary" fill="#fff" />
    </g>
  </>
);

const PayArt = () => (
  <>
    <Sky />
    <Hills />
    {/* free first, then a small payment by phone */}
    <g className="story-pop" style={{ animationDelay: "0.3s" }}>
      <circle cx="80" cy="96" r="34" fill="#fff" className="stroke-primary" strokeWidth="3" />
      <Icon icon={Gift} x={80} y={96} size={36} />
    </g>
    <path className="story-draw stroke-primary" style={{ animationDelay: "0.9s" }} d="M122 96 H150" pathLength={1} strokeDasharray="1" strokeWidth="4" strokeLinecap="round" />
    <g className="story-rise" style={{ animationDelay: "0.6s" }}>
      <Phone x={160} y={28} w={80} h={170} />
      <rect x="166" y="40" width="68" height="22" className="fill-primary" />
      <Icon icon={Smartphone} x={200} y={51} size={16} className="text-white" />
      <rect x="178" y="150" width="44" height="18" rx="9" fill="#facc15" />
    </g>
    <Done x={200} y={110} r={24} delay={1.9} />
    {[[292, 60, 0.8], [318, 90, 1.1], [296, 120, 1.4]].map(([x, y, d], i) => (
      <g key={i} className="story-drop" style={{ animationDelay: `${d}s` }}>
        <circle cx={x} cy={y} r="14" fill="#facc15" stroke="#ca8a04" strokeWidth="3" />
        <circle cx={x} cy={y} r="6" fill="none" stroke="#ca8a04" strokeWidth="2" />
      </g>
    ))}
    <g className="story-pop" style={{ animationDelay: "2.4s" }}>
      <Icon icon={Sparkles} x={250} y={40} size={24} className="text-amber-500" />
    </g>
  </>
);

type Scene = { id: string; icon: LucideIcon; tint: string; path: string; art: () => JSX.Element };

const SCENES: Scene[] = [
  { id: "intro", icon: Sparkles, tint: "bg-primary", path: "/services", art: IntroArt },
  { id: "delivery", icon: Truck, tint: "bg-red-600", path: "/logistics/delivery", art: DeliveryArt },
  { id: "packaging", icon: Package, tint: "bg-amber-600", path: "/logistics/packaging", art: PackagingArt },
  { id: "market", icon: ShoppingBag, tint: "bg-orange-500", path: "/marketplace", art: MarketArt },
  { id: "learning", icon: BookOpen, tint: "bg-indigo-600", path: "/training-center", art: LearningArt },
  { id: "fun", icon: Film, tint: "bg-violet-700", path: "/entertainment", art: FunArt },
  { id: "business", icon: Briefcase, tint: "bg-slate-700", path: "/software", art: BusinessArt },
  { id: "travel", icon: Plane, tint: "bg-emerald-700", path: "/travel", art: TravelArt },
  { id: "pay", icon: Smartphone, tint: "bg-green-600", path: "/login", art: PayArt },
];

/** A browser voice for the visitor's language, if this device has one */
function useVoice(lang: string) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => setVoice(window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null);
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [lang]);
  return voice;
}

const CompanyStory = () => {
  const { t, lang } = useI18n();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !isLiteMotion());
  const [sound, setSound] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const voice = useVoice(lang);
  const scene = SCENES[index];
  const caption = t(`story.${scene.id}`);
  const running = playing && inView;
  const speaking = sound && voice !== null;

  // Play only while the story is on screen
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Next scene: after the voice finishes reading it, or after a few seconds
  useEffect(() => {
    if (!running) return;
    let done = false;
    const timers: number[] = [];
    const next = () => {
      if (done) return;
      done = true;
      setIndex((i) => (i + 1) % SCENES.length);
    };
    if (speaking) {
      const u = new SpeechSynthesisUtterance(caption);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.92;
      u.onend = () => timers.push(window.setTimeout(next, 1200));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      timers.push(window.setTimeout(next, 20000)); // in case the voice never says it's done
    } else {
      timers.push(window.setTimeout(next, SCENE_MS));
    }
    return () => {
      done = true;
      timers.forEach((id) => window.clearTimeout(id));
      if (speaking) window.speechSynthesis.cancel();
    };
  }, [running, index, speaking, caption, voice]);

  const go = (i: number) => setIndex((i + SCENES.length) % SCENES.length);
  const toggleSound = () => {
    setSound((s) => !s);
    setPlaying(true);
  };

  const Art = scene.art;
  return (
    <section ref={ref} id="what-we-do" className="scroll-mt-20 border-b border-border py-12 md:py-20" aria-roledescription="carousel" aria-label={t("story.title")}>
      <div className="container max-w-4xl">
        <div className="mb-6 text-center" data-aos="fade-up">
          <h2 className="font-display text-3xl font-bold md:text-4xl">{t("story.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("story.sub")}</p>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-card shadow-xl">
          <div className="relative">
            <svg
              key={index}
              viewBox="0 0 400 240"
              className={cn("story-stage story-enter block h-auto w-full", !running && "is-still")}
              role="img"
              aria-label={caption}
            >
              <Art />
            </svg>
            {!speaking && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
                <div
                  key={`${index}-${running}`}
                  className="story-progress h-full bg-primary"
                  style={{ animationDuration: `${SCENE_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                />
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex items-start gap-3" aria-live={running ? "off" : "polite"}>
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white", scene.tint)}>
                <scene.icon className="h-5 w-5" />
              </span>
              <p className="min-h-[6.75rem] pt-1.5 sm:min-h-[3.5rem] text-lg font-medium leading-snug sm:text-xl">{caption}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => go(index - 1)} className="story-btn" aria-label={t("story.prev")}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setPlaying((p) => !p)} className="story-btn" aria-label={playing ? t("story.pause") : t("story.play")}>
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => go(index + 1)} className="story-btn" aria-label={t("story.next")}>
                <ChevronRight className="h-5 w-5" />
              </button>
              {voice && (
                <button type="button" onClick={toggleSound} className={cn("story-btn", sound && "border-primary bg-primary text-primary-foreground")} aria-pressed={sound} aria-label={t("story.listen")}>
                  {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
              )}
              <Link to={scene.path} className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground press">
                {t("story.open")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* One picture button per scene: no reading needed to jump around */}
            <div className="flex justify-between gap-1" role="tablist">
              {SCENES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={t(`story.${s.id}`)}
                  onClick={() => go(i)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                    i === index ? cn(s.tint, "border-transparent text-white") : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <s.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanyStory;
