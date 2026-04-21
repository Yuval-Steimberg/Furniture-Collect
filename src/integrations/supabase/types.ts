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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      apartments: {
        Row: {
          apartment_number: string
          building_number: string
          created_at: string
          id: string
          notes: string | null
          project_id: string
          status: Database["public"]["Enums"]["apartment_status"]
          updated_at: string
        }
        Insert: {
          apartment_number: string
          building_number: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["apartment_status"]
          updated_at?: string
        }
        Update: {
          apartment_number?: string
          building_number?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["apartment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apartments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          apartment_id: string
          collected: boolean
          collected_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          description: string
          estimated_weight_kg: number | null
          id: string
          image_url: string | null
          intended_for_collection: boolean
          item_type: Database["public"]["Enums"]["item_type"]
          location: string | null
          material_category: Database["public"]["Enums"]["material_category"]
          project_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          apartment_id: string
          collected?: boolean
          collected_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          description: string
          estimated_weight_kg?: number | null
          id?: string
          image_url?: string | null
          intended_for_collection?: boolean
          item_type?: Database["public"]["Enums"]["item_type"]
          location?: string | null
          material_category?: Database["public"]["Enums"]["material_category"]
          project_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          collected?: boolean
          collected_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string
          estimated_weight_kg?: number | null
          id?: string
          image_url?: string | null
          intended_for_collection?: boolean
          item_type?: Database["public"]["Enums"]["item_type"]
          location?: string | null
          material_category?: Database["public"]["Enums"]["material_category"]
          project_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_collected_by_user_id_fkey"
            columns: ["collected_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          org_role: Database["public"]["Enums"]["org_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name: string
          org_role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
        }
        Relationships: []
      }
      project_invitations: {
        Row: {
          accepted_at: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
        }
        Insert: {
          accepted_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
        }
        Update: {
          accepted_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          city: string
          created_at: string
          developer_name: string
          id: string
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          city: string
          created_at?: string
          developer_name: string
          id?: string
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          city?: string
          created_at?: string
          developer_name?: string
          id?: string
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_projects: {
        Row: {
          created_at: string
          id: string
          project_id: string
          project_role: Database["public"]["Enums"]["project_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          project_role?: Database["public"]["Enums"]["project_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          project_role?: Database["public"]["Enums"]["project_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_project_invitation: {
        Args: { invitation_id: string }
        Returns: boolean
      }
      get_current_user_email: { Args: never; Returns: string }
      user_has_project_access: {
        Args: { project_id_param: string; user_id_param: string }
        Returns: boolean
      }
      user_is_org_admin: { Args: { user_id_param: string }; Returns: boolean }
      user_is_project_manager: {
        Args: { project_id_param: string; user_id_param: string }
        Returns: boolean
      }
      user_is_viewer: {
        Args: { project_id_param: string; user_id_param: string }
        Returns: boolean
      }
    }
    Enums: {
      apartment_status: "NOT_STARTED" | "DOCUMENTING" | "COMPLETED"
      item_type: "furniture" | "appliance" | "textile" | "small_item" | "other"
      material_category:
        | "glass"
        | "aluminum"
        | "wood"
        | "plastic"
        | "metal"
        | "textile"
        | "electrical"
        | "other"
      org_role: "ORG_ADMIN" | "PROJECT_MANAGER" | "WORKER"
      project_role: "PROJECT_MANAGER" | "WORKER" | "VIEWER"
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
      apartment_status: ["NOT_STARTED", "DOCUMENTING", "COMPLETED"],
      item_type: ["furniture", "appliance", "textile", "small_item", "other"],
      material_category: [
        "glass",
        "aluminum",
        "wood",
        "plastic",
        "metal",
        "textile",
        "electrical",
        "other",
      ],
      org_role: ["ORG_ADMIN", "PROJECT_MANAGER", "WORKER"],
      project_role: ["PROJECT_MANAGER", "WORKER", "VIEWER"],
    },
  },
} as const
