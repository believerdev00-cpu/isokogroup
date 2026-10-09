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
    {/* One invitation into the Initiative, in its own band so the hero is left alone */}
    <GlobalInitiativeCTA />
    <CompanyStory />
    <ServicesSection />
    <PartnersStrip />
    <CTASection />
    <Footer />
  </div>
);

export default Index;
