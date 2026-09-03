-- Extend user_settings to track per-tool auto-approve preferences.
-- Existing columns (default_model, auto_approve) are preserved.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS tool_approvals JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_settings.tool_approvals IS
  'Map of { toolName: bool } controlling per-tool auto-approve. Missing keys default to the tool''s safe default (read-only = true, mutating = false).';
