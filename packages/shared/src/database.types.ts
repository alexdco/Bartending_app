export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ai_generation_quota: {
        Row: {
          count: number;
          day: string;
          user_id: string;
        };
        Insert: {
          count?: number;
          day?: string;
          user_id: string;
        };
        Update: {
          count?: number;
          day?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          recipe_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          recipe_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          recipe_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_translations: {
        Row: {
          created_at: string;
          ingredient_id: string;
          locale: string;
          name: string;
          source_name_hash: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ingredient_id: string;
          locale: string;
          name: string;
          source_name_hash: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ingredient_id?: string;
          locale?: string;
          name?: string;
          source_name_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredient_translations_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          created_at: string;
          id: string;
          image_url: string | null;
          name: string;
          normalized_name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_url?: string | null;
          name: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_url?: string | null;
          name?: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pantry_items: {
        Row: {
          created_at: string;
          ingredient_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          ingredient_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          ingredient_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pantry_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ingredient_translations: {
        Row: {
          ingredient_id: string;
          locale: string;
          measure: string | null;
          recipe_id: string;
        };
        Insert: {
          ingredient_id: string;
          locale: string;
          measure?: string | null;
          recipe_id: string;
        };
        Update: {
          ingredient_id?: string;
          locale?: string;
          measure?: string | null;
          recipe_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_translations_recipe_id_ingredient_id_fkey";
            columns: ["recipe_id", "ingredient_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredients";
            referencedColumns: ["recipe_id", "ingredient_id"];
          },
        ];
      };
      recipe_ingredients: {
        Row: {
          ingredient_id: string;
          measure: string | null;
          recipe_id: string;
          sort_order: number;
        };
        Insert: {
          ingredient_id: string;
          measure?: string | null;
          recipe_id: string;
          sort_order: number;
        };
        Update: {
          ingredient_id?: string;
          measure?: string | null;
          recipe_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_tags: {
        Row: {
          recipe_id: string;
          tag_id: string;
        };
        Insert: {
          recipe_id: string;
          tag_id: string;
        };
        Update: {
          recipe_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_translations: {
        Row: {
          created_at: string;
          glass: string | null;
          instructions: string;
          locale: string;
          name: string;
          name_search: unknown;
          recipe_id: string;
          source_name_hash: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          glass?: string | null;
          instructions: string;
          locale: string;
          name: string;
          name_search?: unknown;
          recipe_id: string;
          source_name_hash: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          glass?: string | null;
          instructions?: string;
          locale?: string;
          name?: string;
          name_search?: unknown;
          recipe_id?: string;
          source_name_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_translations_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          alcoholic_status: string;
          created_at: string;
          deleted_at: string | null;
          fame_score: number | null;
          glass: string | null;
          id: string;
          image_url: string | null;
          instructions: string;
          name: string;
          name_search: unknown;
          popularity_rank: number | null;
          region: string | null;
          source_id: string;
          updated_at: string;
        };
        Insert: {
          alcoholic_status?: string;
          created_at?: string;
          deleted_at?: string | null;
          fame_score?: number | null;
          glass?: string | null;
          id?: string;
          image_url?: string | null;
          instructions: string;
          name: string;
          name_search?: unknown;
          popularity_rank?: number | null;
          region?: string | null;
          source_id: string;
          updated_at?: string;
        };
        Update: {
          alcoholic_status?: string;
          created_at?: string;
          deleted_at?: string | null;
          fame_score?: number | null;
          glass?: string | null;
          id?: string;
          image_url?: string | null;
          instructions?: string;
          name?: string;
          name_search?: unknown;
          popularity_rank?: number | null;
          region?: string | null;
          source_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tag_translations: {
        Row: {
          created_at: string;
          locale: string;
          name: string;
          tag_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          locale: string;
          name: string;
          tag_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          locale?: string;
          name?: string;
          tag_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tag_translations_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          normalized_name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          display_name: string | null;
          locale: string | null;
          theme: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          display_name?: string | null;
          locale?: string | null;
          theme?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          display_name?: string | null;
          locale?: string | null;
          theme?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_region_proposals: { Args: { proposals: Json }; Returns: undefined };
      fetch_favorite_recipes: {
        Args: {
          p_locale?: string;
          p_page_limit?: number;
          p_page_offset?: number;
        };
        Returns: {
          alcoholic_status: string;
          id: string;
          image_url: string;
          name: string;
        }[];
      };
      fetch_pantry_items: {
        Args: { p_locale?: string };
        Returns: {
          ingredient_id: string;
          name: string;
        }[];
      };
      fetch_recipe_detail: {
        Args: { p_id: string; p_locale?: string };
        Returns: {
          alcoholic_status: string;
          glass: string;
          id: string;
          image_url: string;
          ingredients: Json;
          instructions: string;
          is_favorited: boolean;
          name: string;
        }[];
      };
      fetch_recipes_by_ids: {
        Args: { p_ids: string[]; p_locale?: string };
        Returns: {
          alcoholic_status: string;
          id: string;
          image_url: string;
          name: string;
        }[];
      };
      import_catalog: { Args: { drinks: Json }; Returns: undefined };
      import_custom_recipes: { Args: { recipes: Json }; Returns: undefined };
      is_candidate_still_idle: { Args: { p_user_id: string }; Returns: boolean };
      list_popular_regions: {
        Args: never;
        Returns: {
          region_name: string;
        }[];
      };
      match_recipes_to_pantry: {
        Args: {
          locale?: string;
          max_ratio?: number;
          page_limit?: number;
          page_offset?: number;
        };
        Returns: {
          alcoholic_status: string;
          id: string;
          image_url: string;
          missing_ingredients: Json;
          missing_ratio: number;
          name: string;
        }[];
      };
      popular_recipes_by_region: {
        Args: { locale?: string; region_filter: string };
        Returns: {
          alcoholic_status: string;
          id: string;
          image_url: string;
          name: string;
          popularity_rank: number;
        }[];
      };
      recommend_recipes: {
        Args: {
          current_recipe_id?: string;
          locale?: string;
          page_limit?: number;
          page_offset?: number;
          recent_recipe_ids?: string[];
        };
        Returns: {
          alcoholic_status: string;
          id: string;
          image_url: string;
          name: string;
          score: number;
        }[];
      };
      reserve_ai_generation_quota: {
        Args: { p_day: string; p_limit: number; p_user_id: string };
        Returns: boolean;
      };
      search_ingredients: {
        Args: { locale?: string; query?: string; result_limit?: number };
        Returns: {
          id: string;
          name: string;
        }[];
      };
      search_recipes: {
        Args: {
          locale?: string;
          page_limit?: number;
          page_offset?: number;
          query?: string;
          status_filter?: string;
        };
        Returns: {
          alcoholic_status: string;
          id: string;
          image_url: string;
          name: string;
        }[];
      };
      select_idle_anonymous_accounts: {
        Args: never;
        Returns: {
          id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
