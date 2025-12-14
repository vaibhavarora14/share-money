-- Auto-accept pending invitations on user signup
-- Created: 2025-01-15
--
-- This migration updates the handle_new_user() trigger function to automatically
-- accept pending group invitations when a new user signs up. This ensures that
-- users who were invited to groups before signing up are automatically added
-- to those groups.

-- Update the handle_new_user function to also accept pending invitations
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile for new user
  INSERT INTO public.profiles (id, profile_completed)
  VALUES (NEW.id, FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- Auto-accept pending invitations for this user's email
  -- Use explicit schema prefix and handle errors gracefully
  BEGIN
    PERFORM public.accept_pending_invitations_for_user(NEW.email);
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error but don't fail the trigger (profile creation should still succeed)
      RAISE WARNING 'Error accepting pending invitations for user %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the comment to reflect the new behavior
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile record and accepts pending group invitations when a new user signs up';
