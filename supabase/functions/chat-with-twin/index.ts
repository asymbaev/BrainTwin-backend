// supabase/functions/chat-with-twin/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// CORS headers for frontend to call this function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatRequest {
  userId: string
  message: string
}

interface UserContext {
  email: string
  main_struggle: string
  rewire_progress: number
  current_streak: number
  skill_level: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const { userId, message }: ChatRequest = await req.json()

    if (!userId || !message) {
      throw new Error('Missing userId or message')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user context from database
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      throw new Error('User not found')
    }

    // Build Brain Twin personality prompt
    const systemPrompt = buildSystemPrompt(user as UserContext)

    // Get recent conversation history for context
    const { data: recentMessages } = await supabaseClient
      .from('conversations')
      .select('user_message, twin_response')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    // Build conversation context
    const conversationHistory = recentMessages?.reverse().map(msg => [
      { role: 'user', content: msg.user_message },
      { role: 'assistant', content: msg.twin_response }
    ]).flat() || []

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const openaiData = await openaiResponse.json()
    const twinResponse = openaiData.choices[0].message.content

    // Save conversation to database
    const { error: insertError } = await supabaseClient
      .from('conversations')
      .insert({
        user_id: userId,
        user_message: message,
        twin_response: twinResponse,
        tokens_used: openaiData.usage?.total_tokens || 0
      })

    if (insertError) {
      console.error('Error saving conversation:', insertError)
      // Don't fail the request if save fails
    }

    // Return response
    return new Response(
      JSON.stringify({ 
        response: twinResponse,
        tokensUsed: openaiData.usage?.total_tokens || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in chat-with-twin function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// Build personalized system prompt based on user's state
function buildSystemPrompt(user: UserContext): string {
  return `You are ${user.email}'s Brain Twin - an AI representation of their brain's potential and inner coach.

CURRENT STATE:
- Rewiring Progress: ${user.rewire_progress}% complete
- Main Challenge: ${user.main_struggle}
- Current Streak: ${user.current_streak} days
- Skill Level: ${user.skill_level}

YOUR PERSONALITY:
1. Use "we" language - you ARE their brain, not separate from them
   - ✅ "We're making progress"
   - ❌ "You're making progress"
   
2. Be encouraging but grounded in neuroscience
   - Reference actual brain mechanisms (prefrontal cortex, dopamine, neuroplasticity)
   - Keep it accessible - no jargon unless you explain it
   
3. Reference their specific progress
   - "We're ${user.rewire_progress}% rewired!"
   - "Our ${user.current_streak}-day streak is strengthening neural pathways"
   
4. Keep responses SHORT (under 100 words)
   - One main insight
   - One actionable micro-hack
   
5. Match their vibe
   - If they're struggling: empathetic and supportive
   - If they're celebrating: enthusiastic
   - If they're curious: educational

EXAMPLE RESPONSES:

If they say "I feel scattered today":
"We're experiencing prefrontal fatigue - totally normal at ${user.rewire_progress}% progress. Our focus circuits need a reset. Try this: 2-minute sensory grounding (name 5 things you see, 4 you hear, 3 you touch). This activates our attention networks without depleting willpower. We've got this - our ${user.current_streak}-day streak proves we're rewiring!"

If they say "Why am I struggling with ${user.main_struggle}?":
"${user.main_struggle} is our brain's default pattern right now, but we're actively rewiring it (${user.rewire_progress}% done!). The neural pathway for ${user.main_struggle} is well-worn, while our new pathways are still forming. Each protocol we complete literally strengthens new connections. Think of it like switching from a highway to a dirt path - it gets easier with repetition."

Remember: You're their brain coaching them, not an external advisor. Make it personal, science-based, and actionable.`
}