
import { z } from 'zod';
import {
  insertMenuItemSchema,
  insertComandaSchema,
  insertCategorySchema,
  insertOrderSchema,
  insertOrderItemSchema,
  insertOrderFinalizeSchema,
  receiptPaymentsUpsertSchema,
  menuItems,
  categories,
  comandas,
  orders,
  orderItems,
  receiptPayments,
  receipts,
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  state: {
    snapshot: {
      method: 'GET' as const,
      path: '/api/state',
      responses: {
        200: z.object({
          menuItems: z.array(z.custom<typeof menuItems.$inferSelect>()),
          categories: z.array(z.custom<typeof categories.$inferSelect>()),
          comandas: z.array(z.custom<typeof comandas.$inferSelect>()),
          orders: z.array(z.custom<typeof orders.$inferSelect>()),
        
          orderItems: z.array(z.custom<typeof orderItems.$inferSelect>()),
          serverTime: z.string(),
        }),
      },
    },
  },
  receipts: {
    get: {
      method: 'GET' as const,
      path: '/api/receipts/:receiptId',
      responses: {
        200: z.custom<typeof receipts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    payments: {
      list: {
        method: 'GET' as const,
        path: '/api/receipts/:receiptId/payments',
        responses: {
          200: z.array(z.custom<typeof receiptPayments.$inferSelect>()),
          404: errorSchemas.notFound,
        },
      },
      upsert: {
        method: 'PUT' as const,
        path: '/api/receipts/:receiptId/payments',
        input: receiptPaymentsUpsertSchema,
        responses: {
          200: z.array(z.custom<typeof receiptPayments.$inferSelect>()),
          404: errorSchemas.notFound,
          400: errorSchemas.validation,
        },
      },
    },
  },
  menuItems: {
    list: {
      method: 'GET' as const,
      path: '/api/menu-items',
      responses: {
        200: z.array(z.custom<typeof menuItems.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/menu-items',
      input: insertMenuItemSchema,
      responses: {
        201: z.custom<typeof menuItems.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/menu-items/:id',
      input: insertMenuItemSchema.partial(),
      responses: {
        200: z.custom<typeof menuItems.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/menu-items/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  categories: {
    list: {
      method: 'GET' as const,
      path: '/api/categories',
      responses: {
        200: z.array(z.custom<typeof categories.$inferSelect>()),
      },
    },
    upsert: {
      method: 'PUT' as const,
      path: '/api/categories/:id',
      input: insertCategorySchema.partial(),
      responses: {
        200: z.custom<typeof categories.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/categories/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  comandas: {
    list: {
      method: 'GET' as const,
      path: '/api/comandas',
      responses: {
        200: z.array(z.custom<typeof comandas.$inferSelect>()),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/comandas/:id',
      input: insertComandaSchema.partial(),
      responses: {
        200: z.custom<typeof comandas.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },

    create: {
      method: 'POST' as const,
      path: '/api/comandas',
      input: insertComandaSchema,
      responses: {
        201: z.custom<typeof comandas.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/comandas/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },

  },
  orders: {
    list: {
      method: 'GET' as const,
      path: '/api/orders',
      responses: {
        200: z.array(z.custom<typeof orders.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/orders',
      input: insertOrderSchema.extend({
        items: z.array(insertOrderItemSchema)
      }),
      responses: {
        201: z.object({
          order: z.custom<typeof orders.$inferSelect>(),
          items: z.array(z.custom<typeof orderItems.$inferSelect>())
        }),
      },
    },
    finalize: {
      method: 'POST' as const,
      path: '/api/orders/:id/finalize',
      input: insertOrderFinalizeSchema,
      responses: {
        200: z.custom<typeof orders.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },

    items: {
      create: {
        method: 'POST' as const,
        path: '/api/orders/:id/items',
        // orderId is implied by the :id param.
        input: insertOrderItemSchema.omit({ orderId: true }),
        responses: {
          201: z.custom<typeof orderItems.$inferSelect>(),
          404: errorSchemas.notFound,
          400: errorSchemas.validation,
        },
      },
    },
  },
  orderItems: {
    update: {
      method: 'PUT' as const,
      path: '/api/order-items/:id',
      input: insertOrderItemSchema.partial(),
      responses: {
        200: z.custom<typeof orderItems.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/order-items/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
