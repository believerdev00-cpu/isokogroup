import logistics from "./logistics.webp";
import packaging from "./packaging.webp";
import sourcing from "./sourcing.webp";
import supplyChain from "./supply-chain.webp";
import marketplace from "./marketplace.webp";
import consultancy from "./consultancy.webp";
import data from "./data.webp";
import software from "./software.webp";
import training from "./training.webp";
import library from "./library.webp";
import travel from "./travel.webp";
import travelHotel from "./travel-hotel.webp";

// Real photos behind each service's hero slide, keyed by service id (src/lib/services.ts).
// All are openly licensed (CC, Unsplash or Mixkit); CC BY and CC BY-SA require the credit shown on the slide.
export type HeroPhoto = {
  src: string;
  /** A looping clip to play instead, from public/videos (src is then its poster and reduced-motion fallback) */
  video?: string;
  alt: string;
  credit: string;
  license: string;
  source: string;
};

export const HERO_PHOTOS: Record<string, HeroPhoto> = {
  logistics: {
    src: logistics, alt: "A courier carrying bagged and boxed deliveries",
    credit: "Meanwell Packaging", license: "CC BY 2.0", source: "https://commons.wikimedia.org/w/index.php?curid=120365139",
  },
  packaging: {
    src: packaging, alt: "Kraft paper bags, boxes and takeaway packaging",
    credit: "Meanwell Packaging", license: "CC BY 2.0", source: "https://commons.wikimedia.org/w/index.php?curid=120365120",
  },
  sourcing: {
    src: sourcing, alt: "Forklifts moving goods inside a warehouse",
    credit: "TLSuda", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/w/index.php?curid=55068648",
  },
  "supply-chain": {
    src: supplyChain, alt: "Shipping containers and cranes at a container port",
    credit: "Reb42", license: "CC BY 3.0", source: "https://commons.wikimedia.org/w/index.php?curid=8893647",
  },
  marketplace: {
    src: marketplace, alt: "Stalls and shoppers at Kimironko Market, Kigali",
    credit: "Hanay", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/w/index.php?curid=136520175",
  },
  consultancy: {
    src: consultancy, alt: "A team planning together around a table",
    credit: "Startup Stock Photos", license: "CC0", source: "https://stocksnap.io/photo/team-meeting-84GOP2OAKR",
  },
  data: {
    src: data, alt: "A laptop showing analytics charts",
    credit: "rawpixel", license: "CC0", source: "https://www.rawpixel.com/image/5905791/photo-image-background-design-public-domain",
  },
  software: {
    src: software, alt: "Two developers reviewing code on a laptop",
    credit: "Christina Morillo", license: "CC0", source: "https://stocksnap.io/photo/developer-discuss-OEIJJX36TI",
  },
  training: {
    src: training, alt: "A trainer guiding a trainee through code in a software class",
    credit: "Unsplash", license: "Unsplash License", source: "https://unsplash.com/photos/man-using-black-laptop-computer-kwzWjTnDPLk",
  },
  library: {
    src: library, alt: "Shelves of library books",
    credit: "Josh Felise", license: "CC0", source: "https://stocksnap.io/photo/library-books-4TDHSPIMJ6",
  },
  entertainment: {
    src: "/videos/entertainment-podcast.jpg", video: "/videos/entertainment-podcast.mp4",
    alt: "A podcast host recording in a professional studio",
    credit: "Mixkit", license: "Mixkit License", source: "https://mixkit.co/free-stock-video/portrait-of-a-man-speaking-on-a-podcast-44028/",
  },
  travel: {
    src: travel, alt: "A mountain gorilla in Volcanoes National Park, Rwanda",
    credit: "Emmanuel Kwizera", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/w/index.php?curid=92779696",
  },
};

// Slides that show more than one photo, one after another.
const MORE_PHOTOS: Record<string, HeroPhoto[]> = {
  entertainment: [
    {
      src: "/videos/entertainment-film.jpg", video: "/videos/entertainment-film.mp4",
      alt: "Behind the scenes of a studio film shoot, camera and monitor rolling",
      credit: "Mixkit", license: "Mixkit License", source: "https://mixkit.co/free-stock-video/behind-the-scenes-of-an-interview-show-22998/",
    },
  ],
  travel: [
    {
      src: travelHotel, alt: "The pool and gardens of a five-star hotel in Kigali",
      credit: "Unsplash", license: "Unsplash License", source: "https://unsplash.com/photos/white-and-blue-concrete-building-near-green-trees-and-body-of-water-during-daytime-d-eWGvLCZfQ",
    },
    {
      src: "/videos/travel-snake.jpg", video: "/videos/travel-snake.mp4", alt: "A python gliding through the grass",
      credit: "Mixkit", license: "Mixkit License", source: "https://mixkit.co/free-stock-video/head-of-a-snake-moving-across-the-ground-47065/",
    },
  ],
};

export const heroPhotos = (id: string): HeroPhoto[] => (HERO_PHOTOS[id] ? [HERO_PHOTOS[id], ...(MORE_PHOTOS[id] ?? [])] : []);
