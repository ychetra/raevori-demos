import { describe, expect, test } from "vitest";
import { CATALOG, ZONES } from "@/features/shop-assistant/catalog";
import { checkStock, createOrder, quoteDelivery, searchProducts, ToolError } from "@/features/shop-assistant/tools";

const ids = (ps: { id: string }[]) => ps.map((p) => p.id);

describe("catalog", () => {
  test("has about 20 products, each with Khmer and English names and stock for every colour/size", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(18);
    for (const p of CATALOG) {
      expect(p.name.en.length).toBeGreaterThan(0);
      expect(p.name.km).toMatch(/[ក-៿]/);
      for (const c of p.colors) for (const s of p.sizes) expect(p.stock[`${c.id}/${s}`]).toBeTypeOf("number");
    }
  });

  test("has about 8 Phnom Penh delivery zones", () => {
    expect(ZONES.length).toBeGreaterThanOrEqual(8);
  });
});

describe("searchProducts", () => {
  test("Khmer 'អាវ' (shirt) in black finds the black linen shirt", () => {
    expect(ids(searchProducts({ text: "អាវ", color: "black" }))).toContain("linen-shirt");
    expect(ids(searchProducts({ text: "អាវ", color: "ខ្មៅ" }))).toContain("linen-shirt");
  });

  test("'size M' and 'ទំហំ M' give the same results, all in size M", () => {
    const en = searchProducts({ text: "size M" });
    expect(en.length).toBeGreaterThan(0);
    expect(ids(searchProducts({ text: "ទំហំ M" }))).toEqual(ids(en));
    for (const p of en) expect(p.sizes).toContain("M");
  });

  test("Khmer with no spaces still finds red bags first", () => {
    const res = searchProducts({ text: "តើមានកាបូបពណ៌ក្រហមទេ?" });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].category).toBe("bags");
    expect(res[0].colors.map((c) => c.id)).toContain("red");
  });

  test("red bags under $25 are bags within budget", () => {
    const res = searchProducts({ text: "red bags", maxPrice: 25 });
    expect(res.length).toBeGreaterThan(0);
    for (const p of res) {
      expect(p.category).toBe("bags");
      expect(p.price).toBeLessThanOrEqual(25);
    }
  });

  test("Khmer digits in a shoe size match Latin sizes", () => {
    const res = searchProducts({ text: "ស្បែកជើង ទំហំ ៣៨" });
    expect(res.length).toBeGreaterThan(0);
    for (const p of res) {
      expect(p.category).toBe("shoes");
      expect(p.sizes).toContain("38");
    }
  });

  test("matching is case-insensitive", () => {
    expect(ids(searchProducts({ text: "LINEN SHIRT" }))).toEqual(ids(searchProducts({ text: "linen shirt" })));
    expect(searchProducts({ text: "Linen Shirt" })[0].id).toBe("linen-shirt");
  });

  test("returns at most 4 products", () => {
    expect(searchProducts({}).length).toBe(4);
    expect(searchProducts({ text: "shirt dress bag shoes" }).length).toBeLessThanOrEqual(4);
  });

  test("things the shop does not sell return nothing", () => {
    expect(searchProducts({ text: "laptop" })).toEqual([]);
    expect(searchProducts({ color: "rainbow" })).toEqual([]);
  });

  test("category filter accepts English or Khmer", () => {
    for (const p of searchProducts({ category: "shoes" })) expect(p.category).toBe("shoes");
    expect(ids(searchProducts({ category: "ស្បែកជើង" }))).toEqual(ids(searchProducts({ category: "shoes" })));
  });
});

describe("checkStock", () => {
  test("lists each size of a colour with its quantity", () => {
    const res = checkStock("linen-shirt", "black");
    expect(res.inStock).toBe(true);
    expect(res.options.every((o) => o.color === "black")).toBe(true);
    expect(res.options.map((o) => o.size)).toEqual(["S", "M", "L", "XL"]);
    expect(res.qty).toBe(res.options.reduce((n, o) => n + o.qty, 0));
  });

  test("Khmer colour names and Khmer digits are understood", () => {
    expect(checkStock("sneakers", "ស", "៣៨")).toEqual(checkStock("sneakers", "white", "38"));
    expect(checkStock("linen-shirt", "ខ្មៅ", "m")).toEqual(checkStock("linen-shirt", "black", "M"));
  });

  test("a sold-out combination reports zero", () => {
    expect(checkStock("linen-shirt", "cream", "XL")).toMatchObject({ inStock: false, qty: 0 });
  });

  test("unknown product, colour or size throws", () => {
    expect(() => checkStock("time-machine")).toThrow(ToolError);
    expect(() => checkStock("linen-shirt", "purple")).toThrow(ToolError);
    expect(() => checkStock("linen-shirt", "black", "XXXL")).toThrow(ToolError);
  });
});

describe("quoteDelivery", () => {
  test("Toul Kork costs $1.50 and is same day, however it is spelled", () => {
    for (const z of ["toul kork", "Tuol Kork", "TOUL-KORK", "ទួលគោក"]) {
      const res = quoteDelivery(z);
      expect("zone" in res && res.zone).toMatchObject({ id: "toul-kork", price: 1.5, sameDay: true });
    }
  });

  test("an unknown zone lists the zones we deliver to", () => {
    const res = quoteDelivery("Siem Reap");
    expect(res).toMatchObject({ error: "unknown_zone" });
    expect("zones" in res && res.zones.length).toBe(ZONES.length);
  });
});

describe("createOrder", () => {
  const shirt = { productId: "linen-shirt", color: "black", size: "M", qty: 1 };

  test("total is items plus delivery", () => {
    const order = createOrder({ items: [shirt], name: "Dara", zone: "toul kork" });
    expect(order.lines[0]).toMatchObject({ productId: "linen-shirt", size: "M", qty: 1, unitPrice: 18 });
    expect(order.delivery).toBe(1.5);
    expect(order.total).toBe(19.5);
    expect(order.id).toMatch(/^MF-\d+$/);
  });

  test("totals are exact to the cent across lines", () => {
    const order = createOrder({ items: [{ ...shirt, qty: 2 }, { productId: "cotton-tee", color: "white", size: "L", qty: 1 }], name: "Dara", zone: "ទួលគោក" });
    expect(order.total).toBe(18 * 2 + 8 + 1.5);
  });

  test("each order gets a new id", () => {
    const a = createOrder({ items: [shirt], name: "Dara", zone: "toul kork" });
    const b = createOrder({ items: [shirt], name: "Dara", zone: "toul kork" });
    expect(a.id).not.toBe(b.id);
  });

  test("out-of-stock or more than in stock throws", () => {
    expect(() => createOrder({ items: [{ ...shirt, color: "cream", size: "XL" }], name: "Dara", zone: "toul kork" })).toThrow(ToolError);
    const { qty } = checkStock("linen-shirt", "black", "M");
    expect(() => createOrder({ items: [{ ...shirt, qty: qty + 1 }], name: "Dara", zone: "toul kork" })).toThrow(ToolError);
  });

  test("unknown ids, bad quantities, unknown zones and empty orders throw", () => {
    expect(() => createOrder({ items: [{ ...shirt, productId: "nope" }], name: "Dara", zone: "toul kork" })).toThrow(ToolError);
    expect(() => createOrder({ items: [{ ...shirt, qty: 0 }], name: "Dara", zone: "toul kork" })).toThrow(ToolError);
    expect(() => createOrder({ items: [{ ...shirt, qty: 1.5 }], name: "Dara", zone: "toul kork" })).toThrow(ToolError);
    expect(() => createOrder({ items: [shirt], name: "Dara", zone: "Mars" })).toThrow(ToolError);
    expect(() => createOrder({ items: [], name: "Dara", zone: "toul kork" })).toThrow(ToolError);
  });

  test("the customer's name is trimmed and capped; a blank name becomes a placeholder", () => {
    expect(createOrder({ items: [shirt], name: "  " + "x".repeat(100), zone: "toul kork" }).name.length).toBe(40);
    expect(createOrder({ items: [shirt], name: " ", zone: "toul kork" }).name).toBe("Guest");
  });

  test("ordering does not use up shared stock (every visitor sees the same shop)", () => {
    const before = checkStock("linen-shirt", "black", "M").qty;
    createOrder({ items: [shirt], name: "Dara", zone: "toul kork" });
    expect(checkStock("linen-shirt", "black", "M").qty).toBe(before);
  });
});
