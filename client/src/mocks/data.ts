import { MenuItem, Comanda, Category, DEFAULT_CATEGORIES } from "@/lib/types";

export const INITIAL_CATEGORIES: Category[] = DEFAULT_CATEGORIES;

export const INITIAL_MENU_ITEMS: MenuItem[] = [
  // Buffet por kg (valor informado manualmente no PDV)
  { id: 100, name: "Buffet por kg", category: "buffet_kg", price: 0, description: "Valor informado manualmente ao adicionar", available: true, image: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800&auto=format&fit=crop&q=60" },

  // Porções
  { id: 1, name: "Batata Frita", category: "porcoes", price: 2500, description: "Porção grande com cheddar e bacon", available: true, image: "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=800&auto=format&fit=crop&q=60" },
  { id: 2, name: "Frango a Passarinho", category: "porcoes", price: 3500, description: "Acompanha molho de alho", available: true, image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&auto=format&fit=crop&q=60" },
  { id: 3, name: "Calabresa Acebolada", category: "porcoes", price: 3200, description: "Acompanha pão", available: true, image: "https://images.unsplash.com/photo-1595257293316-3b30c7429e71?w=800&auto=format&fit=crop&q=60" },
  { id: 4, name: "Isca de Peixe", category: "porcoes", price: 4500, description: "Tilápia empanada com molho tártaro", available: true, image: "https://images.unsplash.com/photo-1599354607476-8809462f9a0c?w=800&auto=format&fit=crop&q=60" },
  
  // Bebidas
  { id: 5, name: "Coca-Cola Lata", category: "bebidas", price: 600, description: "350ml", available: true, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=800&auto=format&fit=crop&q=60" },
  { id: 6, name: "Cerveja Heineken", category: "bebidas", price: 1200, description: "Long Neck 330ml", available: true, image: "https://images.unsplash.com/photo-1618885472179-5e474019f2a9?w=800&auto=format&fit=crop&q=60" },
  { id: 7, name: "Suco de Laranja", category: "bebidas", price: 1000, description: "Natural 500ml", available: true, image: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=800&auto=format&fit=crop&q=60" },
  { id: 8, name: "Água Mineral", category: "bebidas", price: 400, description: "Sem gás 500ml", available: true, image: "https://images.unsplash.com/photo-1564414297779-253372f44c69?w=800&auto=format&fit=crop&q=60" },

  // Lanches
  { id: 9, name: "X-Bacon", category: "lanches", price: 2200, description: "Pão, carne, queijo, bacon e salada", available: true, image: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=800&auto=format&fit=crop&q=60" },
  { id: 10, name: "X-Salada", category: "lanches", price: 1800, description: "Clássico artesanal", available: true, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&auto=format&fit=crop&q=60" },

  // Sobremesas
  { id: 11, name: "Pudim", category: "sobremesas", price: 1200, description: "Fatia generosa", available: true, image: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&auto=format&fit=crop&q=60" },
  { id: 12, name: "Petit Gâteau", category: "sobremesas", price: 1800, description: "Com sorvete de creme", available: true, image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&auto=format&fit=crop&q=60" },
];

export const INITIAL_COMANDAS: Comanda[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  number: i + 1,
  status: "available",
  total: 0,
}));
