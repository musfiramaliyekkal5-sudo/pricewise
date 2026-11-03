const demoSource = "PriceWise demo catalogue";
const demoRetailers = ["Demo Retailer A", "Demo Retailer B", "Demo Retailer C"];

function unsplash(photoId) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=720&q=80`;
}

function offerValue(entry) {
  return typeof entry === "number" ? { price: entry, mrp: null } : entry;
}

function sampleOffer(productId, index, entry) {
  const { price, mrp, shipping = null } = offerValue(entry);
  return {
    id: `sample:${productId}:${index}`,
    sourceId: "pricewise-demo",
    sourceName: demoSource,
    retailerId: "demo",
    retailer: demoRetailers[index % demoRetailers.length],
    price,
    currency: "INR",
    mrp: Number.isFinite(mrp) && mrp > price ? mrp : null,
    offerPrice: null,
    shipping: Number.isFinite(shipping) && shipping >= 0 ? shipping : null,
    coupon: null,
    promotion: null,
    cashback: null,
    deliveryEstimate: null,
    availability: "Sample listing only",
    productUrl: null,
    retailerHost: null,
    updatedAt: null,
    feedUpdatedAt: null,
    collectedAt: null,
    isVerifiedAvailable: false,
    isSampleData: true,
  };
}

function product(id, title, brand, category, subcategory, image, offers, variant = null) {
  const sortedOffers = offers
    .map((entry, index) => sampleOffer(id, index, entry))
    .sort((left, right) => left.price - right.price);
  return {
    key: `sample:${id}`,
    matchKey: `sample:${id}`,
    product: {
      id: `sample-${id}`,
      title,
      brand,
      category,
      subcategory,
      variant,
      identifiers: {},
      imageUrl: unsplash(image),
      imageUrls: [],
      imageUnavailable: false,
      imageSource: "Unsplash illustrative image",
    },
    offers: sortedOffers,
    cheapestOfferId: sortedOffers[0]?.id || null,
    isSampleData: true,
  };
}

export const DEMO_PRODUCTS = [
  product("niacinamide-serum", "Niacinamide 10% Face Serum, 30 ml", "Minimalist", "Skincare", "Serums", "photo-1608248543803-ba4f8c70ae0b", [{ price: 599, mrp: 749 }, { price: 549, mrp: 749 }, { price: 625, mrp: 749 }]),
  product("gentle-face-cleanser", "Gentle Skin Cleanser, 125 ml", "Cetaphil", "Skincare", "Cleansers", "photo-1556229010-6c3f2c9ca5f8", [{ price: 399, mrp: 449 }, { price: 425, mrp: 449 }]),
  product("daily-sunscreen", "Ultra Sheer Daily Sunscreen SPF 50, 50 ml", "Neutrogena", "Skincare", "Sunscreen", "photo-1556228720-195a672e8a03", [{ price: 499, mrp: 599 }, { price: 479, mrp: 599 }]),
  product("ceramide-moisturizer", "Ceramide Barrier Repair Moisturizer, 50 g", "Dot & Key", "Skincare", "Moisturisers", "photo-1571781926291-c477ebfd024b", [{ price: 395, mrp: 495 }]),
  product("vitamin-c-serum", "Vitamin C Brightening Face Serum, 20 ml", "Plum", "Skincare", "Serums", "photo-1620916566398-39f1143ab7be", [{ price: 699, mrp: 899 }, { price: 649, mrp: 899 }]),

  product("matte-lipstick", "Forever Matte Liquid Lipstick, Rose Nude", "Maybelline", "Cosmetics", "Lipstick", "photo-1586495777744-4413f21062fa", [{ price: 499, mrp: 599 }, { price: 475, mrp: 599 }], { shade: "Rose Nude", size: "5 ml" }),
  product("lash-mascara", "Lash Sensational Mascara, Black", "Maybelline", "Cosmetics", "Mascara", "photo-1631214540242-4f5f6f2c0f5d", [{ price: 699, mrp: 799 }], { shade: "Black", size: "9 ml" }),
  product("everyday-foundation", "Infallible Fresh Wear Foundation, 30 ml", "L'Oréal Paris", "Cosmetics", "Foundation", "photo-1522335789203-aabd1fc54bc9", [{ price: 899, mrp: 999 }, { price: 849, mrp: 999 }], { shade: "Natural Beige", size: "30 ml" }),
  product("pressed-compact", "All Day Matte Compact Powder, Natural", "Lakmé", "Cosmetics", "Compact powder", "photo-1512496015851-a90fb38ba796", [{ price: 399, mrp: 449 }], { shade: "Natural", size: "9 g" }),
  product("kajal", "Eyeconic Kajal, Deep Black", "Lakmé", "Cosmetics", "Eyes", "photo-1515688594390-b649af70d282", [{ price: 299, mrp: 349 }], { shade: "Deep Black" }),

  product("cotton-kurta", "Women's Printed Cotton Straight Kurta", "Aurelia", "Clothing", "Kurtas", "photo-1581044777550-4cfa60707c03", [{ price: 1299, mrp: 1799 }, { price: 1199, mrp: 1799 }], { size: "M", colour: "Indigo print" }),
  product("modest-maxi-dress", "Women's Modest Long-Sleeve Maxi Dress", "Indya", "Clothing", "Modest fashion", "photo-1539109136881-3be0616acf4b", [{ price: 2499, mrp: 2999 }], { size: "M", colour: "Olive" }),
  product("everyday-hijab", "Soft Everyday Modal Hijab", "Urban Drape", "Clothing", "Hijabs", "photo-1483985988355-763728e1935b", [{ price: 699, mrp: 899 }, { price: 649, mrp: 899 }], { colour: "Taupe" }),
  product("straight-fit-jeans", "Women's Mid-Rise Straight Fit Jeans", "Levi's", "Clothing", "Jeans", "photo-1541099649105-f69ad21f3246", [{ price: 2299, mrp: 2999 }], { size: "28", colour: "Mid blue" }),
  product("cotton-tshirt", "Unisex Cotton Crew Neck T-Shirt", "H&M", "Clothing", "T-shirts", "photo-1521572163474-6864f9cf17ab", [{ price: 899, mrp: 1199 }, { price: 799, mrp: 1199 }], { size: "M", colour: "White" }),

  product("classic-wristwatch", "Classic Analog Quartz Wristwatch", "Fastrack", "Accessories", "Watches", "photo-1523275335684-37898b6baf30", [{ price: 1595, mrp: 1995 }, { price: 1495, mrp: 1995 }], { colour: "Brown leather" }),
  product("daily-tote", "Structured Everyday Tote Handbag", "Lavie", "Accessories", "Handbags", "photo-1584917865442-de89df76afd3", [{ price: 1899, mrp: 2499 }], { colour: "Tan" }),
  product("polarized-sunglasses", "Polarized UV-Protection Sunglasses", "Vogue Eyewear", "Accessories", "Sunglasses", "photo-1511499767150-a48a237f0083", [{ price: 1790, mrp: 2290 }, { price: 1699, mrp: 2290 }], { colour: "Black" }),
  product("silver-stud-earrings", "Sterling Silver Minimal Stud Earrings", "GIVA", "Accessories", "Jewellery", "photo-1535632066927-ab7c9ab60908", [{ price: 1099, mrp: 1499 }]),

  product("android-smartphone", "5G Android Smartphone, 128 GB", "Samsung", "Mobiles", "Smartphones", "photo-1511707171634-5f897ff02aa9", [{ price: 19999, mrp: 24999 }, { price: 19499, mrp: 24999 }, { price: 20249, mrp: 24999 }], { storage: "128 GB", colour: "Graphite" }),
  product("budget-smartphone", "Everyday 5G Smartphone, 256 GB", "Motorola", "Mobiles", "Smartphones", "photo-1598327105666-5b89351aff97", [{ price: 12999, mrp: 15999 }, { price: 12499, mrp: 15999 }], { storage: "256 GB", colour: "Forest green" }),
  product("wireless-headphones", "Wireless Over-Ear Headphones", "Sony", "Electronics", "Headphones", "photo-1505740420928-5e560c06d30e", [{ price: 6990, mrp: 8990 }, { price: 6799, mrp: 8990 }], { colour: "Black" }),
  product("fitness-smartwatch", "Fitness Smartwatch with Heart-Rate Monitor", "Amazfit", "Electronics", "Smartwatches", "photo-1523275335684-37898b6baf30", [{ price: 4999, mrp: 6999 }], { colour: "Midnight" }),
  product("thin-light-laptop", "14-inch Thin & Light Laptop, 16 GB RAM", "ASUS", "Computers", "Laptops", "photo-1496181133206-80ce9b88a853", [{ price: 62990, mrp: 74990 }, { price: 61990, mrp: 74990 }], { storage: "512 GB SSD", colour: "Silver" }),
  product("tablet", "11-inch Wi-Fi Tablet, 128 GB", "Lenovo", "Computers", "Tablets", "photo-1544244015-0df4b3ffc6b0", [{ price: 18999, mrp: 22999 }], { storage: "128 GB", colour: "Storm grey" }),
  product("pc-monitor", "27-inch QHD LED Monitor", "Dell", "Computers", "Monitors", "photo-1527443224154-c4a3942d3acf", [{ price: 10999, mrp: 13999 }, { price: 10699, mrp: 13999 }]),

  product("running-shoes", "Women's Everyday Running Shoes", "ASICS", "Footwear", "Running shoes", "photo-1542291026-7eec264c27ff", [{ price: 5499, mrp: 6499 }, { price: 5199, mrp: 6499 }], { size: "UK 6", colour: "Coral" }),
  product("white-sneakers", "Unisex Court-Style White Sneakers", "PUMA", "Footwear", "Sneakers", "photo-1495555961986-6d4c1ecb7be3", [{ price: 3999, mrp: 4999 }], { size: "UK 7", colour: "White" }),
  product("comfort-sandals", "Women's Comfort Strap Sandals", "Bata", "Footwear", "Sandals", "photo-1543163521-1bf539c55dd2", [{ price: 1499, mrp: 1799 }, { price: 1399, mrp: 1799 }], { size: "UK 6", colour: "Tan" }),
  product("leather-ankle-boots", "Women's Faux-Leather Ankle Boots", "H&M", "Footwear", "Boots", "photo-1543163521-1bf539c55dd2", [{ price: 2999, mrp: 3499 }], { size: "UK 6", colour: "Black" }),

  product("ceramic-cookware", "Non-Stick Ceramic Cookware Set, 3 Pieces", "Wonderchef", "Kitchen Appliances", "Cookware", "photo-1556911220-bff31c812dba", [{ price: 3499, mrp: 4499 }, { price: 3299, mrp: 4499 }]),
  product("mixer-grinder", "750 W Mixer Grinder, 3 Jars", "Bajaj", "Kitchen Appliances", "Mixer grinders", "photo-1585659722983-3a675dabf23d", [{ price: 3299, mrp: 4499 }, { price: 2999, mrp: 4499 }], { colour: "White" }),
  product("air-fryer", "4.5 L Digital Air Fryer", "Philips", "Kitchen Appliances", "Air fryers", "photo-1626074353765-517a681e40be", [{ price: 5499, mrp: 7499 }], { capacity: "4.5 L" }),
  product("table-lamp", "Minimal Ceramic Table Lamp", "Home Centre", "Furniture", "Lighting", "photo-1507473885765-e6ed057f782c", [{ price: 1799, mrp: 2299 }]),
  product("study-desk", "Compact Wooden Study Desk", "AmazonBasics", "Furniture", "Desks", "photo-1518455027359-f3f8164ba6bd", [{ price: 5999, mrp: 7999 }], { finish: "Walnut" }),
  product("office-chair", "Ergonomic Mesh Office Chair", "Green Soul", "Furniture", "Chairs", "photo-1580480055273-228ff5388ef8", [{ price: 7499, mrp: 9999 }], { colour: "Black" }),

  product("washing-machine", "7 kg Fully Automatic Front-Load Washing Machine", "LG", "Home Appliances", "Washing machines", "photo-1626806787461-102c1bfaaea1", [{ price: 18990, mrp: 23990 }, { price: 18490, mrp: 23990 }], { capacity: "7 kg", colour: "White" }),
  product("refrigerator", "260 L Frost-Free Double-Door Refrigerator", "Samsung", "Home Appliances", "Refrigerators", "photo-1584568694244-14fbdf83bd30", [{ price: 27990, mrp: 33990 }], { capacity: "260 L", colour: "Steel" }),
  product("vacuum-cleaner", "Cordless Handheld Vacuum Cleaner", "Eureka Forbes", "Home Appliances", "Vacuum cleaners", "photo-1558618666-fcd25c85cd64", [{ price: 8999, mrp: 11999 }]),

  product("basmati-rice", "Premium Aged Basmati Rice, 5 kg", "India Gate", "Groceries", "Rice", "photo-1586201375761-83865001e31c", [{ price: 549, mrp: 699 }, { price: 529, mrp: 699 }], { packSize: "5 kg" }),
  product("olive-oil", "Extra Virgin Olive Oil, 1 L", "Borges", "Groceries", "Cooking oil", "photo-1474979266404-7eaacbcd87c5", [{ price: 899, mrp: 1199 }], { packSize: "1 L" }),
  product("whole-wheat-atta", "Whole Wheat Atta, 5 kg", "Aashirvaad", "Groceries", "Flours", "photo-1509440159596-0249088772ff", [{ price: 249, mrp: 299 }], { packSize: "5 kg" }),
  product("tea", "Premium Assam Tea, 500 g", "Tata Tea", "Groceries", "Tea", "photo-1544787219-7f47ccb76574", [{ price: 299, mrp: 399 }], { packSize: "500 g" }),

  product("shampoo", "Anti-Dandruff Shampoo, 340 ml", "Head & Shoulders", "Personal Care", "Hair care", "photo-1556228578-8c89e6adf883", [{ price: 340, mrp: 399 }, { price: 315, mrp: 399 }], { size: "340 ml" }),
  product("toothpaste", "Complete Whitening Toothpaste, 200 g", "Colgate", "Personal Care", "Oral care", "photo-1607613009820-a29f7bb81c04", [{ price: 199, mrp: 249 }], { packSize: "200 g" }),

  product("storage-organizer", "Stackable Clear Storage Organizer, 3 Pieces", "HomeStrap", "Household", "Storage", "photo-1555041469-a586c61ea9bc", [{ price: 1199, mrp: 1499 }]),
  product("cotton-cushion-covers", "Printed Cotton Cushion Covers, Set of 2", "Fabindia", "Household", "Soft furnishings", "photo-1616486338812-3dadae4b4ace", [{ price: 899, mrp: 1199 }, { price: 849, mrp: 1199 }], { packSize: "Set of 2" }),

  product("building-blocks", "Creative Building Blocks Set, 250 Pieces", "Funskool", "Toys", "Building sets", "photo-1596461404969-9ae70f2830c1", [{ price: 899, mrp: 1199 }], { packSize: "250 pieces" }),
  product("plush-toy", "Soft Plush Teddy Bear, 30 cm", "Hamleys", "Toys", "Plush toys", "photo-1558060370-d644479cb6f7", [{ price: 499, mrp: 699 }], { size: "30 cm" }),
];

export const DEMO_CATEGORIES = [...new Set(DEMO_PRODUCTS.map(({ product: item }) => item.category))].sort();
export const DEMO_SOURCE = demoSource;

export function searchDemoProducts(query = "") {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return DEMO_PRODUCTS;
  return DEMO_PRODUCTS.filter(({ product: item }) =>
    [
      item.title,
      item.brand,
      item.category,
      item.subcategory,
      item.variant && typeof item.variant === "object" ? Object.values(item.variant).join(" ") : item.variant,
    ].some((value) => value?.toLocaleLowerCase().includes(needle)),
  );
}
