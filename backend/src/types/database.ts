export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      application_assignments: {
        Row: {
          application_id: string;
          assignee_email: string;
          assignee_name: string;
          assigned_by_email: string;
          assigned_at: string;
          updated_at: string;
        };
        Insert: {
          application_id: string;
          assignee_email: string;
          assignee_name: string;
          assigned_by_email: string;
          assigned_at?: string;
          updated_at?: string;
        };
        Update: {
          application_id?: string;
          assignee_email?: string;
          assignee_name?: string;
          assigned_by_email?: string;
          assigned_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_reviews: {
        Row: {
          application_id: string;
          rating: number | null;
          decision: 'reject' | 'waitlist' | 'accept' | null;
          updated_by_email: string;
          updated_by_name: string;
          updated_at: string;
        };
        Insert: {
          application_id: string;
          rating?: number | null;
          decision?: 'reject' | 'waitlist' | 'accept' | null;
          updated_by_email: string;
          updated_by_name: string;
          updated_at?: string;
        };
        Update: {
          application_id?: string;
          rating?: number | null;
          decision?: 'reject' | 'waitlist' | 'accept' | null;
          updated_by_email?: string;
          updated_by_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_source_settings: {
        Row: {
          id: string;
          spreadsheet_id: string;
          spreadsheet_url: string;
          sheet_name: string;
          sheet_range: string;
          updated_by_email: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          spreadsheet_id: string;
          spreadsheet_url: string;
          sheet_name?: string;
          sheet_range?: string;
          updated_by_email?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          spreadsheet_id?: string;
          spreadsheet_url?: string;
          sheet_name?: string;
          sheet_range?: string;
          updated_by_email?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      review_settings: {
        Row: {
          id: string;
          due_date: string;
          updated_by_email: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          due_date?: string;
          updated_by_email?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          due_date?: string;
          updated_by_email?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
