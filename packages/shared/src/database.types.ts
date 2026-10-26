export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ai_generation_daily_total: {
        Row: {
          day: string;
          total_count: number;
        };
        Insert: {
          day: string;
          total_count?: number;
        };
        Update: {
          day?: string;
          total_count?: number;
        };
        Relationships: [];
      };
      ai_generation_ip_quota: {
        Row: {
          count: number;
          day: string;
          ip_hash: string;
        };
        Insert: {
          count?: number;
          day: string;
          ip_hash: string;
        };
        Update: {
          count?: number;
          day?: string;
          ip_hash?: string;
        };
        Relationships: [];
      };
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
      bar_ingredient_stock: {
        Row: {
          bar_id: string;
          ingredient_id: string;
          is_86d: boolean;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          bar_id: string;
          ingredient_id: string;
          is_86d?: boolean;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          bar_id?: string;
          ingredient_id?: string;
          is_86d?: boolean;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_ingredient_stock_bar_id_fkey";
            columns: ["bar_id"];
            isOneToOne: false;
            referencedRelation: "bars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_ingredient_stock_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_invites: {
        Row: {
          accepted_by: string | null;
          bar_id: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          status: string;
        };
        Insert: {
          accepted_by?: string | null;
          bar_id: string;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          status?: string;
        };
        Update: {
          accepted_by?: string | null;
          bar_id?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_invites_bar_id_fkey";
            columns: ["bar_id"];
            isOneToOne: false;
            referencedRelation: "bars";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_members: {
        Row: {
          bar_id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          bar_id: string;
          joined_at?: string;
          role: string;
          user_id: string;
        };
        Update: {
          bar_id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_members_bar_id_fkey";
            columns: ["bar_id"];
            isOneToOne: false;
            referencedRelation: "bars";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_menu_items: {
        Row: {
          active: boolean;
          bar_id: string;
          bar_recipe_id: string;
          id: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          bar_id: string;
          bar_recipe_id: string;
          id?: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          bar_id?: string;
          bar_recipe_id?: string;
          id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bar_menu_items_bar_id_fkey";
            columns: ["bar_id"];
            isOneToOne: false;
            referencedRelation: "bars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_menu_items_bar_recipe_id_fkey";
            columns: ["bar_recipe_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_recipe_ingredients: {
        Row: {
          amount_unit: string | null;
          amount_value: number | null;
          bar_recipe_id: string;
          ingredient_id: string;
          sort_order: number;
        };
        Insert: {
          amount_unit?: string | null;
          amount_value?: number | null;
          bar_recipe_id: string;
          ingredient_id: string;
          sort_order?: number;
        };
        Update: {
          amount_unit?: string | null;
          amount_value?: number | null;
          bar_recipe_id?: string;
          ingredient_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipe_ingredients_bar_recipe_id_fkey";
            columns: ["bar_recipe_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipe_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      bar_recipes: {
        Row: {
          bar_id: string;
          base_recipe_id: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          garnish: string | null;
          glass: string | null;
          ice: string | null;
          id: string;
          instructions: string | null;
          method: string | null;
          name: string;
          straining: string | null;
          updated_at: string;
        };
        Insert: {
          bar_id: string;
          base_recipe_id?: string | null;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          garnish?: string | null;
          glass?: string | null;
          ice?: string | null;
          id?: string;
          instructions?: string | null;
          method?: string | null;
          name: string;
          straining?: string | null;
          updated_at?: string;
        };
        Update: {
          bar_id?: string;
          base_recipe_id?: string | null;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          garnish?: string | null;
          glass?: string | null;
          ice?: string | null;
          id?: string;
          instructions?: string | null;
          method?: string | null;
          name?: string;
          straining?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bar_recipes_bar_id_fkey";
            columns: ["bar_id"];
            isOneToOne: false;
            referencedRelation: "bars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipes_base_recipe_id_fkey";
            columns: ["base_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bar_recipes_base_recipe_id_fkey";
            columns: ["base_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
            referencedColumns: ["id"];
          },
        ];
      };
      bars: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      comment_photos: {
        Row: {
          alt_text: string | null;
          comment_id: string;
          created_at: string;
          height: number;
          id: string;
          position: number;
          storage_path: string;
          user_id: string;
          width: number;
        };
        Insert: {
          alt_text?: string | null;
          comment_id: string;
          created_at?: string;
          height: number;
          id?: string;
          position: number;
          storage_path: string;
          user_id: string;
          width: number;
        };
        Update: {
          alt_text?: string | null;
          comment_id?: string;
          created_at?: string;
          height?: number;
          id?: string;
          position?: number;
          storage_path?: string;
          user_id?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "comment_photos_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          recipe_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          recipe_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          recipe_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
            referencedColumns: ["id"];
          },
        ];
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
          {
            foreignKeyName: "favorites_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
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
          category: string | null;
          category_source_name_hash: string | null;
          created_at: string;
          id: string;
          image_url: string | null;
          is_staple: boolean;
          name: string;
          normalized_name: string | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          category_source_name_hash?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_staple?: boolean;
          name: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          category_source_name_hash?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_staple?: boolean;
          name?: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      learn_articles: {
        Row: {
          body_markdown: string;
          category: string;
          created_at: string;
          id: string;
          published_at: string | null;
          source_topic: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body_markdown: string;
          category: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          source_topic?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body_markdown?: string;
          category?: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          source_topic?: string | null;
          status?: string;
          title?: string;
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
      pinned_recipes: {
        Row: {
          bar_recipe_id: string | null;
          id: string;
          pinned_at: string;
          recipe_id: string | null;
          sort_order: number;
          user_id: string;
        };
        Insert: {
          bar_recipe_id?: string | null;
          id?: string;
          pinned_at?: string;
          recipe_id?: string | null;
          sort_order?: number;
          user_id: string;
        };
        Update: {
          bar_recipe_id?: string | null;
          id?: string;
          pinned_at?: string;
          recipe_id?: string | null;
          sort_order?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pinned_recipes_bar_recipe_id_fkey";
            columns: ["bar_recipe_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pinned_recipes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pinned_recipes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_attempts: {
        Row: {
          completed_at: string;
          id: string;
          quiz_id: string;
          score: number;
          total: number;
          user_id: string;
        };
        Insert: {
          completed_at?: string;
          id?: string;
          quiz_id: string;
          score: number;
          total: number;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          id?: string;
          quiz_id?: string;
          score?: number;
          total?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey";
            columns: ["quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_questions: {
        Row: {
          correct_option_index: number;
          explanation: string | null;
          id: string;
          options: Json;
          prompt: string;
          question_type: string;
          quiz_id: string;
          sort_order: number;
        };
        Insert: {
          correct_option_index: number;
          explanation?: string | null;
          id?: string;
          options: Json;
          prompt: string;
          question_type: string;
          quiz_id: string;
          sort_order: number;
        };
        Update: {
          correct_option_index?: number;
          explanation?: string | null;
          id?: string;
          options?: Json;
          prompt?: string;
          question_type?: string;
          quiz_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey";
            columns: ["quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      quizzes: {
        Row: {
          created_at: string;
          id: string;
          published_at: string | null;
          source_ref: string;
          source_type: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          published_at?: string | null;
          source_ref: string;
          source_type: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          published_at?: string | null;
          source_ref?: string;
          source_type?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ratings: {
        Row: {
          created_at: string;
          recipe_id: string;
          score: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          recipe_id: string;
          score: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          recipe_id?: string;
          score?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ratings_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ratings_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_aliases: {
        Row: {
          alias: string;
          created_at: string;
          id: string;
          recipe_id: string;
          source: string;
        };
        Insert: {
          alias: string;
          created_at?: string;
          id?: string;
          recipe_id: string;
          source: string;
        };
        Update: {
          alias?: string;
          created_at?: string;
          id?: string;
          recipe_id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_aliases_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_aliases_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
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
          amount_max_value: number | null;
          amount_unit: string | null;
          amount_value: number | null;
          ingredient_id: string;
          measure: string | null;
          recipe_id: string;
          sort_order: number;
        };
        Insert: {
          amount_max_value?: number | null;
          amount_unit?: string | null;
          amount_value?: number | null;
          ingredient_id: string;
          measure?: string | null;
          recipe_id: string;
          sort_order: number;
        };
        Update: {
          amount_max_value?: number | null;
          amount_unit?: string | null;
          amount_value?: number | null;
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
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
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
            foreignKeyName: "recipe_tags_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
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
          {
            foreignKeyName: "recipe_translations_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          alcoholic_status: string;
          created_at: string;
          deleted_at: string | null;
          difficulty: string | null;
          difficulty_source_name_hash: string | null;
          fame_score: number | null;
          flavor_profile_locked: boolean;
          glass: string | null;
          iba: string | null;
          id: string;
          image_origin: string | null;
          image_source_url: string | null;
          image_url: string | null;
          instructions: string;
          merged_into_recipe_id: string | null;
          method: string | null;
          method_source_name_hash: string | null;
          name: string;
          name_search: unknown;
          popularity_rank: number | null;
          region: string | null;
          source: string;
          source_id: string;
          straining: string | null;
          updated_at: string;
        };
        Insert: {
          alcoholic_status?: string;
          created_at?: string;
          deleted_at?: string | null;
          difficulty?: string | null;
          difficulty_source_name_hash?: string | null;
          fame_score?: number | null;
          flavor_profile_locked?: boolean;
          glass?: string | null;
          iba?: string | null;
          id?: string;
          image_origin?: string | null;
          image_source_url?: string | null;
          image_url?: string | null;
          instructions: string;
          merged_into_recipe_id?: string | null;
          method?: string | null;
          method_source_name_hash?: string | null;
          name: string;
          name_search?: unknown;
          popularity_rank?: number | null;
          region?: string | null;
          source?: string;
          source_id: string;
          straining?: string | null;
          updated_at?: string;
        };
        Update: {
          alcoholic_status?: string;
          created_at?: string;
          deleted_at?: string | null;
          difficulty?: string | null;
          difficulty_source_name_hash?: string | null;
          fame_score?: number | null;
          flavor_profile_locked?: boolean;
          glass?: string | null;
          iba?: string | null;
          id?: string;
          image_origin?: string | null;
          image_source_url?: string | null;
          image_url?: string | null;
          instructions?: string;
          merged_into_recipe_id?: string | null;
          method?: string | null;
          method_source_name_hash?: string | null;
          name?: string;
          name_search?: unknown;
          popularity_rank?: number | null;
          region?: string | null;
          source?: string;
          source_id?: string;
          straining?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_merged_into_recipe_id_fkey";
            columns: ["merged_into_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipes_merged_into_recipe_id_fkey";
            columns: ["merged_into_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_list_items: {
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
            foreignKeyName: "shopping_list_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
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
          kind: string;
          name: string;
          normalized_name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          bartender_mode_enabled: boolean;
          display_name: string | null;
          is_admin: boolean;
          locale: string | null;
          theme: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          bartender_mode_enabled?: boolean;
          display_name?: string | null;
          is_admin?: boolean;
          locale?: string | null;
          theme?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          bartender_mode_enabled?: boolean;
          display_name?: string | null;
          is_admin?: boolean;
          locale?: string | null;
          theme?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      pinned_recipes_visible: {
        Row: {
          bar_recipe_id: string | null;
          id: string | null;
          pinned_at: string | null;
          recipe_id: string | null;
          sort_order: number | null;
          user_id: string | null;
        };
        Insert: {
          bar_recipe_id?: string | null;
          id?: string | null;
          pinned_at?: string | null;
          recipe_id?: string | null;
          sort_order?: number | null;
          user_id?: string | null;
        };
        Update: {
          bar_recipe_id?: string | null;
          id?: string | null;
          pinned_at?: string | null;
          recipe_id?: string | null;
          sort_order?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pinned_recipes_bar_recipe_id_fkey";
            columns: ["bar_recipe_id"];
            isOneToOne: false;
            referencedRelation: "bar_recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pinned_recipes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pinned_recipes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes_localized";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes_localized: {
        Row: {
          alcoholic_status: string | null;
          created_at: string | null;
          deleted_at: string | null;
          difficulty: string | null;
          glass: string | null;
          id: string | null;
          image_url: string | null;
          instructions: string | null;
          name: string | null;
          region: string | null;
          source_id: string | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
      user_display_names: {
        Row: {
          display_name: string | null;
          user_id: string | null;
        };
        Insert: {
          display_name?: string | null;
          user_id?: string | null;
        };
        Update: {
          display_name?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_bar_invite: {
        Args: { p_invite_id: string };
        Returns: {
          bar_id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "bar_members";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_delete_comment_photo: {
        Args: { p_photo_id: string };
        Returns: Json;
      };
      admin_delete_recipe: { Args: { p_recipe_id: string }; Returns: undefined };
      admin_set_recipe_image: {
        Args: { p_hero_url: string; p_recipe_id: string };
        Returns: undefined;
      };
      admin_upsert_recipe: {
        Args: {
          p_alcoholic_status: string;
          p_flavor_profile?: string[];
          p_glass: string;
          p_ingredients: Json;
          p_instructions: string;
          p_name: string;
          p_recipe_id: string;
          p_region: string;
          p_tags: Json;
        };
        Returns: string;
      };
      apply_region_proposals: { Args: { proposals: Json }; Returns: undefined };
      buy_shopping_list_item: {
        Args: { p_ingredient_id: string };
        Returns: {
          created_at: string;
          ingredient_id: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "pantry_items";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      classic_recipes: {
        Args: { locale?: string; page_limit?: number };
        Returns: {
          alcoholic_status: string;
          id: string;
          image_url: string;
          name: string;
        }[];
      };
      comment_photo_uploads_last_24h: { Args: never; Returns: number };
      comment_with_photos_json: {
        Args: { p_comment_id: string };
        Returns: Json;
      };
      edit_comment: {
        Args: { p_body: string; p_comment_id: string; p_photos: Json };
        Returns: Json;
      };
      fetch_bar_recipe_detail: {
        Args: { p_bar_recipe_id: string };
        Returns: {
          bar_id: string;
          base_recipe_id: string;
          garnish: string;
          glass: string;
          ice: string;
          id: string;
          ingredients: Json;
          instructions: string;
          method: string;
          name: string;
          straining: string;
        }[];
      };
      fetch_bar_service_data: {
        Args: { p_bar_id: string };
        Returns: {
          house_recipes: Json;
          menu: Json;
          stock_86: Json;
        }[];
      };
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
          difficulty: string;
          glass: string;
          id: string;
          image_url: string;
          ingredients: Json;
          instructions: string;
          is_cocktaildb_recipe: boolean;
          is_favorited: boolean;
          method: string;
          name: string;
          straining: string;
          taste_tags: string[];
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
      fetch_shopping_list_items: {
        Args: { p_locale?: string };
        Returns: {
          ingredient_id: string;
          name: string;
        }[];
      };
      import_catalog: {
        Args: { drinks: Json; merges?: Json; staple_names?: string[] };
        Returns: undefined;
      };
      import_custom_recipes: { Args: { recipes: Json }; Returns: undefined };
      insert_new_comment_photo: {
        Args: {
          p_comment_id: string;
          p_item: Json;
          p_position: number;
          p_user_id: string;
        };
        Returns: undefined;
      };
      is_bar_creator: { Args: { p_bar_id: string }; Returns: boolean };
      is_bar_member: {
        Args: { p_bar_id: string; p_required_role?: string };
        Returns: boolean;
      };
      is_candidate_still_idle: { Args: { p_user_id: string }; Returns: boolean };
      is_comment_photo_referenced: {
        Args: { p_name: string };
        Returns: boolean;
      };
      is_current_user_admin: { Args: never; Returns: boolean };
      is_recipe_image_referenced: {
        Args: { p_name: string };
        Returns: boolean;
      };
      list_my_pending_invites: {
        Args: never;
        Returns: {
          bar_id: string;
          bar_name: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          status: string;
        }[];
      };
      list_orphan_comment_photos: {
        Args: { p_limit: number };
        Returns: string[];
      };
      list_orphan_recipe_images: {
        Args: { p_limit: number };
        Returns: string[];
      };
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
      normalize_comment_body: { Args: { p_body: string }; Returns: string };
      normalize_comment_photo_alt: { Args: { p_item: Json }; Returns: string };
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
      post_comment: {
        Args: { p_body?: string; p_photos?: Json; p_recipe_id: string };
        Returns: Json;
      };
      recipe_rating_summary: {
        Args: { p_recipe_id: string };
        Returns: {
          average: number;
          count: number;
        }[];
      };
      recommend_recipes:
        | {
            Args: {
              current_recipe_id?: string;
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
          }
        | {
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
      release_ai_generation_slot: {
        Args: { p_day: string; p_ip_hash: string; p_user_id: string };
        Returns: undefined;
      };
      require_comment_author: { Args: never; Returns: string };
      reserve_ai_generation_quota: {
        Args: { p_day: string; p_limit: number; p_user_id: string };
        Returns: boolean;
      };
      reserve_ai_generation_slot: {
        Args: {
          p_anon_global_limit: number;
          p_global_limit: number;
          p_ip_hash: string;
          p_ip_limit: number;
          p_is_anonymous: boolean;
          p_user_id: string;
          p_user_limit: number;
        };
        Returns: {
          day: string;
          reason: string;
          total_count: number;
        }[];
      };
      resolve_recipe_redirect: {
        Args: { p_recipe_id: string };
        Returns: string;
      };
      search_bartender: {
        Args: { bar_id?: string; query: string; recent_recipe_ids?: string[] };
        Returns: {
          id: string;
          kind: string;
          name: string;
          score: number;
          tier: number;
        }[];
      };
      search_ingredients: {
        Args: {
          include_staples?: boolean;
          locale?: string;
          query?: string;
          result_limit?: number;
        };
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
      search_recipes_by_ingredients: {
        Args: { ingredient_tokens: string[] };
        Returns: {
          id: string;
          name: string;
          score: number;
        }[];
      };
      select_idle_anonymous_accounts: {
        Args: never;
        Returns: {
          id: string;
        }[];
      };
      submit_quiz_attempt: {
        Args: { p_quiz_id: string; p_score: number; p_total: number };
        Returns: {
          completed_at: string;
          id: string;
          quiz_id: string;
          score: number;
          total: number;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "quiz_attempts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      toggle_86_status: {
        Args: { p_bar_id: string; p_ingredient_id: string; p_is_86d: boolean };
        Returns: {
          bar_id: string;
          ingredient_id: string;
          is_86d: boolean;
          updated_at: string;
          updated_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "bar_ingredient_stock";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
