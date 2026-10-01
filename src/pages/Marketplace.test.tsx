// The marketplace shows a product's saved images: the first as the main picture,
// the rest as thumbnails, and a product with no stock as out of stock.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const seller = "00000000-0000-4000-8000-000000000001";
const img = (name: string) => `https://xyz.supabase.co/storage/v1/object/public/product-images/${seller}/${name}`;

const products = [
  { id: "p1", name: "Woven mat", price: 2000, category: "Crafts", stock: 3, status: "active",
    image_url: img("a.jpg"), image_urls: [img("a.jpg"), img("b.jpg"), img("c.jpg")] },
  { id: "p2", name: "Old basket", price: 5000, category: "Crafts", stock: 0, status: "active",
    image_url: "https://cdn.example.com/basket.jpg", image_urls: [] },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: products, error: null }) }), insert: async () => ({ error: null }) }),
  },
}));
vi.mock("@/components/Header", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "buyer" } }) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import Marketplace from "./Marketplace";

describe("Marketplace images", () => {
  beforeEach(() => toast.mockClear());

  it("shows the first saved image, with the others as thumbnails to switch to", async () => {
    render(<MemoryRouter><Marketplace /></MemoryRouter>);
    const main = (await screen.findByAltText("Woven mat")) as HTMLImageElement;
    expect(main.src).toBe(img("a.jpg"));
    expect(screen.getByLabelText("Woven mat image 3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Woven mat image 2"));
    await waitFor(() => expect((screen.getByAltText("Woven mat") as HTMLImageElement).src).toBe(img("b.jpg")));
  });

  it("still shows an older product's single image, without thumbnails", async () => {
    render(<MemoryRouter><Marketplace /></MemoryRouter>);
    const main = (await screen.findByAltText("Old basket")) as HTMLImageElement;
    expect(main.src).toBe("https://cdn.example.com/basket.jpg");
    expect(screen.queryByLabelText("Old basket image 1")).not.toBeInTheDocument();
  });

  it("marks a product with no stock as out of stock and does not add it to the cart", async () => {
    render(<MemoryRouter><Marketplace /></MemoryRouter>);
    await screen.findByAltText("Old basket");
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /marketplace\.addToCart/ });
    expect(buttons[1]).toBeDisabled();
    expect(buttons[0]).toBeEnabled();
  });
});
