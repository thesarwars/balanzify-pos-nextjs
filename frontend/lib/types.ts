// lib/types.ts — core domain types (from docs/SCHEMA.md). Extend per module as you port.
export interface Product {
  id: number; type: 'single' | 'variable' | 'combo'; name: string; sku: string;
  cat: string; brand_id?: number | null; unit: string; tax_id?: number;
  alert_quantity?: number; enable_stock?: boolean; not_for_selling?: boolean;
  price: number; cost: number; stock: number; sw?: string; img?: string | null;
  variations?: { id?: number; name: string; sub_sku?: string; cost: number; price: number; stock: number }[];
  combo?: { product_id: number; qty: number }[];
  group_prices?: Record<number, number>;
}
export interface Category { id: string; name: string; count?: number }
export interface Contact {
  id: number; type: 'customer' | 'supplier' | 'both'; name: string; contact_id?: string;
  mobile?: string; email?: string; address?: string; customer_group_id?: number;
  credit_limit?: number; opening_balance?: number; advance_balance?: number;
  total_sale?: number; total_purchase?: number; total_paid?: number; due?: number;
}
export interface SellLine { product_id: number; variation?: string; quantity: number; unit_price: number }
export interface Payment { method: string; amount: number }
export interface Sell {
  id: number; invoice_no?: string; location_id: number; contact_id?: number; customer_name?: string;
  transaction_date?: string; subtotal: number; tax: number; discount_amount?: number;
  final_total: number; amount_paid?: number; change_return?: number;
  payment_status?: 'paid' | 'partial' | 'due'; method?: string; lines: SellLine[]; payments?: Payment[];
}
export interface CartItem { key: string; id: number; varName?: string; qty: number }
export interface PaymentAccount { id: number; name: string; type: 'Cash' | 'Bank' | 'Mobile money' | 'Other'; account_number?: string; balance: number }
export interface ModuleDef { key: string; name: string; icon: string; group: string; enabled: boolean; core: boolean; addon: boolean; price: number }
export interface Employee { id: number; name: string; email?: string; department: string; designation: string; location_id: number; salary: number; joined: string; status: 'active' | 'on_leave'; user_id?: number | null; commission_percent?: number }
