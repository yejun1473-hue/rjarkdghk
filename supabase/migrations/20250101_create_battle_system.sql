-- Create the battles table
CREATE TABLE IF NOT EXISTS public.battles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player2_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    player1_nickname TEXT NOT NULL,
    player2_nickname TEXT,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
    current_turn TEXT,
    winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_battles_status ON public.battles(status);
CREATE INDEX IF NOT EXISTS idx_battles_player1_id ON public.battles(player1_id);
CREATE INDEX IF NOT EXISTS idx_battles_player2_id ON public.battles(player2_id);

-- Create RPC function to create battle table if not exists
CREATE OR REPLACE FUNCTION public.create_battle_table_if_not_exists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Table is already created above, so we just return success
    RETURN;
END;
$$;

-- Create RPC function to directly create battle table
CREATE OR REPLACE FUNCTION public.create_battle_table_directly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This function is kept for backward compatibility
    -- The table is now created by the migration
    RETURN;
END;
$$;

-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_battles_updated_at ON public.battles;
CREATE TRIGGER update_battles_updated_at
BEFORE UPDATE ON public.battles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security on battles table
ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own battles
CREATE POLICY "사용자 본인의 배틀만 읽기"
ON public.battles
FOR SELECT
USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Policy to allow users to update their own battles
CREATE POLICY "사용자 본인의 배틀만 업데이트"
ON public.battles
FOR UPDATE
USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Policy to allow users to insert new battles
CREATE POLICY "사용자 배틀 생성 가능"
ON public.battles
FOR INSERT
WITH CHECK (auth.uid() = player1_id);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.battles TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_battle_table_if_not_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_battle_table_directly() TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.battles IS 'Stores information about battles between players';
COMMENT ON COLUMN public.battles.status IS 'Current status of the battle: waiting, in_progress, completed, cancelled';
COMMENT ON COLUMN public.battles.current_turn IS 'ID of the player whose turn it is';
COMMENT ON COLUMN public.battles.winner_id IS 'ID of the winning player, if the battle is completed';

-- Notify that the setup is complete
NOTICE 'Battle system database setup completed successfully';
