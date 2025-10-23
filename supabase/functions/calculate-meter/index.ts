// supabase/functions/calculate-meter/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MeterRequest {
  userId: string
}

interface MeterResponse {
  progress: number
  skillLevel: string
  streak: number
  nextLevelAt: number
  completedProtocols: number
  levelUpMessage?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId }: MeterRequest = await req.json()

    if (!userId) {
      throw new Error('Missing userId')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user's current state
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      throw new Error('User not found')
    }

    // Get all completed protocols (ordered by completion date)
    const { data: completedProtocols, error: protocolsError } = await supabaseClient
      .from('protocols')
      .select('*')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })

    if (protocolsError) {
      throw new Error('Failed to fetch protocols')
    }

    const protocols = completedProtocols || []

    // Calculate streak
    const streak = calculateStreak(protocols)

    // Calculate progress
    const completedCount = protocols.length
    const { progress, skillLevel } = calculateProgress(completedCount, streak)

    // Determine next level threshold
    const nextLevelAt = getNextLevelThreshold(progress)

    // Check if user leveled up
    const oldSkillLevel = user.skill_level
    const levelUpMessage = skillLevel !== oldSkillLevel 
      ? `🎉 Level up! You've reached ${skillLevel}!`
      : undefined

    // Update user in database
    const { error: updateError } = await supabaseClient
      .from('users')
      .update({
        rewire_progress: progress,
        current_streak: streak,
        skill_level: skillLevel,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Error updating user:', updateError)
    }

    // Log rewire event if leveled up
    if (levelUpMessage) {
      await supabaseClient
        .from('rewire_events')
        .insert({
          user_id: userId,
          event_type: 'level_up',
          old_value: getLevelValue(oldSkillLevel),
          new_value: getLevelValue(skillLevel)
        })
    }

    const response: MeterResponse = {
      progress,
      skillLevel,
      streak,
      nextLevelAt,
      completedProtocols: completedCount,
      levelUpMessage
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in calculate-meter function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// ============================================
// CORE ALGORITHM: Calculate Progress
// ============================================

function calculateProgress(completedCount: number, streak: number): { progress: number, skillLevel: string } {
  // Base progress: 10 points per completed protocol
  const baseProgress = completedCount * 10

  // Streak bonus: 5 points per day of streak
  // This rewards consistency (neuroplasticity principle!)
  const streakBonus = streak * 5

  // Total raw progress
  const rawProgress = baseProgress + streakBonus

  // Determine skill level based on raw progress
  const skillLevel = determineSkillLevel(rawProgress)

  // Apply skill level multiplier (compound effect of mastery!)
  const multiplier = getSkillMultiplier(skillLevel)
  
  // Final progress (capped at 100%)
  const progress = Math.min(rawProgress * multiplier, 100)

  return { progress, skillLevel }
}

// ============================================
// STREAK CALCULATION
// ============================================

function calculateStreak(protocols: any[]): number {
  if (protocols.length === 0) return 0

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Check if they completed today
  const latestCompletion = new Date(protocols[0].completed_at)
  latestCompletion.setHours(0, 0, 0, 0)

  const daysSinceLatest = Math.floor(
    (today.getTime() - latestCompletion.getTime()) / (1000 * 60 * 60 * 24)
  )

  // If they haven't completed today or yesterday, streak is broken
  if (daysSinceLatest > 1) {
    return 0
  }

  // Count consecutive days backwards
  let currentDate = new Date(today)
  
  // If they completed today, start from today; otherwise yesterday
  if (daysSinceLatest === 1) {
    currentDate.setDate(currentDate.getDate() - 1)
  }

  for (const protocol of protocols) {
    const completionDate = new Date(protocol.completed_at)
    completionDate.setHours(0, 0, 0, 0)

    const daysDiff = Math.floor(
      (currentDate.getTime() - completionDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysDiff === 0) {
      // Completed on this day
      streak++
      currentDate.setDate(currentDate.getDate() - 1)
    } else if (daysDiff > 0) {
      // Gap in streak - stop counting
      break
    }
  }

  return streak
}

// ============================================
// SKILL LEVEL DETERMINATION
// ============================================

function determineSkillLevel(rawProgress: number): string {
  if (rawProgress < 25) return 'foggy'
  if (rawProgress < 50) return 'beginner'
  if (rawProgress < 75) return 'developing'
  if (rawProgress < 100) return 'proficient'
  return 'rewired'
}

function getSkillMultiplier(level: string): number {
  const multipliers: Record<string, number> = {
    'foggy': 0.8,        // Starting out - slow progress
    'beginner': 1.0,     // Normal pace
    'developing': 1.2,   // Building momentum
    'proficient': 1.5,   // Mastery accelerates learning
    'rewired': 2.0       // Compound effect of expertise
  }
  return multipliers[level] || 1.0
}

function getLevelValue(level: string): number {
  const values: Record<string, number> = {
    'foggy': 1,
    'beginner': 2,
    'developing': 3,
    'proficient': 4,
    'rewired': 5
  }
  return values[level] || 1
}

function getNextLevelThreshold(currentProgress: number): number {
  const thresholds = [25, 50, 75, 100]
  
  for (const threshold of thresholds) {
    if (currentProgress < threshold) {
      return threshold
    }
  }
  
  return 100 // Already at max
}