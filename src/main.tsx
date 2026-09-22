import { createRoot } from "react-dom/client";
import AOS from "aos";
import "aos/dist/aos.css";
import App from "./App.tsx";
import "./index.css";
import { initMotion, isLiteMotion } from "./lib/motion";

initMotion();

// Soft section reveals while scrolling; off when motion should be light
AOS.init({
  duration: 500,
  easing: "ease-out-cubic",
  once: true,
  offset: 40,
  disable: isLiteMotion,
});

createRoot(document.getElementById("root")!).render(<App />);
