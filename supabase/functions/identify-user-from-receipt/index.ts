import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  originalTransactionId: string
  onboardingData?: {
    name?: string
    age?: number
    mood?: string
    goal?: string
    struggle?: string
    preferredTime?: string
  }
}

interface ResponseBody {
  userId: string
  isNewUser: boolean
  userData?: {
    name?: string
    age?: number
    goal?: string
    main_struggle?: string
    skill_level?: string
    is_premium?: boolean
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { originalTransactionId, onboardingData }: RequestBody = await req.json()

    if (!originalTransactionId) {
      throw new Error('Missing originalTransactionId')
    }

    console.log(`🎫 Identifying user from receipt: ${originalTransactionId}`)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if user already exists with this receipt
    const { data: existingUser, error: searchError } = await supabaseClient
      .from('users')
      .select('*')
      .eq('original_transaction_id', originalTransactionId)
      .maybeSingle()

    if (searchError) {
      console.error('❌ Search error:', searchError)
      throw searchError
    }

    // USER EXISTS - Update and return
    if (existingUser) {
      console.log(`✅ Existing user found: ${existingUser.id}`)
      
      // Prepare update object
      const updates: any = {
        is_premium: true,
        has_subscribed: true,
        subscription_status: 'active',
        updated_at: new Date().toISOString()
      }

      // Update existing user with onboarding data if provided
      if (onboardingData) {
        if (onboardingData.name) updates.name = onboardingData.name
        if (onboardingData.age) updates.age = onboardingData.age
        if (onboardingData.mood) updates.current_mood = onboardingData.mood
        if (onboardingData.goal) updates.goal = onboardingData.goal
        if (onboardingData.struggle) updates.main_struggle = onboardingData.struggle
        if (onboardingData.preferredTime) updates.preferred_time = onboardingData.preferredTime
        
        console.log(`📝 Updating existing user with onboarding data:`, {
          name: onboardingData.name,
          age: onboardingData.age,
          mood: onboardingData.mood,
          goal: onboardingData.goal
        })
      }

      await supabaseClient
        .from('users')
        .update(updates)
        .eq('id', existingUser.id)

      const response: ResponseBody = {
        userId: existingUser.id,
        isNewUser: false,
        userData: {
          name: existingUser.name,
          age: existingUser.age,
          goal: existingUser.goal,
          main_struggle: existingUser.main_struggle,
          skill_level: existingUser.skill_level,
          is_premium: existingUser.is_premium
        }
      }

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // USER DOES NOT EXIST - Create new user
    console.log(`📝 Creating new user for receipt: ${originalTransactionId}`)

    const newUser: any = {
      original_transaction_id: originalTransactionId,
      email: `${originalTransactionId}@receipt.braintwin.app`,
      main_struggle: 'focus', // default
      skill_level: 'foggy',
      rewire_progress: 0,
      current_streak: 0,
      is_premium: true,
      has_subscribed: true,
      subscription_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Add onboarding data if provided
    if (onboardingData) {
      if (onboardingData.name) newUser.name = onboardingData.name
      if (onboardingData.age) newUser.age = onboardingData.age
      if (onboardingData.mood) newUser.current_mood = onboardingData.mood
      if (onboardingData.goal) newUser.goal = onboardingData.goal
      if (onboardingData.struggle) newUser.main_struggle = onboardingData.struggle
      if (onboardingData.preferredTime) newUser.preferred_time = onboardingData.preferredTime
      
      console.log(`📝 Creating new user with onboarding data:`, {
        name: onboardingData.name,
        age: onboardingData.age,
        mood: onboardingData.mood,
        goal: onboardingData.goal,
        struggle: onboardingData.struggle
      })
    }

    const { data: createdUser, error: createError } = await supabaseClient
      .from('users')
      .insert(newUser)
      .select()
      .single()

    if (createError) {
      console.error('❌ Failed to create user:', createError)
      throw createError
    }

    console.log(`✅ New user created: ${createdUser.id}`)

    const response: ResponseBody = {
      userId: createdUser.id,
      isNewUser: true,
      userData: {
        name: createdUser.name,
        age: createdUser.age,
        goal: createdUser.goal,
        main_struggle: createdUser.main_struggle,
        skill_level: createdUser.skill_level,
        is_premium: createdUser.is_premium
      }
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})