import { MenuItem, Order, OrderItem, Comanda } from '../lib/types';

const STORAGE_KEYS = {
  MENU_ITEMS: 'pos_menu_items',
  COMANDAS: 'pos_comandas',
  ORDERS: 'pos_orders',
  ORDER_ITEMS: 'pos_order_items',
};

export const menuService = {
  getMenuItems: (): MenuItem[] => {
    const data = localStorage.getItem(STORAGE_KEYS.MENU_ITEMS);
    return data ? JSON.parse(data) : [];
  },
  saveMenuItems: (items: MenuItem[]) => {
    localStorage.setItem(STORAGE_KEYS.MENU_ITEMS, JSON.stringify(items));
  },
};

export const orderService = {
  getOrders: (): Order[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ORDERS);
    return data ? JSON.parse(data) : [];
  },
  getOrderItems: (): OrderItem[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ORDER_ITEMS);
    return data ? JSON.parse(data) : [];
  },
  getComandas: (): Comanda[] => {
    const data = localStorage.getItem(STORAGE_KEYS.COMANDAS);
    return data ? JSON.parse(data) : [];
  },
  saveAll: (comandas: Comanda[], orders: Order[], items: OrderItem[]) => {
    localStorage.setItem(STORAGE_KEYS.COMANDAS, JSON.stringify(comandas));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    localStorage.setItem(STORAGE_KEYS.ORDER_ITEMS, JSON.stringify(items));
  },
};
