import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import CompanyStory from "@/components/CompanyStory";
import ServicesSection from "@/components/ServicesSection";
import CTASection from "@/components/CTASection";
import PartnersStrip from "@/components/PartnersStrip";
import Footer from "@/components/Footer";

const Index = () => (
  <div className="min-h-screen">
    <Header />
    <HeroSection />
    <CompanyStory />
    <ServicesSection />
    <PartnersStrip />
    <CTASection />
    <Footer />
  </div>
);

export default Index;
