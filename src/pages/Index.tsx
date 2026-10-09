import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import IntakeTicker from "@/components/IntakeTicker";
import GlobalInitiativeCTA from "@/components/GlobalInitiativeCTA";
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
    <HeroSection />
    {/* Under the hero, left untouched: the way into the Global Initiative */}
    <GlobalInitiativeCTA />
    <CompanyStory />
    <ServicesSection />
    <PartnersStrip />
    <CTASection />
    <Footer />
  </div>
);

export default Index;
