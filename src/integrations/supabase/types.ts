export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_events: {
        Row: {
          created_at: string;
          description: string;
          event_fingerprint: string | null;
          event_type:
            | "vc_follow"
            | "repo_traction"
            | "big_tech_exit"
            | "launch"
            | "mention"
            | "important_github_follower";
          headline: string;
          id: string;
          metadata: Json;
          occurred_at: string;
          person_id: string;
          platform: "x" | "github" | "linkedin" | "system";
          source_url: string;
          vc_source_id: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string;
          event_fingerprint?: string | null;
          event_type:
            | "vc_follow"
            | "repo_traction"
            | "big_tech_exit"
            | "launch"
            | "mention"
            | "important_github_follower";
          headline: string;
          id?: string;
          metadata?: Json;
          occurred_at: string;
          person_id: string;
          platform: "x" | "github" | "linkedin" | "system";
          source_url: string;
          vc_source_id?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          event_fingerprint?: string | null;
          event_type?:
            | "vc_follow"
            | "repo_traction"
            | "big_tech_exit"
            | "launch"
            | "mention"
            | "important_github_follower";
          headline?: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          person_id?: string;
          platform?: "x" | "github" | "linkedin" | "system";
          source_url?: string;
          vc_source_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "tracked_people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_vc_source_id_fkey";
            columns: ["vc_source_id"];
            isOneToOne: false;
            referencedRelation: "vc_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      person_identities: {
        Row: {
          created_at: string;
          handle: string;
          id: string;
          is_primary: boolean;
          person_id: string;
          platform: "x" | "github" | "linkedin";
          profile_url: string;
        };
        Insert: {
          created_at?: string;
          handle: string;
          id?: string;
          is_primary?: boolean;
          person_id: string;
          platform: "x" | "github" | "linkedin";
          profile_url: string;
        };
        Update: {
          created_at?: string;
          handle?: string;
          id?: string;
          is_primary?: boolean;
          person_id?: string;
          platform?: "x" | "github" | "linkedin";
          profile_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "person_identities_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "tracked_people";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          id: string;
          status: "trialing" | "active" | "past_due" | "canceled";
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          trial_ends_at: string;
          trial_started_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          status?: "trialing" | "active" | "past_due" | "canceled";
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string;
          trial_started_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          status?: "trialing" | "active" | "past_due" | "canceled";
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string;
          trial_started_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_vc_watchlist_items: {
        Row: {
          created_at: string;
          id: string;
          user_id: string;
          vc_source_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          user_id: string;
          vc_source_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          user_id?: string;
          vc_source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_vc_watchlist_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_vc_watchlist_items_vc_source_id_fkey";
            columns: ["vc_source_id"];
            isOneToOne: false;
            referencedRelation: "vc_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      tracked_people: {
        Row: {
          avatar_url: string | null;
          company: string;
          created_at: string;
          full_name: string;
          id: string;
          is_watchlist: boolean;
          location: string;
          role_title: string;
          slug: string;
          summary: string;
          top_pick_note: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          company?: string;
          created_at?: string;
          full_name: string;
          id?: string;
          is_watchlist?: boolean;
          location?: string;
          role_title: string;
          slug: string;
          summary?: string;
          top_pick_note?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          company?: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          is_watchlist?: boolean;
          location?: string;
          role_title?: string;
          slug?: string;
          summary?: string;
          top_pick_note?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vc_sources: {
        Row: {
          city: string;
          country: string;
          created_by_user_id: string | null;
          created_at: string;
          firm: string;
          github_username: string | null;
          id: string;
          is_seeded: boolean;
          last_github_sync_at: string | null;
          last_sync_error: string | null;
          last_x_sync_at: string | null;
          linkedin_url: string | null;
          name: string;
          notes: string;
          region: string;
          slug: string;
          sync_status: "idle" | "pending" | "ok" | "error";
          tier: "angel" | "microvc" | "vc";
          title: string;
          updated_at: string;
          website_url: string | null;
          x_handle: string | null;
          x_user_id: string | null;
        };
        Insert: {
          city?: string;
          country: string;
          created_by_user_id?: string | null;
          created_at?: string;
          firm: string;
          github_username?: string | null;
          id?: string;
          is_seeded?: boolean;
          last_github_sync_at?: string | null;
          last_sync_error?: string | null;
          last_x_sync_at?: string | null;
          linkedin_url?: string | null;
          name: string;
          notes?: string;
          region?: string;
          slug: string;
          sync_status?: "idle" | "pending" | "ok" | "error";
          tier?: "angel" | "microvc" | "vc";
          title: string;
          updated_at?: string;
          website_url?: string | null;
          x_handle?: string | null;
          x_user_id?: string | null;
        };
        Update: {
          city?: string;
          country?: string;
          created_by_user_id?: string | null;
          created_at?: string;
          firm?: string;
          github_username?: string | null;
          id?: string;
          is_seeded?: boolean;
          last_github_sync_at?: string | null;
          last_sync_error?: string | null;
          last_x_sync_at?: string | null;
          linkedin_url?: string | null;
          name?: string;
          notes?: string;
          region?: string;
          slug?: string;
          sync_status?: "idle" | "pending" | "ok" | "error";
          tier?: "angel" | "microvc" | "vc";
          title?: string;
          updated_at?: string;
          website_url?: string | null;
          x_handle?: string | null;
          x_user_id?: string | null;
        };
        Relationships: [];
      };
      weekly_pick_reasons: {
        Row: {
          created_at: string;
          detail: string;
          display_order: number;
          id: string;
          metric_value: number | null;
          reason_kind:
            | "vc_follow_burst"
            | "repo_traction"
            | "big_tech_exit"
            | "important_github_followers";
          snapshot_id: string;
          source_event_id: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          detail: string;
          display_order?: number;
          id?: string;
          metric_value?: number | null;
          reason_kind:
            | "vc_follow_burst"
            | "repo_traction"
            | "big_tech_exit"
            | "important_github_followers";
          snapshot_id: string;
          source_event_id?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          detail?: string;
          display_order?: number;
          id?: string;
          metric_value?: number | null;
          reason_kind?:
            | "vc_follow_burst"
            | "repo_traction"
            | "big_tech_exit"
            | "important_github_followers";
          snapshot_id?: string;
          source_event_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_pick_reasons_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "weekly_pick_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_pick_reasons_source_event_id_fkey";
            columns: ["source_event_id"];
            isOneToOne: false;
            referencedRelation: "activity_events";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_pick_snapshots: {
        Row: {
          big_tech_exit: boolean;
          created_at: string;
          github_attention_score: number;
          id: string;
          person_id: string;
          primary_reason: string;
          rank: number;
          score: number;
          summary: string;
          vc_follow_count: number;
          week_start: string;
        };
        Insert: {
          big_tech_exit?: boolean;
          created_at?: string;
          github_attention_score?: number;
          id?: string;
          person_id: string;
          primary_reason: string;
          rank: number;
          score: number;
          summary: string;
          vc_follow_count?: number;
          week_start: string;
        };
        Update: {
          big_tech_exit?: boolean;
          created_at?: string;
          github_attention_score?: number;
          id?: string;
          person_id?: string;
          primary_reason?: string;
          rank?: number;
          score?: number;
          summary?: string;
          vc_follow_count?: number;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_pick_snapshots_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "tracked_people";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
