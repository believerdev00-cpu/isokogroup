import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import IntakeTicker from "@/components/IntakeTicker";
import GlobalInitiativeCTA from "@/components/GlobalInitiativeCTA";
import HeroDonateOverlay from "@/components/HeroDonateOverlay";
import CompanyStory from "@/components/CompanyStory";
import ServicesSection from "@/components/ServicesSection";
import CTASection from "@/components/CTASection";
import PartnersStrip from "@/components/PartnersStrip";
import Footer from "@/components/Footer";

const Index = () => (
  <div className="min-h-screen">
    <Header />
    {/* Straight under the navigation: new Training Center intakes announce themselves */}
    <IntakeTicker />
    {/*
      The hero is not changed to make room for the Initiative. It stays exactly
      as it is and the invitation is laid over it from here, which is what this
      wrapper is for: it gives the overlay something to position against.
    */}
    <div className="relative">
      <HeroSection />
      <HeroDonateOverlay />
    </div>
    {/* Under the hero: the same way in, for anyone who scrolled past it */}
    <GlobalInitiativeCTA />
    <CompanyStory />
    <ServicesSection />
    <PartnersStrip />
    <CTASection />
    <Footer />
  </div>
);

export default Index;
