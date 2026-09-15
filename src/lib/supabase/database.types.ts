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
      app_locks: {
        Row: {
          app_biometric_enabled: boolean
          app_pin_hash: string | null
          app_pin_set_at: string | null
          chat_pin_hash: string | null
          chat_pin_set_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_biometric_enabled?: boolean
          app_pin_hash?: string | null
          app_pin_set_at?: string | null
          chat_pin_hash?: string | null
          chat_pin_set_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_biometric_enabled?: boolean
          app_pin_hash?: string | null
          app_pin_set_at?: string | null
          chat_pin_hash?: string | null
          chat_pin_set_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string | null
          blocker_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id?: string | null
          blocker_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string | null
          blocker_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          answered_at: string | null
          caller_id: string | null
          conversation_id: string | null
          created_at: string | null
          ended_at: string | null
          id: string
          quick_reply: string | null
          receiver_id: string | null
          started_at: string | null
          status: string
          type: string
        }
        Insert: {
          answered_at?: string | null
          caller_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          quick_reply?: string | null
          receiver_id?: string | null
          started_at?: string | null
          status?: string
          type: string
        }
        Update: {
          answered_at?: string | null
          caller_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          quick_reply?: string | null
          receiver_id?: string | null
          started_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      close_friends: {
        Row: {
          created_at: string
          friend_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "close_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          post_id: string | null
          shot_id: string | null
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          shot_id?: string | null
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          shot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          color: string | null
          cover_url: string | null
          created_at: string
          emoji: string | null
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          color?: string | null
          cover_url?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          color?: string | null
          cover_url?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          hype_count: number
          id: string
          parent_id: string | null
          post_id: string | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          shot_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          hype_count?: number
          id?: string
          parent_id?: string | null
          post_id?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          shot_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          hype_count?: number
          id?: string
          parent_id?: string | null
          post_id?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          shot_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          archived_at: string | null
          blocked_at: string | null
          conversation_id: string
          created_at: string
          last_read_at: string | null
          locked_at: string | null
          muted_at: string | null
          muted_until: string | null
          pinned_at: string | null
          request_accepted: boolean | null
          role: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          blocked_at?: string | null
          conversation_id: string
          created_at?: string
          last_read_at?: string | null
          locked_at?: string | null
          muted_at?: string | null
          muted_until?: string | null
          pinned_at?: string | null
          request_accepted?: boolean | null
          role?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          blocked_at?: string | null
          conversation_id?: string
          created_at?: string
          last_read_at?: string | null
          locked_at?: string | null
          muted_at?: string | null
          muted_until?: string | null
          pinned_at?: string | null
          request_accepted?: boolean | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          auto_delete_after: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          last_message_id: string | null
          screenshot_alert_at: string | null
          theme: string | null
          title: string | null
          type: string
          updated_at: string | null
          vanish_mode: boolean
        }
        Insert: {
          auto_delete_after?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          last_message_id?: string | null
          screenshot_alert_at?: string | null
          theme?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          vanish_mode?: boolean
        }
        Update: {
          auto_delete_after?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          last_message_id?: string | null
          screenshot_alert_at?: string | null
          theme?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          vanish_mode?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_daily_stats: {
        Row: {
          captured_at: string
          day: string
          followers: number
          user_id: string
          views: number
        }
        Insert: {
          captured_at?: string
          day: string
          followers?: number
          user_id: string
          views?: number
        }
        Update: {
          captured_at?: string
          day?: string
          followers?: number
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_daily_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          friend_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_requests: {
        Row: {
          created_at: string
          requester_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          requester_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          requester_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_archive: {
        Row: {
          audience: string
          color: string | null
          ended_at: string
          ended_how: string
          id: string
          text: string
          track: Json | null
          user_id: string
          written_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_call_participants: {
        Row: {
          call_id: string
          joined_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          call_id: string
          joined_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          call_id?: string
          joined_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "group_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_calls: {
        Row: {
          conversation_id: string
          ended_at: string | null
          id: string
          started_at: string
          started_by: string
        }
        Insert: {
          conversation_id: string
          ended_at?: string | null
          id?: string
          started_at?: string
          started_by: string
        }
        Update: {
          conversation_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_calls_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtag_follows: {
        Row: {
          created_at: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hypes: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hypes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          conversation_id: string
          created_at: string
          details: string | null
          id: string
          message_id: string
          reason: string | null
          reporter_id: string
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          details?: string | null
          id?: string
          message_id: string
          reason?: string | null
          reporter_id: string
          status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string
          reason?: string | null
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          is_unsent: boolean
          kind: string
          metadata: Json
          post_id: string | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          reply_to_id: string | null
          sender_id: string
          shot_id: string | null
          unsent_at: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_unsent?: boolean
          kind?: string
          metadata?: Json
          post_id?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          reply_to_id?: string | null
          sender_id: string
          shot_id?: string | null
          unsent_at?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_unsent?: boolean
          kind?: string
          metadata?: Json
          post_id?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          reply_to_id?: string | null
          sender_id?: string
          shot_id?: string | null
          unsent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          reason: string | null
          report_id: string | null
          target_id: string
          target_type: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          reason?: string | null
          report_id?: string | null
          target_id: string
          target_type: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          report_id?: string | null
          target_id?: string
          target_type?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      note_reactions: {
        Row: {
          created_at: string
          emoji: string
          note_created_at: string
          note_owner_id: string
          reactor_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          note_created_at: string
          note_owner_id: string
          reactor_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          note_created_at?: string
          note_owner_id?: string
          reactor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_reactions_note_owner_id_fkey"
            columns: ["note_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          audience: string
          color: string | null
          created_at: string
          expires_at: string
          text: string
          track: Json | null
          user_id: string
        }
        Insert: {
          audience?: string
          color?: string | null
          created_at?: string
          expires_at?: string
          text: string
          track?: Json | null
          user_id: string
        }
        Update: {
          audience?: string
          color?: string | null
          created_at?: string
          expires_at?: string
          text?: string
          track?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      note_hypes: {
        Row: {
          created_at: string
          hyper_id: string
          note_created_at: string
          note_owner_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "note_hypes_hyper_id_fkey"
            columns: ["hyper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_hypes_note_owner_id_fkey"
            columns: ["note_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          target_id: string | null
          target_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          target_id?: string | null
          target_type?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          target_id?: string | null
          target_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oneshots: {
        Row: {
          conversation_id: string
          expires_at: string
          message_id: string
          opened_at: string | null
          opened_by: string | null
          reaped_at: string | null
          sender_id: string
          storage_path: string
        }
        Insert: {
          conversation_id: string
          expires_at?: string
          message_id: string
          opened_at?: string | null
          opened_by?: string | null
          reaped_at?: string | null
          sender_id: string
          storage_path: string
        }
        Update: {
          conversation_id?: string
          expires_at?: string
          message_id?: string
          opened_at?: string | null
          opened_by?: string | null
          reaped_at?: string | null
          sender_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "oneshots_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oneshots_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oneshots_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oneshots_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_viewers: {
        Row: {
          created_at: string
          owner_id: string
          pinned_user_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          pinned_user_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          pinned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_viewers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_viewers_pinned_user_id_fkey"
            columns: ["pinned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          option_idx: number
          post_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          option_idx: number
          post_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          option_idx?: number
          post_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          created_at: string
          post_id: string
          viewed_on: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          viewed_on?: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          viewed_on?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          aspect_ratio: number | null
          body: string | null
          caption: string | null
          comment_count: number
          created_at: string
          hashtags: string[]
          hype_count: number
          id: string
          image_url: string | null
          image_urls: string[]
          mentions: string[]
          poll: Json | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          repost_count: number
          save_count: number
          share_count: number
          track: Json | null
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          aspect_ratio?: number | null
          body?: string | null
          caption?: string | null
          comment_count?: number
          created_at?: string
          hashtags?: string[]
          hype_count?: number
          id?: string
          image_url?: string | null
          image_urls?: string[]
          mentions?: string[]
          poll?: Json | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          repost_count?: number
          save_count?: number
          share_count?: number
          track?: Json | null
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          aspect_ratio?: number | null
          body?: string | null
          caption?: string | null
          comment_count?: number
          created_at?: string
          hashtags?: string[]
          hype_count?: number
          id?: string
          image_url?: string | null
          image_urls?: string[]
          mentions?: string[]
          poll?: Json | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          repost_count?: number
          save_count?: number
          share_count?: number
          track?: Json | null
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_links: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          event_id: string
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          id: string
          kind: string
          name: string
          price_paise: number | null
          sort: number
          tier: string
        }
        Insert: {
          active?: boolean
          id: string
          kind: string
          name: string
          price_paise?: number | null
          sort?: number
          tier: string
        }
        Update: {
          active?: boolean
          id?: string
          kind?: string
          name?: string
          price_paise?: number | null
          sort?: number
          tier?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount_paise: number | null
          created_at: string
          id: string
          product_id: string
          provider: string
          provider_ref: string | null
          user_id: string
        }
        Insert: {
          amount_paise?: number | null
          created_at?: string
          id?: string
          product_id: string
          provider: string
          provider_ref?: string | null
          user_id: string
        }
        Update: {
          amount_paise?: number | null
          created_at?: string
          id?: string
          product_id?: string
          provider?: string
          provider_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          provider: string
          provider_ref: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan: string
          provider: string
          provider_ref?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          provider?: string
          provider_ref?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accent_id: string
          anthem: Json | null
          avatar_hue: number | null
          avatar_url: string | null
          banner_id: string | null
          banner_url: string | null
          bio: string | null
          bubble_style: string | null
          nameplate: string | null
          card_layout: string
          card_theme: string
          created_at: string
          current_vibe: string | null
          date_of_birth: string | null
          display_name: string | null
          dm_privacy: string
          hide_read_receipts: boolean
          id: string
          interests: string[]
          is_admin: boolean
          is_private: boolean
          is_verified: boolean
          avatar_decoration: string | null
          badge_revoked: boolean
          is_premium: boolean
          name_font: string | null
          name_glow: string | null
          last_seen_at: string | null
          notif_prefs: Json
          profile_completed: boolean
          profile_tags: string[]
          referred_by: string | null
          show_activity: boolean
          suspended_at: string | null
          suspended_by: string | null
          suspended_until: string | null
          suspension_reason: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          accent_id?: string
          anthem?: Json | null
          avatar_hue?: number | null
          avatar_url?: string | null
          banner_id?: string | null
          banner_url?: string | null
          bio?: string | null
          bubble_style?: string | null
          nameplate?: string | null
          card_layout?: string
          card_theme?: string
          created_at?: string
          current_vibe?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          dm_privacy?: string
          hide_read_receipts?: boolean
          id: string
          interests?: string[]
          is_admin?: boolean
          is_private?: boolean
          is_verified?: boolean
          avatar_decoration?: string | null
          badge_revoked?: boolean
          is_premium?: boolean
          name_font?: string | null
          name_glow?: string | null
          last_seen_at?: string | null
          notif_prefs?: Json
          profile_completed?: boolean
          profile_tags?: string[]
          referred_by?: string | null
          show_activity?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          accent_id?: string
          anthem?: Json | null
          avatar_hue?: number | null
          avatar_url?: string | null
          banner_id?: string | null
          banner_url?: string | null
          bio?: string | null
          bubble_style?: string | null
          nameplate?: string | null
          card_layout?: string
          card_theme?: string
          created_at?: string
          current_vibe?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          dm_privacy?: string
          hide_read_receipts?: boolean
          id?: string
          interests?: string[]
          is_admin?: boolean
          is_private?: boolean
          is_verified?: boolean
          avatar_decoration?: string | null
          badge_revoked?: boolean
          is_premium?: boolean
          name_font?: string | null
          name_glow?: string | null
          last_seen_at?: string | null
          notif_prefs?: Json
          profile_completed?: boolean
          profile_tags?: string[]
          referred_by?: string | null
          show_activity?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          created_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_events: {
        Row: {
          action: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string | null
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string | null
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string | null
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_shots: {
        Row: {
          created_at: string
          id: string
          shot_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shot_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_shots_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_shots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          aspect_ratio: number | null
          body: string | null
          caption: string | null
          created_at: string
          hashtags: string[]
          id: string
          image_url: string | null
          image_urls: string[]
          mentions: string[]
          poll: Json | null
          scheduled_at: string
          track: Json | null
          user_id: string
        }
        Insert: {
          aspect_ratio?: number | null
          body?: string | null
          caption?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          image_url?: string | null
          image_urls?: string[]
          mentions?: string[]
          poll?: Json | null
          scheduled_at: string
          track?: Json | null
          user_id: string
        }
        Update: {
          aspect_ratio?: number | null
          body?: string | null
          caption?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          image_url?: string | null
          image_urls?: string[]
          mentions?: string[]
          poll?: Json | null
          scheduled_at?: string
          track?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          caption: string | null
          comment_count: number
          created_at: string
          hashtags: string[]
          hype_count: number
          id: string
          in_showcase: boolean
          media_url: string
          poster_url: string | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          save_count: number
          share_count: number
          track: Json | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          comment_count?: number
          created_at?: string
          hashtags?: string[]
          hype_count?: number
          id?: string
          in_showcase?: boolean
          media_url: string
          poster_url?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          save_count?: number
          share_count?: number
          track?: Json | null
          user_id: string
        }
        Update: {
          caption?: string | null
          comment_count?: number
          created_at?: string
          hashtags?: string[]
          hype_count?: number
          id?: string
          in_showcase?: boolean
          media_url?: string
          poster_url?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          save_count?: number
          share_count?: number
          track?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shots_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      show_views: {
        Row: {
          created_at: string
          show_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          show_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          show_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_views_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      showcase_items: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          kind: string
          media_url: string | null
          position: number
          poster_url: string | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          shot_id: string | null
          show_id: string | null
          showcase_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          kind: string
          media_url?: string | null
          position?: number
          poster_url?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          shot_id?: string | null
          show_id?: string | null
          showcase_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          position?: number
          poster_url?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          shot_id?: string | null
          show_id?: string | null
          showcase_id?: string
        }
        Relationships: []
      }
      showcases: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          position: number
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          position?: number
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          position?: number
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shows: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          hype_count: number
          id: string
          is_showcase: boolean | null
          linked_post_id: string | null
          media_url: string
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          track: Json | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          hype_count?: number
          id?: string
          is_showcase?: boolean | null
          linked_post_id?: string | null
          media_url: string
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          track?: Json | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          hype_count?: number
          id?: string
          is_showcase?: boolean | null
          linked_post_id?: string | null
          media_url?: string
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          track?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shows_linked_post_id_fkey"
            columns: ["linked_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spotify_accounts: {
        Row: {
          access_token: string
          connected_at: string
          display_name: string | null
          expires_at: string
          product: string | null
          refresh_token: string
          scope: string | null
          spotify_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          display_name?: string | null
          expires_at: string
          product?: string | null
          refresh_token: string
          scope?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          display_name?: string | null
          expires_at?: string
          product?: string | null
          refresh_token?: string
          scope?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_chat_theme: {
        Args: { p_conversation_id: string; p_theme: string | null }
        Returns: undefined
      }
      owns_product: {
        Args: { p_product: string; p_uid: string }
        Returns: boolean
      }
      trial_eligible: { Args: { p_uid: string }; Returns: boolean }
      accept_call: { Args: { p_call_id: string }; Returns: undefined }
      add_conversation_member: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_remove_content: {
        Args: {
          p_reason?: string
          p_report_id?: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: { p_id: string; p_status: string; p_table: string }
        Returns: undefined
      }
      admin_restore_content: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: undefined
      }
      admin_suspend_user: {
        Args: { p_days?: number; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      admin_unsuspend_user: { Args: { p_user_id: string }; Returns: undefined }
      age_ok: { Args: never; Returns: boolean }
      api_rate_limit: { Args: { p_action: string }; Returns: undefined }
      approve_follow_request: {
        Args: { p_requester: string }
        Returns: undefined
      }
      approve_message_request: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      block_message_request: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      block_user: { Args: { p_blocked: string }; Returns: undefined }
      blocked_either_way: { Args: never; Returns: string[] }
      capture_creator_daily_stats: { Args: never; Returns: undefined }
      can_see_profile: { Args: { p_user: string }; Returns: boolean }
      claim_oneshot: { Args: { p_message_id: string }; Returns: string }
      claim_referral: { Args: { p_ref_username: string }; Returns: boolean }
      clear_lock_pin: {
        Args: { p_current_pin: string; p_scope: string }
        Returns: undefined
      }
      clear_mfa_recovery_codes: { Args: never; Returns: undefined }
      clear_note: { Args: never; Returns: undefined }
      clear_note_reaction: { Args: { p_owner: string }; Returns: undefined }
      create_comment:
        | {
            Args: { p_body: string; p_owner_id?: string; p_post_id: string }
            Returns: string
          }
        | {
            Args: {
              p_body: string
              p_owner_id?: string
              p_parent_id?: string
              p_post_id: string
            }
            Returns: string
          }
      create_group: {
        Args: { p_member_ids: string[]; p_title: string }
        Returns: string
      }
      create_shot_comment: {
        Args: {
          p_body: string
          p_owner_id?: string
          p_parent_id?: string
          p_shot_id: string
        }
        Returns: string
      }
      decline_call: { Args: { p_call_id: string }; Returns: undefined }
      deny_follow_request: { Args: { p_requester: string }; Returns: undefined }
      disconnect_spotify: { Args: never; Returns: undefined }
      edit_message: {
        Args: { p_body: string; p_message_id: string }
        Returns: undefined
      }
      end_call: { Args: { p_call_id: string }; Returns: undefined }
      follow_user: { Args: { p_target: string }; Returns: string }
      generate_mfa_recovery_codes: { Args: never; Returns: string[] }
      get_affinity: { Args: { p_lookback_days?: number }; Returns: Json }
      get_creator_timeseries: {
        Args: { p_days?: number }
        Returns: {
          comments: number
          day: string
          follows: number
          hypes: number
          saves: number
        }[]
      }
      get_inbox_summary: {
        Args: { p_conversation_ids: string[] }
        Returns: {
          conversation_id: string
          last_body: string
          last_created_at: string
          last_kind: string
          last_sender_id: string
          unread_count: number
        }[]
      }
      get_diary_archive: {
        Args: { p_limit?: number }
        Returns: {
          audience: string
          color: string | null
          ended_how: string
          id: string | null
          text: string
          track: Json | null
          written_at: string
        }[]
      }
      file_items: {
        Args: { p_folder: string; p_from?: string; p_posts?: string[]; p_shots?: string[] }
        Returns: undefined
      }
      forget_diary: { Args: { p_written_at: string }; Returns: undefined }
      get_folders: {
        Args: never
        Returns: {
          color: string | null
          cover_url: string | null
          covers: Json
          created_at: string
          emoji: string | null
          id: string
          item_count: number
          name: string
          position: number
        }[]
      }
      get_notes: {
        Args: never
        Returns: {
          audience: string
          color: string | null
          avatar_hue: number
          avatar_url: string
          created_at: string
          display_name: string
          is_self: boolean
          text: string
          track: Json
          user_id: string
          username: string
        }[]
      }
      get_notes_for: {
        Args: { p_user_ids: string[] }
        Returns: {
          audience: string
          avatar_hue: number
          avatar_url: string
          created_at: string
          display_name: string
          text: string
          track: Json
          user_id: string
          username: string
        }[]
      }
      get_or_create_dm: { Args: { p_other: string }; Returns: string }
      get_poll_counts: {
        Args: { p_post_id: string }
        Returns: {
          option_idx: number
          votes: number
        }[]
      }
      get_suggested_people: {
        Args: { p_limit?: number }
        Returns: {
          avatar_hue: number
          avatar_url: string
          bio: string
          display_name: string
          id: string
          is_verified: boolean
          profile_tags: string[]
          score: number
          username: string
        }[]
      }
      get_topic_cards: {
        Args: { p_limit?: number }
        Returns: {
          cover_url: string
          last_at: string
          post_count: number
          recent_count: number
          tag: string
        }[]
      }
      get_trending_tags: {
        Args: { p_limit?: number }
        Returns: {
          recent: number
          score: number
          tag: string
        }[]
      }
      get_user_streak: {
        Args: { p_user_id: string }
        Returns: {
          current_streak: number
          hypes_received: number
          longest_streak: number
          total_posts: number
        }[]
      }
      has_lock_pin: { Args: { p_scope: string }; Returns: boolean }
      increment_post_view: { Args: { p_post_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_conv_member: { Args: { conv: string }; Returns: boolean }
      is_suspended: { Args: { p_user?: string }; Returns: boolean }
      join_group_call: { Args: { p_call_id: string }; Returns: undefined }
      leave_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      leave_group_call: { Args: { p_call_id: string }; Returns: undefined }
      mark_call_busy: { Args: { p_call_id: string }; Returns: undefined }
      mark_call_missed: { Args: { p_call_id: string }; Returns: undefined }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      log_security_alert: { Args: { p_body: string }; Returns: undefined }
      mark_notifications_read: { Args: never; Returns: undefined }
      mfa_recovery_codes_remaining: { Args: never; Returns: number }
      publish_due_scheduled_posts: { Args: never; Returns: number }
      purge_expired_messages: { Args: never; Returns: undefined }
      quick_reply_call: {
        Args: { p_call_id: string; p_reply: string }
        Returns: undefined
      }
      rate_limit: {
        Args: { p_action: string; p_limit: number; p_window: string }
        Returns: undefined
      }
      react_to_note: {
        Args: { p_emoji: string; p_owner: string }
        Returns: undefined
      }
      reap_oneshots: { Args: never; Returns: undefined }
      reorder_folders: { Args: { p_ids: string[] }; Returns: undefined }
      record_login_session: {
        Args: { p_label?: string; p_session_id: string }
        Returns: undefined
      }
      remove_conversation_member: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      report_message: {
        Args: { p_details?: string; p_message_id: string; p_reason: string }
        Returns: undefined
      }
      search_saved: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          caption: string | null
          id: string
          kind: string
          saved_at: string
          thumb: string | null
          video: string | null
        }[]
      }
      search_people: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          avatar_hue: number
          avatar_url: string
          bio: string
          display_name: string
          followers: number
          id: string
          is_verified: boolean
          score: number
          username: string
        }[]
      }
      search_suggestions: {
        Args: { p_limit?: number; p_q: string }
        Returns: { kind: string; score: number; term: string }[]
      }
      search_posts: {
        Args: { p_limit?: number; p_q: string }
        Returns: Database["public"]["Tables"]["posts"]["Row"][]
      }
      send_message: {
        Args: {
          p_body?: string
          p_conversation_id: string
          p_kind?: string
          p_post_id?: string
          p_reply_to_id?: string
          p_shot_id?: string
          p_storage_path?: string
        }
        Returns: Json
      }
      set_auto_delete: {
        Args: { p_after: string; p_conversation_id: string }
        Returns: undefined
      }
      set_date_of_birth: { Args: { p_dob: string }; Returns: undefined }
      set_lock_pin: {
        Args: { p_pin: string; p_scope: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_conversation_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      set_note: {
        Args: { p_audience?: string; p_color?: string; p_text: string; p_track?: Json }
        Returns: {
          audience: string
          color: string | null
          created_at: string
          expires_at: string
          text: string
          track: Json | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_page_reply: { Args: { p_body: string; p_owner: string }; Returns: string }
      set_item_folders: {
        Args: { p_folders?: string[]; p_post?: string; p_shot?: string }
        Returns: undefined
      }
      set_note_color: { Args: { p_color: string }; Returns: undefined }
      toggle_note_hype: { Args: { p_owner: string }; Returns: boolean }
      set_notif_pref: {
        Args: { p_key: string; p_on: boolean }
        Returns: Json
      }
      set_verified: {
        Args: { p_user_id: string; p_value: boolean }
        Returns: undefined
      }
      spotify_connection_status: {
        Args: never
        Returns: {
          connected: boolean
          display_name: string
          is_premium: boolean
        }[]
      }
      start_call: {
        Args: {
          p_conversation_id: string
          p_receiver_id: string
          p_type: string
        }
        Returns: string
      }
      start_group_call: { Args: { p_conversation_id: string }; Returns: string }
      toggle_hashtag_follow: { Args: { p_tag: string }; Returns: boolean }
      toggle_hype: {
        Args: {
          p_owner_id?: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      toggle_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: undefined
      }
      toggle_screenshot_alert: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      toggle_vanish_mode: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      touch_last_seen: { Args: never; Returns: undefined }
      unfollow_user: { Args: { p_target: string }; Returns: undefined }
      unread_dm_count: { Args: never; Returns: number }
      unsend_message: { Args: { p_message_id: string }; Returns: undefined }
      update_conversation: {
        Args: {
          p_avatar_url?: string
          p_conversation_id: string
          p_title?: string
        }
        Returns: undefined
      }
      verify_lock_pin: {
        Args: { p_pin: string; p_scope: string }
        Returns: boolean
      }
      verify_mfa_recovery_code: {
        Args: { p_code: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
