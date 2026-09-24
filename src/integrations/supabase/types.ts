export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity: string | null
          entity_id: string | null
          id: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          base_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          id: string
          name: string
          org_id: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          base_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          id?: string
          name: string
          org_id: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          base_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          id: string
          note: string | null
          org_id: string
          shift_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          org_id: string
          shift_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          org_id?: string
          shift_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          org_id: string
          product_id: string
          quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          product_id: string
          quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          business_type: string
          created_at: string
          currency: string
          feature_flags: Json
          id: string
          low_stock_alerts_enabled: boolean
          low_stock_include_out_of_stock: boolean
          name: string
          owner_id: string
          phone: string | null
          profit_calculation_method: string
          reorder_suggestion_multiplier: number
          tax_enabled: boolean
          tax_number: string | null
          tax_rate: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_type?: string
          created_at?: string
          currency?: string
          feature_flags?: Json
          id?: string
          low_stock_alerts_enabled?: boolean
          low_stock_include_out_of_stock?: boolean
          name: string
          owner_id: string
          phone?: string | null
          profit_calculation_method?: string
          reorder_suggestion_multiplier?: number
          tax_enabled?: boolean
          tax_number?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_type?: string
          created_at?: string
          currency?: string
          feature_flags?: Json
          id?: string
          low_stock_alerts_enabled?: boolean
          low_stock_include_out_of_stock?: boolean
          name?: string
          owner_id?: string
          phone?: string | null
          profit_calculation_method?: string
          reorder_suggestion_multiplier?: number
          tax_enabled?: boolean
          tax_number?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_barcode_counters: {
        Row: {
          next_value: number
          org_id: string
          updated_at: string
        }
        Insert: {
          next_value?: number
          org_id: string
          updated_at?: string
        }
        Update: {
          next_value?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcode_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          category_id: string | null
          cost: number
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          org_id: string
          price: number
          reorder_level: number
          sku: string | null
          supplier_id: string | null
          tax_rate: number | null
          track_stock: boolean
          unit: string
          updated_at: string
          wholesale_price: number
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          org_id: string
          price?: number
          reorder_level?: number
          sku?: string | null
          supplier_id?: string | null
          tax_rate?: number | null
          track_stock?: boolean
          unit?: string
          updated_at?: string
          wholesale_price?: number
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          org_id?: string
          price?: number
          reorder_level?: number
          sku?: string | null
          supplier_id?: string | null
          tax_rate?: number | null
          track_stock?: boolean
          unit?: string
          updated_at?: string
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          custom_role_id: string | null
          employee_code: string | null
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          org_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          employee_code?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          org_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          org_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          org_id: string
          product_id: string
          purchase_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          org_id: string
          product_id: string
          purchase_id: string
          quantity: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          org_id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number | null
          org_id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number | null
          org_id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number | null
          org_id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string
          expected_at: string | null
          id: string
          note: string | null
          order_no: string
          org_id: string
          status: string
          supplier_id: string | null
          total: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expected_at?: string | null
          id?: string
          note?: string | null
          order_no: string
          org_id: string
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_at?: string | null
          id?: string
          note?: string | null
          order_no?: string
          org_id?: string
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          client_txn_id: string | null
          created_at: string
          id: string
          local_created_at: string | null
          note: string | null
          org_id: string
          paid: number
          reference: string | null
          status: string
          supplier_id: string | null
          total: number
          updated_at: string
          user_id: string
          warehouse_id: string
        }
        Insert: {
          client_txn_id?: string | null
          created_at?: string
          id?: string
          local_created_at?: string | null
          note?: string | null
          org_id: string
          paid?: number
          reference?: string | null
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
          warehouse_id: string
        }
        Update: {
          client_txn_id?: string | null
          created_at?: string
          id?: string
          local_created_at?: string | null
          note?: string | null
          org_id?: string
          paid?: number
          reference?: string | null
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      registers: {
        Row: {
          branch_id: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_exchanges: {
        Row: {
          amount_due: number
          created_at: string
          id: string
          note: string | null
          org_id: string
          original_sale_id: string
          refund_due: number
          replacement_sale_id: string
          replacement_total: number
          return_id: string
          returned_total: number
          settlement_method: string
          user_id: string
        }
        Insert: {
          amount_due?: number
          created_at?: string
          id?: string
          note?: string | null
          org_id: string
          original_sale_id: string
          refund_due?: number
          replacement_sale_id: string
          replacement_total?: number
          return_id: string
          returned_total?: number
          settlement_method?: string
          user_id: string
        }
        Update: {
          amount_due?: number
          created_at?: string
          id?: string
          note?: string | null
          org_id?: string
          original_sale_id?: string
          refund_due?: number
          replacement_sale_id?: string
          replacement_total?: number
          return_id?: string
          returned_total?: number
          settlement_method?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_exchanges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_exchanges_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_exchanges_replacement_sale_id_fkey"
            columns: ["replacement_sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_exchanges_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: true
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          line_total: number
          org_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          tax: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          line_total: number
          org_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id: string
          tax?: number
          unit_cost?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          org_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          tax?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          org_id: string
          reference: string | null
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          org_id: string
          reference?: string | null
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          org_id?: string
          reference?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          created_at: string
          id: string
          org_id: string
          product_id: string | null
          quantity: number
          refund_amount: number
          return_id: string
          sale_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          product_id?: string | null
          quantity: number
          refund_amount: number
          return_id: string
          sale_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          product_id?: string | null
          quantity?: number
          refund_amount?: number
          return_id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          created_at: string
          id: string
          org_id: string
          reason: string | null
          sale_id: string
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          reason?: string | null
          sale_id: string
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          reason?: string | null
          sale_id?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string
          cashier_id: string
          change_due: number
          client_txn_id: string | null
          cost_total: number
          created_at: string
          customer_id: string | null
          discount: number
          id: string
          invoice_no: string
          local_created_at: string | null
          note: string | null
          org_id: string
          paid: number
          payment_method: string
          register_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          branch_id: string
          cashier_id: string
          change_due?: number
          client_txn_id?: string | null
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          invoice_no: string
          local_created_at?: string | null
          note?: string | null
          org_id: string
          paid?: number
          payment_method?: string
          register_id?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          branch_id?: string
          cashier_id?: string
          change_due?: number
          client_txn_id?: string | null
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          invoice_no?: string
          local_created_at?: string | null
          note?: string | null
          org_id?: string
          paid?: number
          payment_method?: string
          register_id?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: string
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          note: string | null
          opened_at: string
          opening_cash: number
          org_id: string
          register_id: string | null
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opening_cash?: number
          org_id: string
          register_id?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opening_cash?: number
          org_id?: string
          register_id?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "registers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          note: string | null
          org_id: string
          product_id: string
          qty_change: number
          reference_id: string | null
          user_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          note?: string | null
          org_id: string
          product_id: string
          qty_change: number
          reference_id?: string | null
          user_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          note?: string | null
          org_id?: string
          product_id?: string
          qty_change?: number
          reference_id?: string | null
          user_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_organization: {
        Args: {
          _currency?: string
          _full_name: string
          _org_name: string
          _tax_rate?: number
        }
        Returns: string
      }
      close_open_shift: {
        Args: { _closing_cash: number; _note?: string }
        Returns: Json
      }
      close_shift: {
        Args: { _closing_cash: number; _note?: string; _shift_id: string }
        Returns: Json
      }
      create_exchange: {
        Args: {
          _note?: string
          _replacement_items: Json
          _return_items: Json
          _sale_id: string
          _settlement_method?: string
        }
        Returns: Json
      }
      create_return: {
        Args: { _items: Json; _reason?: string; _sale_id: string }
        Returns: Json
      }
      create_sale: { Args: { _payload: Json }; Returns: Json }
      current_org_id: { Args: never; Returns: string }
      current_role_name: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      default_permissions: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: Json
      }
      generate_product_barcode: { Args: never; Returns: string }
      has_perm: { Args: { _perm: string }; Returns: boolean }
      is_org_admin: { Args: never; Returns: boolean }
      my_permissions: { Args: never; Returns: Json }
      open_shift: {
        Args: {
          _client_txn_id?: string
          _opening_cash?: number
          _register_id?: string
        }
        Returns: Json
      }
      receive_purchase: { Args: { _payload: Json }; Returns: Json }
      report_daily_sales: {
        Args: {
          _branch_id?: string
          _cashier_id?: string
          _from: string
          _to: string
        }
        Returns: {
          day: string
          invoice_count: number
          sales_total: number
          tax_total: number
        }[]
      }
      report_top_products: {
        Args: {
          _branch_id?: string
          _cashier_id?: string
          _from: string
          _to: string
        }
        Returns: {
          product_id: string
          product_name: string
          profit: number
          quantity: number
          sales_total: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "OWNER"
        | "ADMIN"
        | "MANAGER"
        | "CASHIER"
        | "INVENTORY_MANAGER"
        | "ACCOUNTANT"
      sale_status: "COMPLETED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "VOID"
      shift_status: "OPEN" | "CLOSED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "OWNER",
        "ADMIN",
        "MANAGER",
        "CASHIER",
        "INVENTORY_MANAGER",
        "ACCOUNTANT",
      ],
      sale_status: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED", "VOID"],
      shift_status: ["OPEN", "CLOSED"],
    },
  },
} as const
