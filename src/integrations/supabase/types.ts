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
      books: {
        Row: {
          author: string
          category: string
          content_url: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          pages: number
          title: string
          updated_at: string
        }
        Insert: {
          author: string
          category: string
          content_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          pages?: number
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          category?: string
          content_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          pages?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_datasets: {
        Row: {
          business_id: string
          created_at: string
          dataset_type: string
          id: string
          payload: Json
          period_end: string | null
          period_start: string | null
          source: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          dataset_type?: string
          id?: string
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          dataset_type?: string
          id?: string
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      business_insights: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          period_end: string | null
          period_start: string | null
          status: string
          summary: Json
          title: string
          trends: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          summary?: Json
          title?: string
          trends?: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          summary?: Json
          title?: string
          trends?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          order_id: string
          sale_amount: number
          seller_id: string
          status: string
        }
        Insert: {
          commission_amount: number
          commission_rate?: number
          created_at?: string
          id?: string
          order_id: string
          sale_amount: number
          seller_id: string
          status?: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          order_id?: string
          sale_amount?: number
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          vehicle_plate: string | null
          vehicle_type: string
        }
        Insert: {
          active?: boolean
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vehicle_plate?: string | null
          vehicle_type?: string
        }
        Update: {
          active?: boolean
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vehicle_plate?: string | null
          vehicle_type?: string
        }
        Relationships: []
      }
      course_registrations: {
        Row: {
          course_id: string | null
          course_title: string
          created_at: string
          email: string
          experience_level: string
          full_name: string
          id: string
          mode: string
          phone: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          course_id?: string | null
          course_title: string
          created_at?: string
          email: string
          experience_level?: string
          full_name: string
          id?: string
          mode?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          course_id?: string | null
          course_title?: string
          created_at?: string
          email?: string
          experience_level?: string
          full_name?: string
          id?: string
          mode?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_registrations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "software_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      detected_issues: {
        Row: {
          business_id: string
          category: string | null
          created_at: string
          id: string
          insight_id: string
          root_cause: string | null
          severity: string
          title: string
        }
        Insert: {
          business_id: string
          category?: string | null
          created_at?: string
          id?: string
          insight_id: string
          root_cause?: string | null
          severity?: string
          title: string
        }
        Update: {
          business_id?: string
          category?: string | null
          created_at?: string
          id?: string
          insight_id?: string
          root_cause?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "detected_issues_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "business_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      entertainment: {
        Row: {
          category: string
          cover_url: string | null
          created_at: string
          creator: string
          description: string | null
          duration_minutes: number
          id: string
          media_url: string | null
          price: number
          title: string
          trending: boolean
          type: string
          updated_at: string
        }
        Insert: {
          category?: string
          cover_url?: string | null
          created_at?: string
          creator: string
          description?: string | null
          duration_minutes?: number
          id?: string
          media_url?: string | null
          price?: number
          title: string
          trending?: boolean
          type: string
          updated_at?: string
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          creator?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          media_url?: string | null
          price?: number
          title?: string
          trending?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistics_requests: {
        Row: {
          assigned_driver_id: string | null
          created_at: string
          delivered_at: string | null
          driver_note: string | null
          dropoff: string
          estimated_price: number | null
          full_name: string | null
          id: string
          item_type: string | null
          phone: string | null
          picked_up_at: string | null
          pickup: string
          preferred_date: string | null
          proof_url: string | null
          status: string
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          assigned_driver_id?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_note?: string | null
          dropoff: string
          estimated_price?: number | null
          full_name?: string | null
          id?: string
          item_type?: string | null
          phone?: string | null
          picked_up_at?: string | null
          pickup: string
          preferred_date?: string | null
          proof_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          assigned_driver_id?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_note?: string | null
          dropoff?: string
          estimated_price?: number | null
          full_name?: string | null
          id?: string
          item_type?: string | null
          phone?: string | null
          picked_up_at?: string | null
          pickup?: string
          preferred_date?: string | null
          proof_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          created_at: string
          delivered_confirmed_at: string | null
          id: string
          payment_confirmed_at: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          seller_id: string
          shipping_address: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          delivered_confirmed_at?: string | null
          id?: string
          payment_confirmed_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          seller_id: string
          shipping_address?: string | null
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          delivered_confirmed_at?: string | null
          id?: string
          payment_confirmed_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          seller_id?: string
          shipping_address?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          barcode: string
          created_at: string
          height_cm: number
          id: string
          length_cm: number
          notes: string | null
          order_id: string
          package_type: string
          updated_at: string
          weight_kg: number
          width_cm: number
        }
        Insert: {
          barcode?: string
          created_at?: string
          height_cm?: number
          id?: string
          length_cm?: number
          notes?: string | null
          order_id: string
          package_type?: string
          updated_at?: string
          weight_kg?: number
          width_cm?: number
        }
        Update: {
          barcode?: string
          created_at?: string
          height_cm?: number
          id?: string
          length_cm?: number
          notes?: string | null
          order_id?: string
          package_type?: string
          updated_at?: string
          weight_kg?: number
          width_cm?: number
        }
        Relationships: []
      }
      packaging_requests: {
        Row: {
          assigned_driver_id: string | null
          created_at: string
          delivered_at: string | null
          driver_note: string | null
          full_name: string | null
          id: string
          item_description: string
          phone: string | null
          pickup_date: string | null
          proof_url: string | null
          quantity: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_driver_id?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_note?: string | null
          full_name?: string | null
          id?: string
          item_description: string
          phone?: string | null
          pickup_date?: string | null
          proof_url?: string | null
          quantity?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_driver_id?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_note?: string | null
          full_name?: string | null
          id?: string
          item_description?: string
          phone?: string | null
          pickup_date?: string | null
          proof_url?: string | null
          quantity?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          admin_note: string | null
          commission_amount: number
          created_at: string
          gross_amount: number
          id: string
          net_amount: number
          order_id: string | null
          paid_at: string | null
          payout_destination: string
          payout_method: string
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          commission_amount: number
          created_at?: string
          gross_amount: number
          id?: string
          net_amount: number
          order_id?: string | null
          paid_at?: string | null
          payout_destination: string
          payout_method?: string
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          commission_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          order_id?: string | null
          paid_at?: string | null
          payout_destination?: string
          payout_method?: string
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          image_urls: string[]
          name: string
          price: number
          seller_id: string
          status: string
          stock: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[]
          name: string
          price: number
          seller_id: string
          status?: string
          stock?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[]
          name?: string
          price?: number
          seller_id?: string
          status?: string
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_name: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          body: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          insight_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          insight_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          insight_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "business_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_applications: {
        Row: {
          agreement_accepted_at: string | null
          agreement_version: string | null
          business_address: string | null
          country: string | null
          payment_account: string | null
          payment_account_name: string | null
          payment_provider: string | null
          tin: string | null
          business_name: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          id_document_url: string | null
          id_number: string
          phone: string
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agreement_accepted_at?: string | null
          agreement_version?: string | null
          business_address?: string | null
          country?: string | null
          payment_account?: string | null
          payment_account_name?: string | null
          payment_provider?: string | null
          tin?: string | null
          business_name: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          id_document_url?: string | null
          id_number: string
          phone: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agreement_accepted_at?: string | null
          agreement_version?: string | null
          business_address?: string | null
          country?: string | null
          payment_account?: string | null
          payment_account_name?: string | null
          payment_provider?: string | null
          tin?: string | null
          business_name?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          id_document_url?: string | null
          id_number?: string
          phone?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          courier: string | null
          courier_id: string | null
          created_at: string
          distance_km: number | null
          driver_name: string | null
          driver_phone: string | null
          estimated_delivery: string | null
          id: string
          order_id: string
          shipping_address: string | null
          shipping_cost: number
          status: string
          tracking_number: string
          updated_at: string
        }
        Insert: {
          courier?: string | null
          courier_id?: string | null
          created_at?: string
          distance_km?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          estimated_delivery?: string | null
          id?: string
          order_id: string
          shipping_address?: string | null
          shipping_cost?: number
          status?: string
          tracking_number?: string
          updated_at?: string
        }
        Update: {
          courier?: string | null
          courier_id?: string | null
          created_at?: string
          distance_km?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          estimated_delivery?: string | null
          id?: string
          order_id?: string
          shipping_address?: string | null
          shipping_cost?: number
          status?: string
          tracking_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_rates: {
        Row: {
          active: boolean
          base_cost: number
          created_at: string
          id: string
          max_weight_kg: number
          min_weight_kg: number
          per_kg_cost: number
          per_km_cost: number
          updated_at: string
          zone: string
        }
        Insert: {
          active?: boolean
          base_cost?: number
          created_at?: string
          id?: string
          max_weight_kg?: number
          min_weight_kg?: number
          per_kg_cost?: number
          per_km_cost?: number
          updated_at?: string
          zone: string
        }
        Update: {
          active?: boolean
          base_cost?: number
          created_at?: string
          id?: string
          max_weight_kg?: number
          min_weight_kg?: number
          per_kg_cost?: number
          per_km_cost?: number
          updated_at?: string
          zone?: string
        }
        Relationships: []
      }
      software_bookings: {
        Row: {
          admin_note: string | null
          agreed_price: number | null
          budget_range: string | null
          consultation_date: string | null
          consultation_type: string
          created_at: string
          deposit_paid: boolean
          deposit_paid_at: string | null
          email: string
          final_paid: boolean
          final_paid_at: string | null
          full_name: string
          id: string
          phone: string
          preferred_deadline: string | null
          project_description: string
          service_type: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          agreed_price?: number | null
          budget_range?: string | null
          consultation_date?: string | null
          consultation_type?: string
          created_at?: string
          deposit_paid?: boolean
          deposit_paid_at?: string | null
          email: string
          final_paid?: boolean
          final_paid_at?: string | null
          full_name: string
          id?: string
          phone: string
          preferred_deadline?: string | null
          project_description: string
          service_type: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          agreed_price?: number | null
          budget_range?: string | null
          consultation_date?: string | null
          consultation_type?: string
          created_at?: string
          deposit_paid?: boolean
          deposit_paid_at?: string | null
          email?: string
          final_paid?: boolean
          final_paid_at?: string | null
          full_name?: string
          id?: string
          phone?: string
          preferred_deadline?: string | null
          project_description?: string
          service_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      software_courses: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration: string | null
          id: string
          level: string
          mode: string
          price: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          level?: string
          mode?: string
          price?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          level?: string
          mode?: string
          price?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          plan: string
          starts_at: string
          status: string
          trial_expires_at: string | null
          trial_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          plan?: string
          starts_at?: string
          status?: string
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          plan?: string
          starts_at?: string
          status?: string
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_requests: {
        Row: {
          admin_feedback: string | null
          business_id: string
          created_at: string
          id: string
          message: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          admin_feedback?: string | null
          business_id: string
          created_at?: string
          id?: string
          message: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          admin_feedback?: string | null
          business_id?: string
          created_at?: string
          id?: string
          message?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tracking_logs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          note: string | null
          shipment_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          note?: string | null
          shipment_id: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          note?: string | null
          shipment_id?: string
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "driver"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "moderator", "user", "driver"],
    },
  },
} as const
